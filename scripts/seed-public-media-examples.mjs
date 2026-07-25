#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // CI may inject environment variables directly.
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

async function uploadJpeg(db, bucket, path, localPath) {
  const file = readFileSync(localPath);
  const { error } = await db.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) {
    throw error;
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const db = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  const requestedPartnerId = process.argv[2]?.trim();
  let partnerQuery = db.from("partners").select("id,name");
  partnerQuery = requestedPartnerId
    ? partnerQuery.eq("id", requestedPartnerId)
    : partnerQuery.eq("name", "강남 셀프정비소");

  const { data: partner, error: partnerError } =
    await partnerQuery.maybeSingle();
  if (partnerError || !partner) {
    throw partnerError ?? new Error("예시 이미지를 등록할 정비소가 없습니다.");
  }

  const sampleRoot = resolve(process.cwd(), "public/images/sample-media");
  const partnerFiles = [
    "garage-exterior.jpg",
    "garage-lift-bay.jpg",
    "garage-tools.jpg",
  ];
  const partnerPaths = partnerFiles.map(
    (fileName) => `${partner.id}/sample-${fileName}`,
  );

  for (let index = 0; index < partnerFiles.length; index += 1) {
    await uploadJpeg(
      db,
      "partner-images",
      partnerPaths[index],
      resolve(sampleRoot, partnerFiles[index]),
    );
  }

  const { data: existingPartnerImages, error: partnerImageLookupError } =
    await db
      .from("partner_images")
      .select("id,storage_path,sort_order,is_cover")
      .eq("partner_id", partner.id)
      .order("sort_order", { ascending: true });

  if (partnerImageLookupError) {
    throw partnerImageLookupError;
  }

  const byPath = new Map(
    (existingPartnerImages ?? []).map((image) => [image.storage_path, image]),
  );
  let nextSortOrder =
    (existingPartnerImages ?? []).reduce(
      (maximum, image) => Math.max(maximum, image.sort_order),
      -1,
    ) + 1;

  for (const storagePath of partnerPaths) {
    if (byPath.has(storagePath)) {
      continue;
    }

    const { error } = await db.from("partner_images").insert({
      partner_id: partner.id,
      storage_path: storagePath,
      sort_order: nextSortOrder,
      is_cover: false,
      created_by: null,
    });
    if (error) {
      throw error;
    }
    nextSortOrder += 1;
  }

  const { error: clearCoverError } = await db
    .from("partner_images")
    .update({ is_cover: false })
    .eq("partner_id", partner.id)
    .eq("is_cover", true);
  if (clearCoverError) {
    throw clearCoverError;
  }

  const { error: setCoverError } = await db
    .from("partner_images")
    .update({ is_cover: true })
    .eq("partner_id", partner.id)
    .eq("storage_path", partnerPaths[0]);
  if (setCoverError) {
    throw setCoverError;
  }

  const { data: reviews, error: reviewError } = await db
    .from("reviews")
    .select("id")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(2);
  if (reviewError) {
    throw reviewError;
  }

  const reviewFiles = ["review-oil-change.jpg", "review-tire-rotation.jpg"];
  const reviewAssignments = (reviews ?? []).map((review, index) => ({
    reviewId: review.id,
    localPath: resolve(sampleRoot, reviewFiles[index]),
    storagePath: `samples/${partner.id}/sample-${reviewFiles[index]}`,
  }));
  let linkedReviewImageCount = 0;

  for (const assignment of reviewAssignments) {
    const { data: existingImage, error: existingImageError } = await db
      .from("review_images")
      .select("id")
      .eq("storage_path", assignment.storagePath)
      .maybeSingle();
    if (existingImageError) {
      throw existingImageError;
    }

    if (existingImage) {
      linkedReviewImageCount += 1;
      continue;
    }

    const { count, error: countError } = await db
      .from("review_images")
      .select("id", { count: "exact", head: true })
      .eq("review_id", assignment.reviewId);
    if (countError) {
      throw countError;
    }
    if ((count ?? 0) >= 4) {
      console.log(
        `- 리뷰 ${assignment.reviewId}: 이미 사진이 4장이어서 예시 추가를 건너뜀`,
      );
      continue;
    }

    await uploadJpeg(
      db,
      "review-images",
      assignment.storagePath,
      assignment.localPath,
    );

    const { error: insertError } = await db.from("review_images").insert({
      review_id: assignment.reviewId,
      storage_path: assignment.storagePath,
      sort_order: count ?? 0,
    });
    if (insertError) {
      throw insertError;
    }
    linkedReviewImageCount += 1;
  }

  console.log(`✓ ${partner.name}: 정비소 예시 사진 ${partnerPaths.length}장`);
  console.log(
    `✓ 사진 리뷰 예시 ${linkedReviewImageCount}장 연결 (${reviewAssignments
      .map((assignment) => basename(assignment.localPath))
      .join(", ")})`,
  );
  console.log("✓ 외관 사진을 홈 대표 이미지로 지정");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

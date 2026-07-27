#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    // CI and production-like shells can provide environment variables directly.
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function formatKst(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

if (process.env.PITNOW_QA_CONFIRM !== "YES") {
  throw new Error(
    "운영 데이터 변경 방지를 위해 PITNOW_QA_CONFIRM=YES가 필요합니다.",
  );
}

const reservationId = requireEnv("PITNOW_QA_RESERVATION_ID");
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: reservation, error: lookupError } = await admin
  .from("reservations")
  .select(
    "id,status,start_time,end_time,reserved_end_time,blocked_until,partner_id,bay_id",
  )
  .eq("id", reservationId)
  .single();

if (lookupError || !reservation) {
  throw new Error(
    `예약 조회 실패: ${lookupError?.message ?? "예약을 찾을 수 없습니다."}`,
  );
}

if (reservation.status !== "CONFIRMED") {
  throw new Error(
    `CONFIRMED 예약만 이동할 수 있습니다. 현재 상태: ${reservation.status}`,
  );
}

const originalStartMs = new Date(reservation.start_time).getTime();
const originalEndMs = new Date(reservation.end_time).getTime();
const originalBlockedUntilMs = new Date(
  reservation.blocked_until ?? reservation.end_time,
).getTime();
const durationMs = originalEndMs - originalStartMs;
const bufferMs = Math.max(0, originalBlockedUntilMs - originalEndMs);

if (!Number.isFinite(durationMs) || durationMs <= 0) {
  throw new Error("예약의 시작/종료 시각이 올바르지 않습니다.");
}

const newStart = new Date(Date.now() + 10 * 60 * 1000);
newStart.setSeconds(0, 0);
const newEnd = new Date(newStart.getTime() + durationMs);
const newBlockedUntil = new Date(newEnd.getTime() + bufferMs);

const { data: updated, error: updateError } = await admin
  .from("reservations")
  .update({
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
    reserved_end_time: newEnd.toISOString(),
    blocked_until: newBlockedUntil.toISOString(),
  })
  .eq("id", reservationId)
  .eq("status", "CONFIRMED")
  .select("id,start_time,end_time,blocked_until")
  .single();

if (updateError || !updated) {
  const conflictHint =
    updateError?.code === "23P01"
      ? " 같은 베이에 겹치는 예약이 있습니다. 다른 예약을 지정하거나 충돌 예약을 정리하세요."
      : "";
  throw new Error(
    `예약 시간 이동 실패: ${updateError?.message ?? "알 수 없는 오류"}${conflictHint}`,
  );
}

console.log("✓ QA 체크인 가능 시간으로 예약을 이동했습니다.");
console.log(`  예약 ID: ${updated.id}`);
console.log(`  예약 시간: ${formatKst(updated.start_time)} ~ ${formatKst(updated.end_time)}`);
console.log(`  체크인 오픈: 즉시 (예약 시작 10분 전으로 이동)`);
console.log(`  베이 점유 종료: ${formatKst(updated.blocked_until)}`);

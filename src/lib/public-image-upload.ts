import { authFetch } from "@/src/lib/auth-fetch";
import { normalizeReservationImage } from "@/src/lib/heic-image";

interface UploadedImage {
  path: string;
  url: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
    };

    if (typeof payload.error === "string") {
      return payload.error;
    }

    return payload.error?.message ?? "이미지를 업로드하지 못했습니다.";
  } catch {
    return "이미지를 업로드하지 못했습니다.";
  }
}

export async function uploadPublicImage(params: {
  endpoint: string;
  file: File;
  fields: Record<string, string>;
}): Promise<UploadedImage> {
  const normalized = await normalizeReservationImage(params.file);
  const formData = new FormData();
  formData.set("file", normalized);

  for (const [key, value] of Object.entries(params.fields)) {
    formData.set(key, value);
  }

  const response = await authFetch(params.endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const payload = (await response.json()) as {
    image?: { path?: string; url?: string };
  };

  if (!payload.image?.path || !payload.image.url) {
    throw new Error("업로드된 이미지 정보를 확인하지 못했습니다.");
  }

  return {
    path: payload.image.path,
    url: payload.image.url,
  };
}

export async function deletePublicImage(params: {
  endpoint: string;
  body: Record<string, string>;
}): Promise<void> {
  const response = await authFetch(params.endpoint, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.body),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

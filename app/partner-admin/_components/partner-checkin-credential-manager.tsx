"use client";

import {
  Check,
  Clipboard,
  Download,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";

interface Credential {
  qrValue: string;
  manualCode: string;
  rotatedAt: string;
}

interface CredentialResponse {
  success?: boolean;
  credential?: Credential;
}

export function PartnerCheckinCredentialManager({
  partnerId,
  partnerName,
}: {
  partnerId: string;
  partnerName: string;
}) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRotating, setIsRotating] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const response = await authFetch(
          `/api/partner-admin/checkin-credentials?partnerId=${encodeURIComponent(partnerId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as CredentialResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || !payload.success || !payload.credential) {
          setError(
            extractApiErrorMessage(
              payload,
              "체크인 인증정보를 불러오지 못했습니다.",
            ),
          );
          return;
        }

        setCredential(payload.credential);
      } catch {
        if (!cancelled) {
          setError("체크인 인증정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  useEffect(() => {
    let cancelled = false;

    if (!credential) {
      setQrDataUrl("");
      return;
    }

    void QRCode.toDataURL(credential.qrValue, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((value) => {
      if (!cancelled) {
        setQrDataUrl(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [credential]);

  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setCopyMessage(message);
    window.setTimeout(() => setCopyMessage(""), 2200);
  }

  async function rotate() {
    if (
      isRotating ||
      !window.confirm(
        "인증정보를 재발급하면 기존 QR과 수동 코드는 즉시 사용할 수 없습니다. 계속할까요?",
      )
    ) {
      return;
    }

    setIsRotating(true);
    setError("");

    try {
      const response = await authFetch(
        "/api/partner-admin/checkin-credentials",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId }),
        },
      );
      const payload = (await response.json()) as CredentialResponse;

      if (!response.ok || !payload.success || !payload.credential) {
        setError(
          extractApiErrorMessage(payload, "인증정보를 재발급하지 못했습니다."),
        );
        return;
      }

      setCredential(payload.credential);
      setCopyMessage("새 인증정보를 발급했습니다.");
    } catch {
      setError("인증정보 재발급 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsRotating(false);
    }
  }

  return (
    <section
      id="checkin-credential"
      className="scroll-mt-24 rounded-lg border border-slate-200 bg-white"
    >
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">현장 체크인 인증</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            고객이 도착하면 QR을 스캔하거나 수동 코드를 입력합니다. 출력물은
            고객이 쉽게 볼 수 있는 접수 공간에 비치하세요.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
          <ShieldCheck size={14} />
          정비소 전용
        </span>
      </header>

      <div className="p-5">
        {isLoading ? (
          <div className="flex h-44 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <LoaderCircle size={18} className="animate-spin" />
            인증정보를 불러오는 중
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : credential ? (
          <div className="grid grid-cols-[220px_1fr] gap-6">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`${partnerName} 체크인 QR`}
                  className="aspect-square w-full"
                />
              ) : (
                <div className="aspect-square w-full animate-pulse bg-slate-100" />
              )}
            </div>

            <div className="flex min-w-0 flex-col justify-center">
              <p className="text-xs font-bold uppercase text-slate-500">
                수동 체크인 코드
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-2xl font-black tracking-wider text-slate-950">
                  {credential.manualCode}
                </code>
                <button
                  type="button"
                  title="수동 코드 복사"
                  onClick={() =>
                    void copy(credential.manualCode, "수동 코드를 복사했습니다.")
                  }
                  className="grid size-11 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Clipboard size={18} />
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                마지막 발급:{" "}
                {new Intl.DateTimeFormat("ko-KR", {
                  timeZone: "Asia/Seoul",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(credential.rotatedAt))}
              </p>

              <div className="mt-5 flex gap-2">
                <a
                  href={qrDataUrl}
                  download={`pitnow-${partnerName}-checkin-qr.png`}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white"
                >
                  <Download size={16} />
                  QR 이미지 저장
                </a>
                <button
                  type="button"
                  disabled={isRotating}
                  onClick={() => void rotate()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    size={16}
                    className={isRotating ? "animate-spin" : ""}
                  />
                  재발급
                </button>
              </div>
              {copyMessage ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <Check size={14} />
                  {copyMessage}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

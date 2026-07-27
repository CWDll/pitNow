"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, CheckCircle2, Keyboard, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";

type VerificationMethod = "QR" | "MANUAL_CODE";

interface VerificationResponse {
  success?: boolean;
  requiresPhotos?: boolean;
  status?: string;
}

interface PartnerArrivalVerificationProps {
  disabled: boolean;
  reservationId: string;
  verified: boolean;
  onVerified: (result: {
    method: VerificationMethod;
    requiresPhotos: boolean;
    status: string;
  }) => void;
}

export function PartnerArrivalVerification({
  disabled,
  reservationId,
  verified,
  onVerified,
}: PartnerArrivalVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [mode, setMode] = useState<VerificationMethod>("QR");
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }

  async function verify(method: VerificationMethod, credential: string) {
    if (isVerifying || !credential.trim()) {
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await authFetch("/api/checkin/verify-partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, method, credential }),
      });
      const payload = (await response.json()) as VerificationResponse;

      if (!response.ok || !payload.success) {
        setError(
          extractApiErrorMessage(
            payload,
            "정비소 도착 인증에 실패했습니다.",
          ),
        );
        return;
      }

      stopScanner();
      onVerified({
        method,
        requiresPhotos: payload.requiresPhotos === true,
        status: payload.status ?? "CONFIRMED",
      });
    } catch {
      setError("정비소 도착 인증 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function startScanner() {
    if (disabled || isScanning || !videoRef.current) {
      return;
    }

    setError("");
    setIsScanning(true);

    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            void verify("QR", result.getText());
          }
        },
      );
    } catch {
      setIsScanning(false);
      setError(
        "카메라를 열 수 없습니다. 브라우저 카메라 권한을 확인하거나 수동 코드를 입력해 주세요.",
      );
    }
  }

  if (verified) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3 text-emerald-800">
          <CheckCircle2 size={22} />
          <div>
            <h2 className="font-bold">정비소 도착 인증 완료</h2>
            <p className="mt-0.5 text-sm text-emerald-700">
              예약한 정비소의 인증정보와 일치합니다.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-950">정비소 도착 인증</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          현장에 비치된 QR을 스캔하거나 안내된 체크인 코드를 입력하세요.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("QR");
            setError("");
          }}
          className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${
            mode === "QR"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-600"
          }`}
        >
          <Camera size={17} />
          QR 스캔
        </button>
        <button
          type="button"
          onClick={() => {
            stopScanner();
            setMode("MANUAL_CODE");
            setError("");
          }}
          className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${
            mode === "MANUAL_CODE"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-600"
          }`}
        >
          <Keyboard size={17} />
          코드 입력
        </button>
      </div>

      {mode === "QR" ? (
        <div className="mt-4">
          <div className="relative overflow-hidden rounded-lg bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[4/3] w-full object-cover"
            />
            {!isScanning ? (
              <div className="absolute inset-0 grid place-items-center bg-slate-900 text-white">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void startScanner()}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold disabled:bg-slate-500"
                >
                  <Camera size={18} />
                  카메라 열기
                </button>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/80" />
            )}
          </div>
          {isScanning ? (
            <button
              type="button"
              onClick={stopScanner}
              className="mt-3 h-10 w-full rounded-lg border border-slate-300 text-sm font-bold text-slate-700"
            >
              카메라 닫기
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <label
            htmlFor="partner-checkin-code"
            className="text-sm font-bold text-slate-800"
          >
            체크인 코드
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="partner-checkin-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.toUpperCase())}
              placeholder="PIT-AB12-CD34"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 font-mono text-base font-bold uppercase outline-none ring-blue-200 focus:ring-4"
            />
            <button
              type="button"
              disabled={disabled || isVerifying || !manualCode.trim()}
              onClick={() => void verify("MANUAL_CODE", manualCode)}
              className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:bg-slate-300"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {isVerifying ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-blue-700">
          <LoaderCircle size={16} className="animate-spin" />
          정비소 정보를 확인하고 있습니다.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

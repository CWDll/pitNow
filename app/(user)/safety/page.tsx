"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

const safetyChecklist = [
  "금지 작업(연디코팅, 용접 등)을 수행하지 않겠습니다.",
  "리프트 및 장비 사용 시 안전 수칙을 준수하겠습니다.",
  "폐유/폐기물은 지정된 수거함에 처리하겠습니다.",
  "정비 중 발생한 사고에 대해 본인 책임임을 확인합니다.",
];

export default function SafetyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isVideoWatched, setIsVideoWatched] = useState<boolean>(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [hasSigned, setHasSigned] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const canProceed = isVideoWatched && checks.every(Boolean) && hasSigned;

  const forwardQuery = useMemo(() => {
    const query = new URLSearchParams();
    const keys = [
      "partnerId",
      "garageName",
      "workId",
      "dateLabel",
      "bayLabel",
      "bayId",
      "startTime",
      "endTime",
      "totalPrice",
    ];

    keys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        query.set(key, value);
      }
    });

    return query.toString();
  }, [searchParams]);

  function drawAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function startDraw(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    setIsDrawing(true);
    setHasSigned(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function endDraw() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    setIsDrawing(false);
    ctx.beginPath();
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">안전 동의</h1>
      </header>

      <div className="mb-5">
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">안전 교육 영상</h2>
        <button
          type="button"
          onClick={() => setIsVideoWatched(true)}
          className="flex h-44 w-full items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500"
        >
          {isVideoWatched ? "시청 완료" : "클릭하여 시청"}
        </button>
      </div>

      <div className="mb-5 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900">안전 체크리스트</h2>
        {safetyChecklist.map((label, index) => (
          <label key={label} className="flex items-start gap-3 text-lg text-zinc-800">
            <input
              type="checkbox"
              checked={checks[index]}
              onChange={() => {
                setChecks((prev) => {
                  const next = [...prev];
                  next[index] = !next[index];
                  return next;
                });
              }}
              className="mt-1 h-5 w-5"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">전자서명</h2>
        <canvas
          ref={canvasRef}
          width={390}
          height={120}
          className="w-full rounded-2xl border border-zinc-300 bg-white"
          onPointerDown={(event) => startDraw(event.clientX, event.clientY)}
          onPointerMove={(event) => {
            if (isDrawing) {
              drawAt(event.clientX, event.clientY);
            }
          }}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
        <p className="mt-2 text-sm text-zinc-500">위 영역에 서명해주세요</p>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => router.push(`/payment?${forwardQuery}`)}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          동의하고 결제
        </button>
      </div>
    </section>
  );
}

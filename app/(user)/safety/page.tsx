"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PointerEvent, Suspense, useMemo, useRef, useState } from "react";

const safetyChecklist = [
  "리프트와 장비 사용 전 주의사항을 숙지합니다.",
  "화재 위험 작업과 위험물 반입은 하지 않습니다.",
  "폐유와 폐기물은 지정된 수거함에 처리합니다.",
  "작업 중 발생하는 사고 책임 범위를 확인했습니다.",
];

function SafetyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isVideoWatched, setIsVideoWatched] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [hasSigned, setHasSigned] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canProceed = isVideoWatched && checks.every(Boolean) && hasSigned;

  const forwardQuery = useMemo(() => {
    const query = new URLSearchParams();
    [
      "reservationType",
      "partnerId",
      "garageName",
      "workId",
      "workTitle",
      "carId",
      "carLabel",
      "dateLabel",
      "bayLabel",
      "bayId",
      "startTime",
      "endTime",
      "totalPrice",
      "blockedMinutes",
    ].forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        query.set(key, value);
      }
    });

    return query.toString();
  }, [searchParams]);

  function drawAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function startDraw(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    setIsDrawing(true);
    setHasSigned(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function endDraw() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }

    setIsDrawing(false);
    ctx.beginPath();
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    startDraw(event.clientX, event.clientY);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (isDrawing) {
      drawAt(event.clientX, event.clientY);
    }
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
          {isVideoWatched ? "시청 완료" : "탭하여 시청 완료 처리"}
        </button>
      </div>

      <div className="mb-5 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900">안전 체크리스트</h2>
        {safetyChecklist.map((label, index) => (
          <label key={label} className="flex items-start gap-3 text-lg text-zinc-800">
            <input
              type="checkbox"
              checked={checks[index]}
              onChange={() =>
                setChecks((prev) => {
                  const next = [...prev];
                  next[index] = !next[index];
                  return next;
                })
              }
              className="mt-1 h-5 w-5"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">전자 서명</h2>
        <canvas
          ref={canvasRef}
          width={390}
          height={120}
          className="w-full rounded-2xl border border-zinc-300 bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
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

export default function SafetyPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <SafetyPageContent />
    </Suspense>
  );
}

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
  const [agreeOnlySelectedTasks, setAgreeOnlySelectedTasks] =
    useState<boolean>(false);
  const [consentMethod, setConsentMethod] = useState<"CHECKBOX" | "SIGNATURE">(
    "CHECKBOX",
  );
  const [checkboxConsentConfirmed, setCheckboxConsentConfirmed] =
    useState<boolean>(false);
  const [hasSigned, setHasSigned] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const taskLabels = searchParams.get("taskLabels") ?? "선택 작업 없음";
  const selectedTaskCount = searchParams.get("selectedTaskCount") ?? "0";

  const consentValid =
    consentMethod === "CHECKBOX" ? checkboxConsentConfirmed : hasSigned;

  const canProceed =
    isVideoWatched &&
    checks.every(Boolean) &&
    agreeOnlySelectedTasks &&
    consentValid;

  const forwardQuery = useMemo(() => {
    const query = new URLSearchParams();
    const keys = [
      "bookingMode",
      "partnerId",
      "garageName",
      "taskIds",
      "taskLabels",
      "selectedTaskCount",
      "packageId",
      "packageTitle",
      "carId",
      "carLabel",
      "dateLabel",
      "bayLabel",
      "bayId",
      "startTime",
      "endTime",
      "totalPrice",
      "helperVerifyRequested",
      "helperVerifyFee",
    ];

    keys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        query.set(key, value);
      }
    });

    return query.toString();
  }, [searchParams]);

  function buildNextQueryString() {
    const query = new URLSearchParams(forwardQuery);
    query.set("agreeOnlySelectedTasks", String(agreeOnlySelectedTasks));
    query.set("consentMethod", consentMethod);

    if (consentMethod === "SIGNATURE") {
      const signatureDataUrl = canvasRef.current?.toDataURL("image/png") ?? "";
      query.set(
        "signatureImageUrl",
        signatureDataUrl || `mock://signature/${Date.now()}`,
      );
    }

    return query.toString();
  }

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
        <button
          type="button"
          onClick={() => router.back()}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">안전 동의</h1>
      </header>

      <div className="mb-5">
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">
          안전 교육 영상
        </h2>
        <button
          type="button"
          onClick={() => setIsVideoWatched(true)}
          className="flex h-44 w-full items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500"
        >
          {isVideoWatched ? "시청 완료" : "탭하여 시청 완료 처리"}
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">
          선택 작업 한정 동의
        </h2>
        <p className="mt-2 text-sm text-zinc-700">선택 작업: {taskLabels}</p>
        <p className="mt-1 text-sm text-zinc-700">
          선택 개수: {selectedTaskCount}개
        </p>
        <label className="mt-3 flex items-start gap-3 text-base text-zinc-800">
          <input
            type="checkbox"
            checked={agreeOnlySelectedTasks}
            onChange={() => setAgreeOnlySelectedTasks((prev) => !prev)}
            className="mt-1 h-5 w-5"
          />
          <span>
            위에서 선택한 작업만 수행하고, 그 외 작업은 진행하지 않겠습니다.
          </span>
        </label>
      </div>

      <div className="mb-5 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900">안전 체크리스트</h2>
        {safetyChecklist.map((label, index) => (
          <label
            key={label}
            className="flex items-start gap-3 text-lg text-zinc-800"
          >
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
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">동의 방식</h2>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConsentMethod("CHECKBOX")}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              consentMethod === "CHECKBOX"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            체크박스 동의
          </button>
          <button
            type="button"
            onClick={() => setConsentMethod("SIGNATURE")}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              consentMethod === "SIGNATURE"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            서명 동의
          </button>
        </div>

        {consentMethod === "CHECKBOX" ? (
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-base text-zinc-800">
            <input
              type="checkbox"
              checked={checkboxConsentConfirmed}
              onChange={() => setCheckboxConsentConfirmed((prev) => !prev)}
              className="mt-1 h-5 w-5"
            />
            <span>선택 작업 한정 동의 내용을 확인했으며 이에 동의합니다.</span>
          </label>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => router.push(`/payment?${buildNextQueryString()}`)}
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

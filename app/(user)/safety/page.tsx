"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, PlayCircle, ShieldCheck } from "lucide-react";

import { FlowHeader } from "../_components/mobile-ui";
import type {
  SelfMaintenanceCatalog,
  SelfSafetyContent,
} from "@/src/domain/self-maintenance";
import { authFetch } from "@/src/lib/auth-fetch";

const agreementText =
  "위에서 선택한 작업만 수행하며, 예약하지 않은 작업은 진행하지 않습니다. 예약하지 않은 작업을 수행하거나 추가 분해를 하는 경우 정비사 작업 확인이 제한될 수 있습니다.";

interface CatalogResponse {
  success: boolean;
  catalog?: SelfMaintenanceCatalog;
}

interface TrainingResponse {
  success: boolean;
  completed?: boolean;
}

function SafetyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<SelfMaintenanceCatalog | null>(null);
  const [commonTrainingCompleted, setCommonTrainingCompleted] =
    useState<boolean | null>(null);
  const [confirmedContentIds, setConfirmedContentIds] = useState<string[]>([]);
  const [agreeOnlySelectedTasks, setAgreeOnlySelectedTasks] = useState(false);
  const [finalConsentConfirmed, setFinalConsentConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const partnerId = searchParams.get("partnerId") ?? "";
  const taskCodes = useMemo(
    () =>
      (searchParams.get("taskIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams],
  );
  const taskLabels = searchParams.get("taskLabels") ?? "선택 작업 없음";

  const selectedTasks = useMemo(
    () =>
      (catalog?.tasks ?? []).filter((task) => taskCodes.includes(task.code)),
    [catalog, taskCodes],
  );
  const taskSafetyContents = useMemo(
    () => selectedTasks.flatMap((task) => task.safetyContents),
    [selectedTasks],
  );
  const requiredContentIds = taskSafetyContents
    .filter((content) => content.isRequired)
    .map((content) => content.id);
  const allContentsConfirmed = requiredContentIds.every((id) =>
    confirmedContentIds.includes(id),
  );
  const canProceed =
    commonTrainingCompleted === true &&
    selectedTasks.length === taskCodes.length &&
    requiredContentIds.length > 0 &&
    allContentsConfirmed &&
    agreeOnlySelectedTasks &&
    finalConsentConfirmed;

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
      "workCheckTaskIds",
      "workCheckTaskLabels",
    ];
    keys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        query.set(key, value);
      }
    });
    return query.toString();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadSafetyData() {
      try {
        const [catalogResponse, trainingResponse] = await Promise.all([
          fetch(
            `/api/self-maintenance-catalog?partnerId=${encodeURIComponent(partnerId)}`,
            { cache: "no-store" },
          ),
          authFetch("/api/self-safety-training", { cache: "no-store" }),
        ]);
        const catalogPayload = (await catalogResponse.json()) as CatalogResponse;
        const trainingPayload =
          (await trainingResponse.json()) as TrainingResponse;

        if (
          !catalogResponse.ok ||
          !catalogPayload.success ||
          !catalogPayload.catalog
        ) {
          throw new Error("작업별 안전수칙을 불러오지 못했습니다.");
        }

        if (!cancelled) {
          setCatalog(catalogPayload.catalog);
          setCommonTrainingCompleted(
            trainingResponse.ok &&
              trainingPayload.success &&
              trainingPayload.completed === true,
          );
        }
      } catch (error) {
        console.error("SAFETY DATA LOAD ERROR:", error);
        if (!cancelled) {
          setErrorMessage("안전 동의 정보를 불러오지 못했습니다.");
          setCommonTrainingCompleted(false);
        }
      }
    }

    void loadSafetyData();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  function toggleContent(content: SelfSafetyContent) {
    setConfirmedContentIds((current) =>
      current.includes(content.id)
        ? current.filter((id) => id !== content.id)
        : [...current, content.id],
    );
  }

  function buildNextQueryString() {
    const query = new URLSearchParams(forwardQuery);
    query.set("agreeOnlySelectedTasks", "true");
    query.set("consentMethod", "CHECKBOX");
    return query.toString();
  }

  const currentSafetyPath = `/safety?${forwardQuery}`;

  return (
    <section className="space-y-5 pb-28 pt-5">
      <FlowHeader title="작업별 안전 확인" onBack={() => router.back()} />

      {commonTrainingCompleted === null ? (
        <div className="flex justify-center py-12">
          <LoaderCircle className="size-6 animate-spin text-blue-600" />
        </div>
      ) : commonTrainingCompleted === false ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
            <div>
              <h2 className="text-base font-black text-slate-950">
                공통 안전교육이 먼저 필요합니다
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                SELF 정비 최초 1회 공통 시설·장비 안전수칙을 확인해 주세요.
              </p>
            </div>
          </div>
          <Link
            href={`/safety-training?next=${encodeURIComponent(currentSafetyPath)}`}
            className="mt-4 flex h-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white"
          >
            공통 안전교육 확인
          </Link>
        </div>
      ) : null}

      {selectedTasks.map((task) => (
        <section key={task.id} aria-labelledby={`safety-${task.id}`}>
          <div className="mb-3">
            <h2
              id={`safety-${task.id}`}
              className="text-lg font-black text-slate-950"
            >
              {task.name}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              작업 방법 교육이 아닌 주요 위험과 안전수칙 안내입니다.
            </p>
          </div>
          <div className="space-y-3">
            {task.safetyContents.map((content) => {
              const confirmed = confirmedContentIds.includes(content.id);
              return (
                <article
                  key={content.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {content.contentType === "VIDEO" ? (
                      <PlayCircle className="mt-0.5 size-5 shrink-0 text-blue-600" />
                    ) : (
                      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-slate-900">
                        {content.title}
                      </h3>
                      <div className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">
                        {content.body}
                      </div>
                    </div>
                  </div>
                  {content.contentType === "VIDEO" && content.mediaUrl ? (
                    <video
                      controls
                      preload="metadata"
                      className="mt-3 aspect-video w-full rounded-xl bg-slate-950"
                      onEnded={() =>
                        setConfirmedContentIds((current) =>
                          current.includes(content.id)
                            ? current
                            : [...current, content.id],
                        )
                      }
                    >
                      <source src={content.mediaUrl} />
                    </video>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleContent(content)}
                      className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-black ${
                        confirmed
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Check className="size-4" />
                      {confirmed ? "확인 완료" : "안전수칙 확인"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-lg font-black text-slate-950">선택 작업 한정 동의</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          선택 작업: {taskLabels}
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm font-bold leading-6 text-slate-800">
          <input
            type="checkbox"
            checked={agreeOnlySelectedTasks}
            onChange={(event) =>
              setAgreeOnlySelectedTasks(event.target.checked)
            }
            className="mt-0.5 size-5 shrink-0 accent-blue-600"
          />
          <span>{agreementText}</span>
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-800 shadow-sm">
        <input
          type="checkbox"
          checked={finalConsentConfirmed}
          onChange={(event) => setFinalConsentConfirmed(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-blue-600"
        />
        <span>작업별 안전수칙과 선택 작업 한정 동의 내용을 확인했습니다.</span>
      </label>

      {errorMessage ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => router.push(`/payment?${buildNextQueryString()}`)}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          동의하고 결제
        </button>
      </div>
    </section>
  );
}

export default function SafetyPage() {
  return (
    <Suspense fallback={<section className="pb-28 pt-5" />}>
      <SafetyPageContent />
    </Suspense>
  );
}

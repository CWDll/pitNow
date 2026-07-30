"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

import { FlowHeader } from "../_components/mobile-ui";
import { authFetch } from "@/src/lib/auth-fetch";

interface TrainingContent {
  id: string;
  title: string;
  body: string;
  contentType: "CARD" | "VIDEO";
  mediaUrl: string | null;
  completed: boolean;
}

interface TrainingResponse {
  success: boolean;
  completed?: boolean;
  contents?: TrainingContent[];
}

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function SafetyTrainingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [contents, setContents] = useState<TrainingContent[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTraining() {
      try {
        const response = await authFetch("/api/self-safety-training", {
          cache: "no-store",
        });
        const payload = (await response.json()) as TrainingResponse;
        if (!response.ok || !payload.success) {
          throw new Error("공통 안전교육을 불러오지 못했습니다.");
        }

        if (!cancelled) {
          setContents(payload.contents ?? []);
          if (payload.completed) {
            setConfirmed(true);
          }
        }
      } catch (error) {
        console.error("SAFETY TRAINING LOAD ERROR:", error);
        if (!cancelled) {
          setErrorMessage("공통 안전교육을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTraining();
    return () => {
      cancelled = true;
    };
  }, []);

  async function completeTraining() {
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await authFetch("/api/self-safety-training", {
        method: "POST",
      });
      const payload = (await response.json()) as TrainingResponse;
      if (!response.ok || !payload.success) {
        throw new Error("공통 안전교육 완료 기록을 저장하지 못했습니다.");
      }
      router.replace(nextPath);
    } catch (error) {
      console.error("SAFETY TRAINING SAVE ERROR:", error);
      setErrorMessage("완료 기록을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-5 pb-28 pt-5">
      <FlowHeader title="SELF 공통 안전교육" onBack={() => router.back()} />

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <h2 className="text-base font-black text-slate-950">
              최초 1회 필수 교육
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              SELF 정비를 처음 예약하기 전에 공통 시설·장비 안전수칙을
              확인합니다. 콘텐츠가 개정되면 새 버전을 다시 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-14">
          <LoaderCircle className="size-6 animate-spin text-blue-600" />
        </div>
      ) : (
        contents.map((content) => (
          <article
            key={content.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-lg font-black text-slate-950">
              {content.title}
            </h2>
            {content.contentType === "VIDEO" && content.mediaUrl ? (
              <video
                className="mt-3 aspect-video w-full rounded-xl bg-slate-950"
                controls
                preload="metadata"
              >
                <source src={content.mediaUrl} />
              </video>
            ) : null}
            <div className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">
              {content.body}
            </div>
          </article>
        ))
      )}

      {!isLoading && contents.length > 0 ? (
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-800 shadow-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-5 accent-blue-600"
          />
          <span>공통 안전수칙을 확인했고 준수하겠습니다.</span>
        </label>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          disabled={!confirmed || isSaving || contents.length === 0}
          onClick={() => void completeTraining()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {isSaving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          교육 완료
        </button>
      </div>
    </section>
  );
}

export default function SafetyTrainingPage() {
  return (
    <Suspense fallback={<section className="pb-28 pt-5" />}>
      <SafetyTrainingContent />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getGarageById, workOptions } from "../../../_data/mock-garages";

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
}

export default function PartnerWorkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [selectedWorkId, setSelectedWorkId] = useState<string>(workOptions[0].id);

  const garage = useMemo(() => getGarageById(params.id), [params.id]);

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">작업 선택</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link href={`/partner/${garage.id}`} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">작업 선택</h1>
      </header>

      <div className="mb-4 rounded-2xl bg-zinc-100 px-4 py-3 text-lg text-zinc-800">
        현대 아반떼 CN7 (2022)
      </div>

      <div className="space-y-3">
        {workOptions.map((option) => {
          const selected = option.id === selectedWorkId;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedWorkId(option.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-blue-500 bg-blue-50/40"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-medium text-zinc-900">{option.title}</p>
                {selected ? (
                  <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                    선택됨
                  </span>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full px-2 py-1 font-medium ${levelClass(option.level)}`}>
                  {option.level}
                </span>
                {option.helperRequired ? (
                  <span className="rounded-full bg-rose-50 px-2 py-1 font-medium text-rose-600">
                    헬퍼 필수
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-base text-zinc-600">{option.description}</p>
              <p className="mt-1 text-base text-zinc-500">◷ {option.durationLabel}</p>
              {option.helperNote ? (
                <p className="mt-2 text-base font-medium text-amber-600">{option.helperNote}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/partner/${garage.id}/schedule?workId=${selectedWorkId}`)}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          시간 선택
        </button>
      </div>
    </section>
  );
}

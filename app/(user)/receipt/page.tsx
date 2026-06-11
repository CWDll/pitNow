"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { ReservationStatus, ReservationType } from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";

interface ReservationDetail {
  id: string;
  reservationType: ReservationType;
  bookingMode: "SELF" | "PACKAGE";
  partnerId: string;
  garageName: string;
  bayId: string;
  bayLabel: string;
  carId: string;
  carLabel: string;
  startTime: string;
  endTime: string;
  dateLabel: string;
  status: ReservationStatus;
  totalPrice: number;
  workTitle: string;
  taskIds: string;
  taskLabels: string;
  selectedTaskCount: string;
}

interface ReservationDetailResponse {
  success: boolean;
  reservation?: ReservationDetail;
}

interface CheckoutDetail {
  id: string;
  reservationId: string;
  basePrice: number;
  extraFee: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  totalSettlement: number;
  completedAt: string;
}

interface CheckoutDetailResponse {
  success: boolean;
  checkout?: CheckoutDetail;
}

function formatReceiptDate(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function ReceiptPageContent() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("reservationId") ?? "";

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [checkout, setCheckout] = useState<CheckoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(reservationId));
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadReceipt() {
      if (!reservationId) {
        setIsLoading(false);
        setError("영수증을 확인할 예약 정보가 없습니다.");
        return;
      }

      setIsLoading(true);

      try {
        const [reservationResponse, checkoutResponse] = await Promise.all([
          authFetch(`/api/reservations/${reservationId}`, {
            method: "GET",
            cache: "no-store",
          }),
          authFetch(
            `/api/checkouts?reservationId=${encodeURIComponent(reservationId)}`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),
        ]);

        const reservationPayload =
          (await reservationResponse.json()) as ReservationDetailResponse;
        const checkoutPayload =
          (await checkoutResponse.json()) as CheckoutDetailResponse;

        if (isCancelled) {
          return;
        }

        if (
          !reservationResponse.ok ||
          !reservationPayload.success ||
          !reservationPayload.reservation
        ) {
          setError(
            extractApiErrorMessage(
              reservationPayload,
              "예약 상세 정보를 불러오지 못했습니다.",
            ),
          );
          return;
        }

        if (
          !checkoutResponse.ok ||
          !checkoutPayload.success ||
          !checkoutPayload.checkout
        ) {
          setError(
            extractApiErrorMessage(
              checkoutPayload,
              "체크아웃 정산 정보를 불러오지 못했습니다.",
            ),
          );
          return;
        }

        setReservation(reservationPayload.reservation);
        setCheckout(checkoutPayload.checkout);
      } catch {
        if (!isCancelled) {
          setError("영수증 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReceipt();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  const basePrice = checkout?.basePrice ?? 0;
  const extraFee = checkout?.extraFee ?? 0;
  const helperVerifyFee = checkout?.helperVerifyFee ?? 0;
  const totalSettlement = checkout?.totalSettlement ?? 0;

  return (
    <section className="pb-24 pt-4">
      <header className="mb-4">
        <p className="text-sm font-semibold tracking-[0.3em] text-blue-600">
          PITNOW RECEIPT
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
          이용 영수증
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          예약과 체크아웃 정산 row를 기준으로 발행된 확인용 영수증입니다.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-3xl bg-white p-5 text-sm text-zinc-500 shadow-sm">
          영수증 정보를 불러오는 중입니다.
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {reservation && checkout ? (
        <div className="overflow-hidden rounded-4xl border border-zinc-200 bg-white shadow-sm">
          <div className="bg-zinc-950 p-5 text-white">
            <p className="text-sm text-zinc-400">예약 ID</p>
            <p className="mt-1 break-all font-mono text-sm">{reservation.id}</p>
            <p className="mt-4 text-3xl font-semibold">
              {formatCurrency(totalSettlement)}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              결제 확정 {formatReceiptDate(checkout.completedAt)}
            </p>
          </div>

          <div className="space-y-5 p-5">
            <section>
              <h2 className="text-xl font-semibold text-zinc-950">이용 정보</h2>
              <dl className="mt-3 space-y-2 text-base text-zinc-700">
                <div className="flex justify-between gap-4">
                  <dt>지점</dt>
                  <dd className="text-right text-zinc-950">
                    {reservation.garageName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>작업</dt>
                  <dd className="text-right text-zinc-950">
                    {reservation.taskLabels || reservation.workTitle}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>날짜/시간</dt>
                  <dd className="text-right text-zinc-950">
                    {reservation.dateLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>베이</dt>
                  <dd className="text-right text-zinc-950">
                    {reservation.bayLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>차량</dt>
                  <dd className="text-right text-zinc-950">
                    {reservation.carLabel}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-3xl bg-zinc-100 p-4">
              <h2 className="text-xl font-semibold text-zinc-950">정산 내역</h2>
              <dl className="mt-3 space-y-2 text-base text-zinc-700">
                <div className="flex justify-between">
                  <dt>기본 요금</dt>
                  <dd>{formatCurrency(basePrice)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>추가 요금</dt>
                  <dd>{formatCurrency(extraFee)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>카 마스터 검수</dt>
                  <dd>{formatCurrency(helperVerifyFee)}</dd>
                </div>
                <div className="border-t border-zinc-300 pt-3">
                  <div className="flex justify-between text-2xl font-semibold text-zinc-950">
                    <dt>총 결제</dt>
                    <dd className="text-blue-600">
                      {formatCurrency(totalSettlement)}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/reservation"
          className="rounded-2xl bg-zinc-100 py-3 text-center text-lg font-medium text-zinc-700"
        >
          내 예약
        </Link>
        <Link
          href="/"
          className="rounded-2xl bg-blue-600 py-3 text-center text-lg font-semibold text-white"
        >
          다시 예약
        </Link>
      </div>
    </section>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <ReceiptPageContent />
    </Suspense>
  );
}

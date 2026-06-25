"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { authFetch } from "@/src/lib/auth-fetch";
import { redirectToLogin } from "@/src/lib/client-auth";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";
type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

interface PartnerMembership {
  partnerId: string;
  partnerName: string;
  role: "OWNER" | "STAFF";
}

interface PartnerAdminReservation {
  id: string;
  reservationType: ReservationType;
  status: ReservationStatus;
  bayId: string | null;
  bayLabel: string;
  vehicleLabel: string;
  startTime: string;
  endTime: string;
  blockedUntil: string | null;
  totalPrice: number;
  checkinCompleted: boolean;
  checkoutCompleted: boolean;
}

interface PartnerBay {
  id: string;
  partnerId: string;
  name: string;
  isActive: boolean;
}

interface PartnerAdminReservationDetail {
  reservation: PartnerAdminReservation & {
    partnerId: string;
    partnerName: string;
    helperVerifyRequested: boolean;
    helperVerifyFee: number;
    createdAt: string;
  };
  checkin: {
    frontImg: string;
    rearImg: string;
    leftImg: string;
    rightImg: string;
    checkedInAt: string;
  } | null;
  checkout: {
    id: string;
    basePrice: number;
    extraFee: number;
    helperVerifyRequested: boolean;
    helperVerifyFee: number;
    totalSettlement: number;
    toolCheckCompleted: boolean;
    cleaningCompleted: boolean;
    wasteDisposalCompleted: boolean;
    checkoutPhoto1: string | null;
    checkoutPhoto2: string | null;
    completedAt: string;
  } | null;
  statusLogs: Array<{
    id: string;
    fromStatus: ReservationStatus | null;
    toStatus: ReservationStatus;
    actorType: "SYSTEM" | "USER" | "PARTNER" | "ADMIN";
    actorUserId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

function todayKstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function statusLabel(status: ReservationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "예약 확정";
    case "CHECKED_IN":
      return "체크인";
    case "IN_USE":
      return "이용 중";
    case "COMPLETED":
      return "완료";
    case "CANCELLED":
      return "취소";
    default:
      return status;
  }
}

function statusClass(status: ReservationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-blue-50 text-blue-700";
    case "CHECKED_IN":
    case "IN_USE":
      return "bg-indigo-50 text-indigo-700";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700";
    case "CANCELLED":
      return "bg-zinc-200 text-zinc-600";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

function reservationTypeLabel(type: ReservationType): string {
  return type === "SELF_SERVICE" ? "Self" : "Shop";
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function PartnerAdminDashboard() {
  const [partners, setPartners] = useState<PartnerMembership[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKstDate);
  const [reservations, setReservations] = useState<PartnerAdminReservation[]>([]);
  const [bays, setBays] = useState<PartnerBay[]>([]);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [detail, setDetail] = useState<PartnerAdminReservationDetail | null>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isLoadingBays, setIsLoadingBays] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [updatingBayId, setUpdatingBayId] = useState("");
  const [error, setError] = useState("");

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.partnerId === selectedPartnerId),
    [partners, selectedPartnerId],
  );

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      setIsLoadingMe(true);
      setError("");

      const response = await authFetch("/api/partner-admin/me");

      if (response.status === 401) {
        redirectToLogin("/partner-admin");
        return;
      }

      const payload = await readJson(response);

      if (!response.ok) {
        if (mounted) {
          setError(
            extractErrorMessage(payload) ??
              "정비소 관리자 권한을 확인하지 못했습니다.",
          );
          setIsLoadingMe(false);
        }
        return;
      }

      const memberships =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { partners?: unknown }).partners)
          ? ((payload as { partners: PartnerMembership[] }).partners)
          : [];

      if (mounted) {
        setPartners(memberships);
        setSelectedPartnerId(memberships[0]?.partnerId ?? "");
        setIsLoadingMe(false);
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPartnerId) {
      return;
    }

    let mounted = true;

    async function loadReservations() {
      setIsLoadingReservations(true);
      setError("");
      setSelectedReservationId("");
      setDetail(null);

      const query = new URLSearchParams({
        partnerId: selectedPartnerId,
        date: selectedDate,
      });
      const response = await authFetch(
        `/api/partner-admin/reservations?${query.toString()}`,
      );
      const payload = await readJson(response);

      if (!response.ok) {
        if (mounted) {
          setError(
            extractErrorMessage(payload) ?? "예약 목록을 불러오지 못했습니다.",
          );
          setReservations([]);
          setIsLoadingReservations(false);
        }
        return;
      }

      const nextReservations =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { reservations?: unknown }).reservations)
          ? ((payload as {
              reservations: PartnerAdminReservation[];
            }).reservations)
          : [];

      if (mounted) {
        setReservations(nextReservations);
        setIsLoadingReservations(false);
      }
    }

    void loadReservations();

    return () => {
      mounted = false;
    };
  }, [selectedDate, selectedPartnerId]);

  useEffect(() => {
    if (!selectedPartnerId) {
      return;
    }

    let mounted = true;

    async function loadBays() {
      setIsLoadingBays(true);
      setError("");

      const query = new URLSearchParams({
        partnerId: selectedPartnerId,
      });
      const response = await authFetch(
        `/api/partner-admin/bays?${query.toString()}`,
      );
      const payload = await readJson(response);

      if (!response.ok) {
        if (mounted) {
          setError(extractErrorMessage(payload) ?? "베이 목록을 불러오지 못했습니다.");
          setBays([]);
          setIsLoadingBays(false);
        }
        return;
      }

      const nextBays =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { bays?: unknown }).bays)
          ? ((payload as { bays: PartnerBay[] }).bays)
          : [];

      if (mounted) {
        setBays(nextBays);
        setIsLoadingBays(false);
      }
    }

    void loadBays();

    return () => {
      mounted = false;
    };
  }, [selectedPartnerId]);

  async function loadReservationDetail(reservationId: string) {
    setSelectedReservationId(reservationId);
    setIsLoadingDetail(true);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/reservations/${reservationId}`,
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(extractErrorMessage(payload) ?? "예약 상세를 불러오지 못했습니다.");
      setDetail(null);
      setIsLoadingDetail(false);
      return;
    }

    setDetail(payload as PartnerAdminReservationDetail);
    setIsLoadingDetail(false);
  }

  async function updateBayActiveState(bay: PartnerBay, isActive: boolean) {
    setUpdatingBayId(bay.id);
    setError("");

    const response = await authFetch(`/api/partner-admin/bays/${bay.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      setError(extractErrorMessage(payload) ?? "베이 상태를 변경하지 못했습니다.");
      setUpdatingBayId("");
      return;
    }

    const updatedBay =
      payload && typeof payload === "object"
        ? (payload as { bay?: PartnerBay }).bay
        : null;

    if (updatedBay) {
      setBays((current) =>
        current.map((item) => (item.id === updatedBay.id ? updatedBay : item)),
      );
    }

    setUpdatingBayId("");
  }

  const confirmedCount = reservations.filter(
    (reservation) => reservation.status === "CONFIRMED",
  ).length;
  const activeCount = reservations.filter(
    (reservation) =>
      reservation.status === "CHECKED_IN" || reservation.status === "IN_USE",
  ).length;
  const evidenceWaitCount = reservations.filter(
    (reservation) =>
      reservation.status !== "CANCELLED" &&
      (!reservation.checkinCompleted ||
        (reservation.status === "COMPLETED" && !reservation.checkoutCompleted)),
  ).length;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
            PitNow Partner
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            정비소 운영 콘솔
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            본인 업장의 예약과 현장 증적만 조회합니다.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
        >
          사용자 홈
        </Link>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isLoadingMe ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          정비소 관리자 권한을 확인하는 중입니다.
        </div>
      ) : partners.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-950">
            연결된 정비소가 없습니다
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Supabase에서 현재 로그인 계정의 user id를 `partner_admins`에
            추가하면 이 화면에서 본인 업장 예약을 볼 수 있습니다.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Partner
              </span>
              <select
                value={selectedPartnerId}
                onChange={(event) => setSelectedPartnerId(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none ring-blue-200 focus:ring-4"
              >
                {partners.map((partner) => (
                  <option key={partner.partnerId} value={partner.partnerId}>
                    {partner.partnerName} · {partner.role}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Date
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="mt-2 h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none ring-blue-200 focus:ring-4"
              />
            </label>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {[
              ["예약 확정", confirmedCount],
              ["이용 중", activeCount],
              ["증적 확인 필요", evidenceWaitCount],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-bold">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">베이 관리</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  비활성 베이는 사용자가 새 예약을 만들 수 없습니다.
                </p>
              </div>
              {isLoadingBays ? (
                <span className="text-xs font-medium text-zinc-500">
                  불러오는 중
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 p-4 md:grid-cols-2 lg:grid-cols-3">
              {bays.length === 0 ? (
                <p className="text-sm text-zinc-500">등록된 베이가 없습니다.</p>
              ) : (
                bays.map((bay) => (
                  <div
                    key={bay.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{bay.name}</p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          bay.isActive ? "text-emerald-700" : "text-zinc-500"
                        }`}
                      >
                        {bay.isActive ? "예약 가능" : "예약 중지"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={updatingBayId === bay.id}
                      onClick={() => void updateBayActiveState(bay, !bay.isActive)}
                      className={`h-9 rounded-full px-3 text-xs font-semibold transition disabled:opacity-50 ${
                        bay.isActive
                          ? "bg-zinc-900 text-white hover:bg-zinc-700"
                          : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}
                    >
                      {updatingBayId === bay.id
                        ? "변경 중"
                        : bay.isActive
                          ? "비활성화"
                          : "활성화"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">
                    {selectedPartner?.partnerName ?? "정비소"} 예약
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    선택 날짜 기준 예약 시작 시간으로 조회합니다.
                  </p>
                </div>
                {isLoadingReservations ? (
                  <span className="text-xs font-medium text-zinc-500">
                    불러오는 중
                  </span>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Bay</th>
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Evidence</th>
                      <th className="px-4 py-3 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {reservations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-zinc-500"
                        >
                          선택한 날짜의 예약이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      reservations.map((reservation) => (
                        <tr
                          key={reservation.id}
                          className={`cursor-pointer transition hover:bg-blue-50/60 ${
                            selectedReservationId === reservation.id
                              ? "bg-blue-50"
                              : ""
                          }`}
                          onClick={() => void loadReservationDetail(reservation.id)}
                        >
                          <td className="px-4 py-3 font-semibold">
                            {formatTime(reservation.startTime)} -{" "}
                            {formatTime(reservation.endTime)}
                          </td>
                          <td className="px-4 py-3">{reservation.bayLabel}</td>
                          <td className="px-4 py-3">{reservation.vehicleLabel}</td>
                          <td className="px-4 py-3">
                            {reservationTypeLabel(reservation.reservationType)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                                reservation.status,
                              )}`}
                            >
                              {statusLabel(reservation.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            체크인 {reservation.checkinCompleted ? "완료" : "대기"} ·
                            체크아웃{" "}
                            {reservation.checkoutCompleted ? "완료" : "대기"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatPrice(reservation.totalPrice)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="text-base font-semibold">예약 상세</h2>
              {isLoadingDetail ? (
                <p className="mt-4 text-sm text-zinc-500">
                  상세 정보를 불러오는 중입니다.
                </p>
              ) : !detail ? (
                <p className="mt-4 text-sm leading-6 text-zinc-500">
                  예약 row를 선택하면 체크인/체크아웃 증적과 상태 로그를 볼 수
                  있습니다.
                </p>
              ) : (
                <div className="mt-4 space-y-5">
                  <dl className="space-y-2 text-sm">
                    {[
                      ["예약 ID", detail.reservation.id],
                      ["차량", detail.reservation.vehicleLabel],
                      ["베이", detail.reservation.bayLabel],
                      [
                        "시간",
                        `${formatTime(detail.reservation.startTime)} - ${formatTime(
                          detail.reservation.endTime,
                        )}`,
                      ],
                      ["상태", statusLabel(detail.reservation.status)],
                      ["금액", formatPrice(detail.reservation.totalPrice)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{label}</dt>
                        <dd className="max-w-[220px] truncate text-right font-medium">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <section>
                    <h3 className="text-sm font-semibold">체크인 사진</h3>
                    {detail.checkin ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {[
                          ["전면", detail.checkin.frontImg],
                          ["후면", detail.checkin.rearImg],
                          ["좌측", detail.checkin.leftImg],
                          ["우측", detail.checkin.rightImg],
                        ].map(([label, src]) => (
                          <a
                            key={label}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700"
                          >
                            {label} 보기
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">
                        체크인 증적이 아직 없습니다.
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">체크아웃 검수</h3>
                    {detail.checkout ? (
                      <dl className="mt-2 space-y-2 text-sm">
                        {[
                          [
                            "공구 확인",
                            detail.checkout.toolCheckCompleted ? "완료" : "미완료",
                          ],
                          [
                            "청소 확인",
                            detail.checkout.cleaningCompleted ? "완료" : "미완료",
                          ],
                          [
                            "폐기물 확인",
                            detail.checkout.wasteDisposalCompleted
                              ? "완료"
                              : "미완료",
                          ],
                          ["총 정산", formatPrice(detail.checkout.totalSettlement)],
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between gap-4">
                            <dt className="text-zinc-500">{label}</dt>
                            <dd className="font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">
                        체크아웃 정보가 아직 없습니다.
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">상태 로그</h3>
                    <div className="mt-2 space-y-2">
                      {detail.statusLogs.length === 0 ? (
                        <p className="text-sm text-zinc-500">로그가 없습니다.</p>
                      ) : (
                        detail.statusLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-lg bg-zinc-50 px-3 py-2 text-xs"
                          >
                            <p className="font-semibold">
                              {log.fromStatus ?? "START"} → {log.toStatus}
                            </p>
                            <p className="mt-1 text-zinc-500">
                              {formatDateTime(log.createdAt)} · {log.reason ?? "-"}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}
            </aside>
          </section>
        </>
      )}
    </section>
  );
}

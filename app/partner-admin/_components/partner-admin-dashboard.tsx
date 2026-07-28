"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { VEHICLE_TYPE_OPTIONS, type VehicleType } from "@/src/domain/vehicle";
import { authFetch } from "@/src/lib/auth-fetch";
import { redirectToLogin } from "@/src/lib/client-auth";
import {
  convertHeicBlobToJpeg,
  looksLikeHeic,
} from "@/src/lib/heic-image";
import { PartnerCheckinCredentialManager } from "./partner-checkin-credential-manager";
import { PartnerImageManager } from "./partner-image-manager";

// type, interface, API는 나중에 분리해야 함. 한번에 옮길 것.

type ReservationStatus =
  "CONFIRMED" | "CHECKED_IN" | "IN_USE" | "COMPLETED" | "CANCELLED";
type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";
type PartnerNoteType = "NOTE" | "ISSUE" | "DELAY" | "NO_SHOW";
type NoteFilter = "ALL" | "OPEN" | "ISSUES";

interface OperationalAction {
  type: Exclude<PartnerNoteType, "NOTE">;
  label: string;
  body: string;
  quickReasons: string[];
  allowedStatuses: ReservationStatus[];
  className: string;
}

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
  activeReservationCount: number;
  blockingReservations: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: ReservationStatus;
  }>;
  canDeactivate: boolean;
  id: string;
  partnerId: string;
  name: string;
  isActive: boolean;
  allowedVehicleTypes: VehicleType[];
  maxVehicleWeightKg: number | null;
}

interface PartnerAdminPackage {
  id: string;
  packageId: string;
  code: string;
  name: string;
  description: string;
  durationMinutes: number;
  laborPrice: number;
  isActive: boolean;
  priceActive: boolean;
  catalogActive: boolean;
}

interface PartnerPackageCreationRequest {
  id: string;
  requestedName: string;
  requestedDescription: string;
  requestedDurationMinutes: number;
  requestedLaborPrice: number;
  reason: string;
  status: "PENDING" | "FULFILLED" | "REJECTED";
  createdAt: string;
}

interface AvailabilityBlock {
  id: string;
  partnerId: string;
  bayId: string | null;
  bayName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PartnerReservationNote {
  id: string;
  reservationId: string;
  partnerId: string;
  authorUserId: string | null;
  noteType: PartnerNoteType;
  body: string;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PartnerAdminReservationDetail {
  reservation: PartnerAdminReservation & {
    partnerId: string;
    partnerName: string;
    helperVerifyRequested: boolean;
    helperVerifyFee: number;
    createdAt: string;
    packageId: string | null;
    packageName: string | null;
    packageDescription: string | null;
    packageDurationMinutes: number | null;
    customer: {
      userId: string;
      email: string | null;
      name: string | null;
      phone: string | null;
    };
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

function defaultBlockStartsAt(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return toDateTimeLocalValue(now);
}

function defaultBlockEndsAt(): string {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 2);
  return toDateTimeLocalValue(end);
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toDateTimeLocalFromIso(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return toDateTimeLocalValue(date);
}

function toKstIsoFromDateTimeLocal(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

const HOUR_OPTIONS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);

function HourDateTimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [dateValue = "", timeValue = "00:00"] = value.split("T");

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-zinc-500">{label}</legend>
      <div className="mt-1 grid grid-cols-[1fr_92px] gap-2">
        <input
          type="date"
          required
          value={dateValue}
          onChange={(event) =>
            onChange(`${event.target.value}T${timeValue || "00:00"}`)
          }
          className="h-10 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
        />
        <select
          value={timeValue}
          onChange={(event) => onChange(`${dateValue}T${event.target.value}`)}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold outline-none ring-blue-200 focus:ring-4"
          aria-label={`${label} 시각`}
        >
          {HOUR_OPTIONS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
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

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function EvidenceImage({ label, src }: { label: string; src: string }) {
  const [hasError, setHasError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (!looksLikeHeic({ name: src })) {
      setDisplaySrc(src);
      setHasError(false);
      return;
    }

    let objectUrl = "";
    let cancelled = false;
    setIsConverting(true);
    setHasError(false);

    async function convertForPreview() {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error("Evidence image fetch failed");
        }
        const converted = await convertHeicBlobToJpeg(await response.blob());
        objectUrl = URL.createObjectURL(converted);
        if (!cancelled) {
          setDisplaySrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsConverting(false);
        }
      }
    }

    void convertForPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (isConverting) {
    return (
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        <div className="grid aspect-video place-items-center text-xs font-semibold text-zinc-500">
          HEIC 사진을 불러오는 중입니다.
        </div>
        <span className="block border-t border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">
          {label}
        </span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
        <div className="grid aspect-video place-items-center px-4 text-center text-xs font-semibold text-amber-800">
          저장 정보는 있지만 실제 사진 파일을 확인할 수 없습니다.
        </div>
        <span className="block border-t border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">
          {label}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPreviewOpen(true)}
        className="group overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displaySrc}
          alt={`${label} 증적 사진`}
          onError={() => setHasError(true)}
          className="aspect-video w-full bg-zinc-100 object-cover transition group-hover:scale-[1.02]"
        />
        <span className="block border-t border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">
          {label}
        </span>
      </button>
      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 사진 확대`}
          onClick={() => setIsPreviewOpen(false)}
        >
          <div className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt={`${label} 증적 사진 확대`}
              className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain"
            />
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="mt-3 h-10 w-full rounded-lg bg-white text-sm font-semibold text-zinc-900"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
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

function noteTypeLabel(type: PartnerNoteType): string {
  switch (type) {
    case "ISSUE":
      return "이슈";
    case "DELAY":
      return "지연";
    case "NO_SHOW":
      return "노쇼";
    case "NOTE":
      return "메모";
    default:
      return type;
  }
}

function noteTypeClass(type: PartnerNoteType): string {
  switch (type) {
    case "ISSUE":
      return "bg-red-50 text-red-700";
    case "DELAY":
      return "bg-amber-50 text-amber-700";
    case "NO_SHOW":
      return "bg-zinc-200 text-zinc-700";
    case "NOTE":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

function checklistValue(isComplete: boolean): string {
  return isComplete ? "완료" : "미완료";
}

const OPERATIONAL_ACTIONS: OperationalAction[] = [
  {
    type: "DELAY",
    label: "지연 기록",
    body: "고객 또는 작업 지연이 발생했습니다. 상세 사유를 추가로 기록해 주세요.",
    quickReasons: [
      "고객 도착이 예약 시간보다 늦어지고 있습니다.",
      "이전 작업 지연으로 예약 시작이 늦어지고 있습니다.",
      "부품/공구 준비 지연으로 작업 시작이 늦어지고 있습니다.",
    ],
    allowedStatuses: ["CONFIRMED", "CHECKED_IN", "IN_USE"],
    className: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  {
    type: "NO_SHOW",
    label: "노쇼 기록",
    body: "예약 시간에 고객이 도착하지 않았습니다. 연락 여부와 대기 시간을 추가로 기록해 주세요.",
    quickReasons: [
      "예약 시간 이후에도 고객이 도착하지 않았습니다.",
      "고객에게 연락했으나 응답이 없습니다.",
      "고객이 방문 취소 의사를 현장에서 전달했습니다.",
    ],
    allowedStatuses: ["CONFIRMED"],
    className: "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200",
  },
  {
    type: "ISSUE",
    label: "이슈 기록",
    body: "현장 이슈가 발생했습니다. 사진/상황/조치 내용을 추가로 기록해 주세요.",
    quickReasons: [
      "차량 상태 확인 중 추가 이슈가 발견되었습니다.",
      "공구/장비 사용 중 현장 확인이 필요합니다.",
      "고객과 작업 범위 확인이 필요합니다.",
    ],
    allowedStatuses: ["CONFIRMED", "CHECKED_IN", "IN_USE", "COMPLETED"],
    className: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  },
];

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
  const [reservations, setReservations] = useState<PartnerAdminReservation[]>(
    [],
  );
  const [bays, setBays] = useState<PartnerBay[]>([]);
  const [packages, setPackages] = useState<PartnerAdminPackage[]>([]);
  const [packageCreationRequests, setPackageCreationRequests] = useState<
    PartnerPackageCreationRequest[]
  >([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<
    AvailabilityBlock[]
  >([]);
  const [blockBayId, setBlockBayId] = useState("");
  const [blockStartsAt, setBlockStartsAt] = useState(defaultBlockStartsAt);
  const [blockEndsAt, setBlockEndsAt] = useState(defaultBlockEndsAt);
  const [blockReason, setBlockReason] = useState("");
  const [packageRequestPrices, setPackageRequestPrices] = useState<
    Record<string, string>
  >({});
  const [packageRequestReasons, setPackageRequestReasons] = useState<
    Record<string, string>
  >({});
  const [packageRequestMessage, setPackageRequestMessage] = useState("");
  const [newPackageRequest, setNewPackageRequest] = useState({
    name: "",
    description: "",
    durationMinutes: "60",
    laborPrice: "",
    reason: "",
  });
  const [isRequestingNewPackage, setIsRequestingNewPackage] = useState(false);
  const [packageReloadKey, setPackageReloadKey] = useState(0);
  const [editingBlockId, setEditingBlockId] = useState("");
  const [editBlockStartsAt, setEditBlockStartsAt] = useState("");
  const [editBlockEndsAt, setEditBlockEndsAt] = useState("");
  const [editBlockReason, setEditBlockReason] = useState("");
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [detail, setDetail] = useState<PartnerAdminReservationDetail | null>(
    null,
  );
  const [notes, setNotes] = useState<PartnerReservationNote[]>([]);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("ALL");
  const [noteType, setNoteType] = useState<PartnerNoteType>("NOTE");
  const [noteBody, setNoteBody] = useState("");
  const [selectedOperationalAction, setSelectedOperationalAction] =
    useState<OperationalAction | null>(null);
  const [operationalReason, setOperationalReason] = useState("");
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isLoadingBays, setIsLoadingBays] = useState(false);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [requestingPackageId, setRequestingPackageId] = useState("");
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isUpdatingShopStatus, setIsUpdatingShopStatus] = useState(false);
  const [shopStatusMessage, setShopStatusMessage] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [isCreatingOperationalNote, setIsCreatingOperationalNote] =
    useState(false);
  const [updatingNoteId, setUpdatingNoteId] = useState("");
  const [updatingBayId, setUpdatingBayId] = useState("");
  const [configuringBay, setConfiguringBay] = useState<PartnerBay | null>(null);
  const [configVehicleTypes, setConfigVehicleTypes] = useState<VehicleType[]>(
    [],
  );
  const [configMaxWeightKg, setConfigMaxWeightKg] = useState("");
  const [updatingBlockId, setUpdatingBlockId] = useState("");
  const [error, setError] = useState("");

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.partnerId === selectedPartnerId),
    [partners, selectedPartnerId],
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("pitnow:partner-context", {
        detail: { partnerName: selectedPartner?.partnerName ?? "" },
      }),
    );
  }, [selectedPartner]);

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
          ? (payload as { partners: PartnerMembership[] }).partners
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
      setNotes([]);

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
          ? (
              payload as {
                reservations: PartnerAdminReservation[];
              }
            ).reservations
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
          setError(
            extractErrorMessage(payload) ?? "베이 목록을 불러오지 못했습니다.",
          );
          setBays([]);
          setIsLoadingBays(false);
        }
        return;
      }

      const nextBays =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { bays?: unknown }).bays)
          ? (payload as { bays: PartnerBay[] }).bays
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

  useEffect(() => {
    if (!selectedPartnerId) {
      return;
    }

    let mounted = true;

    async function loadPackages() {
      setIsLoadingPackages(true);
      setError("");

      const query = new URLSearchParams({
        partnerId: selectedPartnerId,
      });
      const [response, requestsResponse] = await Promise.all([
        authFetch(`/api/partner-admin/packages?${query.toString()}`),
        authFetch(
          `/api/partner-admin/package-creation-requests?${query.toString()}`,
        ),
      ]);
      const [payload, requestsPayload] = await Promise.all([
        readJson(response),
        readJson(requestsResponse),
      ]);

      if (!response.ok || !requestsResponse.ok) {
        if (mounted) {
          setError(
            extractErrorMessage(response.ok ? requestsPayload : payload) ??
              "업장 패키지 목록을 불러오지 못했습니다.",
          );
          setPackages([]);
          setPackageCreationRequests([]);
          setIsLoadingPackages(false);
        }
        return;
      }

      const nextPackages =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { packages?: unknown }).packages)
          ? (payload as { packages: PartnerAdminPackage[] }).packages
          : [];
      const nextCreationRequests =
        requestsPayload &&
        typeof requestsPayload === "object" &&
        Array.isArray(
          (requestsPayload as { requests?: unknown }).requests,
        )
          ? (
              requestsPayload as {
                requests: PartnerPackageCreationRequest[];
              }
            ).requests
          : [];

      if (mounted) {
        setPackages(nextPackages);
        setPackageCreationRequests(nextCreationRequests);
        setIsLoadingPackages(false);
      }
    }

    void loadPackages();

    return () => {
      mounted = false;
    };
  }, [packageReloadKey, selectedPartnerId]);

  useEffect(() => {
    if (!selectedPartnerId) {
      return;
    }

    let mounted = true;

    async function loadAvailabilityBlocks() {
      setIsLoadingBlocks(true);
      setError("");

      const query = new URLSearchParams({
        partnerId: selectedPartnerId,
      });
      const response = await authFetch(
        `/api/partner-admin/availability-blocks?${query.toString()}`,
      );
      const payload = await readJson(response);

      if (!response.ok) {
        if (mounted) {
          setError(
            extractErrorMessage(payload) ??
              "예약 차단 시간을 불러오지 못했습니다.",
          );
          setAvailabilityBlocks([]);
          setIsLoadingBlocks(false);
        }
        return;
      }

      const nextBlocks =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { blocks?: unknown }).blocks)
          ? (payload as { blocks: AvailabilityBlock[] }).blocks
          : [];

      if (mounted) {
        setAvailabilityBlocks(nextBlocks);
        setIsLoadingBlocks(false);
      }
    }

    void loadAvailabilityBlocks();

    return () => {
      mounted = false;
    };
  }, [selectedPartnerId]);

  async function loadReservationDetail(reservationId: string) {
    setSelectedReservationId(reservationId);
    setIsLoadingDetail(true);
    setIsLoadingNotes(true);
    setSelectedOperationalAction(null);
    setOperationalReason("");
    setNoteFilter("ALL");
    setError("");

    const [detailResponse, notesResponse] = await Promise.all([
      authFetch(`/api/partner-admin/reservations/${reservationId}`),
      authFetch(`/api/partner-admin/reservations/${reservationId}/notes`),
    ]);
    const detailPayload = await readJson(detailResponse);
    const notesPayload = await readJson(notesResponse);

    if (!detailResponse.ok) {
      setError(
        extractErrorMessage(detailPayload) ??
          "예약 상세를 불러오지 못했습니다.",
      );
      setDetail(null);
      setNotes([]);
      setIsLoadingDetail(false);
      setIsLoadingNotes(false);
      return;
    }

    setDetail(detailPayload as PartnerAdminReservationDetail);
    setIsLoadingDetail(false);

    if (!notesResponse.ok) {
      setError(
        extractErrorMessage(notesPayload) ?? "현장 메모를 불러오지 못했습니다.",
      );
      setNotes([]);
      setIsLoadingNotes(false);
      return;
    }

    const nextNotes =
      notesPayload &&
      typeof notesPayload === "object" &&
      Array.isArray((notesPayload as { notes?: unknown }).notes)
        ? (notesPayload as { notes: PartnerReservationNote[] }).notes
        : [];

    setNotes(nextNotes);
    setIsLoadingNotes(false);
  }

  function closeReservationDetail() {
    setSelectedReservationId("");
    setDetail(null);
    setNotes([]);
    setSelectedOperationalAction(null);
  }

  async function updateShopReservationStatus(action: "START" | "COMPLETE") {
    if (!selectedReservationId || isUpdatingShopStatus) {
      return;
    }

    setIsUpdatingShopStatus(true);
    setShopStatusMessage("");
    setError("");

    const response = await authFetch(
      `/api/partner-admin/reservations/${selectedReservationId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ??
          (action === "START"
            ? "작업을 시작하지 못했습니다."
            : "작업을 완료하지 못했습니다."),
      );
      setIsUpdatingShopStatus(false);
      return;
    }

    const nextStatus: ReservationStatus =
      action === "START" ? "IN_USE" : "COMPLETED";
    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === selectedReservationId
          ? {
              ...reservation,
              status: nextStatus,
              checkoutCompleted:
                action === "COMPLETE" || reservation.checkoutCompleted,
            }
          : reservation,
      ),
    );
    setShopStatusMessage(
      action === "START"
        ? "정비 작업을 시작했습니다."
        : "정비 작업을 완료 처리했습니다.",
    );
    await loadReservationDetail(selectedReservationId);
    setIsUpdatingShopStatus(false);
  }

  async function createReservationNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedReservationId || !noteBody.trim()) {
      return;
    }

    setIsCreatingNote(true);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/reservations/${selectedReservationId}/notes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteType,
          body: noteBody,
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "현장 메모를 저장하지 못했습니다.",
      );
      setIsCreatingNote(false);
      return;
    }

    const createdNote =
      payload && typeof payload === "object"
        ? (payload as { note?: PartnerReservationNote }).note
        : null;

    if (createdNote) {
      setNotes((current) => [createdNote, ...current]);
    }

    setNoteType("NOTE");
    setNoteBody("");
    setIsCreatingNote(false);
  }

  function openOperationalActionModal(action: OperationalAction) {
    if (
      !detail ||
      !action.allowedStatuses.includes(detail.reservation.status)
    ) {
      return;
    }

    setSelectedOperationalAction(action);
    setOperationalReason(action.body);
    setError("");
  }

  function closeOperationalActionModal() {
    if (isCreatingOperationalNote) {
      return;
    }

    setSelectedOperationalAction(null);
    setOperationalReason("");
  }

  async function submitOperationalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedReservationId || !detail || !selectedOperationalAction) {
      return;
    }

    const reason = operationalReason.trim();

    if (!reason) {
      return;
    }

    if (
      !selectedOperationalAction.allowedStatuses.includes(
        detail.reservation.status,
      )
    ) {
      return;
    }

    setIsCreatingOperationalNote(true);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/reservations/${selectedReservationId}/notes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteType: selectedOperationalAction.type,
          body: reason,
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "현장 운영 액션을 기록하지 못했습니다.",
      );
      setIsCreatingOperationalNote(false);
      return;
    }

    const createdNote =
      payload && typeof payload === "object"
        ? (payload as { note?: PartnerReservationNote }).note
        : null;

    if (createdNote) {
      setNotes((current) => [createdNote, ...current]);
    }

    setSelectedOperationalAction(null);
    setOperationalReason("");
    setIsCreatingOperationalNote(false);
  }

  async function updateReservationNoteResolved(
    note: PartnerReservationNote,
    isResolved: boolean,
  ) {
    setUpdatingNoteId(note.id);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/reservation-notes/${note.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isResolved }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "현장 메모를 수정하지 못했습니다.",
      );
      setUpdatingNoteId("");
      return;
    }

    const updatedNote =
      payload && typeof payload === "object"
        ? (payload as { note?: PartnerReservationNote }).note
        : null;

    if (updatedNote) {
      setNotes((current) =>
        current.map((item) =>
          item.id === updatedNote.id ? updatedNote : item,
        ),
      );
    }

    setUpdatingNoteId("");
  }

  async function updateBayActiveState(bay: PartnerBay, isActive: boolean) {
    if (!isActive && !bay.canDeactivate) {
      setError("진행/예정 예약이 있는 베이는 비활성화할 수 없습니다.");
      return;
    }

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
      setError(
        extractErrorMessage(payload) ?? "베이 상태를 변경하지 못했습니다.",
      );
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

  function openBayCompatibility(bay: PartnerBay) {
    setConfiguringBay(bay);
    setConfigVehicleTypes(bay.allowedVehicleTypes);
    setConfigMaxWeightKg(
      bay.maxVehicleWeightKg === null ? "" : String(bay.maxVehicleWeightKg),
    );
  }

  function toggleConfigVehicleType(type: VehicleType) {
    setConfigVehicleTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  async function saveBayCompatibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configuringBay) {
      return;
    }

    const maxWeightKg = configMaxWeightKg.trim()
      ? Number(configMaxWeightKg)
      : null;

    if (
      maxWeightKg !== null &&
      (!Number.isInteger(maxWeightKg) || maxWeightKg <= 0)
    ) {
      setError("최대 허용 중량은 1kg 이상의 정수로 입력해 주세요.");
      return;
    }

    setUpdatingBayId(configuringBay.id);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/bays/${configuringBay.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedVehicleTypes: configVehicleTypes,
          maxVehicleWeightKg: maxWeightKg,
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "베이 이용 조건을 저장하지 못했습니다.",
      );
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
    setConfiguringBay(null);
  }

  async function createAvailabilityBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPartnerId) {
      return;
    }

    setIsCreatingBlock(true);
    setError("");

    const response = await authFetch("/api/partner-admin/availability-blocks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        partnerId: selectedPartnerId,
        bayId: blockBayId || undefined,
        startsAt: toKstIsoFromDateTimeLocal(blockStartsAt),
        endsAt: toKstIsoFromDateTimeLocal(blockEndsAt),
        reason: blockReason,
      }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "예약 차단 시간을 생성하지 못했습니다.",
      );
      setIsCreatingBlock(false);
      return;
    }

    const createdBlock =
      payload && typeof payload === "object"
        ? (payload as { block?: AvailabilityBlock }).block
        : null;

    if (createdBlock) {
      setAvailabilityBlocks((current) =>
        [...current, createdBlock].sort(
          (left, right) =>
            new Date(left.startsAt).getTime() -
            new Date(right.startsAt).getTime(),
        ),
      );
    }

    setBlockReason("");
    setIsCreatingBlock(false);
  }

  async function deactivateAvailabilityBlock(block: AvailabilityBlock) {
    setUpdatingBlockId(block.id);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/availability-blocks/${block.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "예약 차단 시간을 해제하지 못했습니다.",
      );
      setUpdatingBlockId("");
      return;
    }

    setAvailabilityBlocks((current) =>
      current.filter((item) => item.id !== block.id),
    );
    setUpdatingBlockId("");
  }

  function startEditingAvailabilityBlock(block: AvailabilityBlock) {
    setEditingBlockId(block.id);
    setEditBlockStartsAt(toDateTimeLocalFromIso(block.startsAt));
    setEditBlockEndsAt(toDateTimeLocalFromIso(block.endsAt));
    setEditBlockReason(block.reason ?? "");
    setError("");
  }

  function cancelEditingAvailabilityBlock() {
    setEditingBlockId("");
    setEditBlockStartsAt("");
    setEditBlockEndsAt("");
    setEditBlockReason("");
  }

  async function updateAvailabilityBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingBlockId) {
      return;
    }

    setUpdatingBlockId(editingBlockId);
    setError("");

    const response = await authFetch(
      `/api/partner-admin/availability-blocks/${editingBlockId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startsAt: toKstIsoFromDateTimeLocal(editBlockStartsAt),
          endsAt: toKstIsoFromDateTimeLocal(editBlockEndsAt),
          reason: editBlockReason,
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "예약 차단 시간을 수정하지 못했습니다.",
      );
      setUpdatingBlockId("");
      return;
    }

    const updatedBlock =
      payload && typeof payload === "object"
        ? (payload as { block?: AvailabilityBlock }).block
        : null;

    if (updatedBlock) {
      setAvailabilityBlocks((current) =>
        current
          .map((item) => (item.id === updatedBlock.id ? updatedBlock : item))
          .sort(
            (left, right) =>
              new Date(left.startsAt).getTime() -
              new Date(right.startsAt).getTime(),
          ),
      );
    }

    cancelEditingAvailabilityBlock();
    setUpdatingBlockId("");
  }

  async function createPackageChangeRequest(item: PartnerAdminPackage) {
    const requestedLaborPrice = Number(packageRequestPrices[item.packageId]);

    setPackageRequestMessage("");

    if (!Number.isInteger(requestedLaborPrice) || requestedLaborPrice < 0) {
      setError("요청할 공임 가격을 0원 이상 정수로 입력해 주세요.");
      return;
    }

    setRequestingPackageId(item.packageId);
    setError("");

    const response = await authFetch(
      "/api/partner-admin/package-change-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          partnerId: selectedPartnerId,
          packageId: item.packageId,
          requestedLaborPrice,
          reason: packageRequestReasons[item.packageId] ?? "",
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ?? "패키지 변경 요청 저장에 실패했습니다.",
      );
      setRequestingPackageId("");
      return;
    }

    setPackageRequestMessage(
      `${item.name} 변경 요청을 Admin 검토 대기 상태로 저장했습니다.`,
    );
    setPackageRequestPrices((current) => ({
      ...current,
      [item.packageId]: "",
    }));
    setPackageRequestReasons((current) => ({
      ...current,
      [item.packageId]: "",
    }));
    setRequestingPackageId("");
  }

  async function createPackageCreationRequest(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedPartnerId) {
      return;
    }

    setIsRequestingNewPackage(true);
    setError("");
    setPackageRequestMessage("");

    const response = await authFetch(
      "/api/partner-admin/package-creation-requests",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: selectedPartnerId,
          requestedName: newPackageRequest.name,
          requestedDescription: newPackageRequest.description,
          requestedDurationMinutes: Number(newPackageRequest.durationMinutes),
          requestedLaborPrice: Number(newPackageRequest.laborPrice),
          reason: newPackageRequest.reason,
        }),
      },
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setError(
        extractErrorMessage(payload) ??
          "신규 패키지 요청을 저장하지 못했습니다.",
      );
      setIsRequestingNewPackage(false);
      return;
    }

    setNewPackageRequest({
      name: "",
      description: "",
      durationMinutes: "60",
      laborPrice: "",
      reason: "",
    });
    setPackageRequestMessage(
      "신규 패키지 생성 요청을 Admin 검토 대기 상태로 저장했습니다.",
    );
    setPackageReloadKey((current) => current + 1);
    setIsRequestingNewPackage(false);
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
      (reservation.reservationType === "SELF_SERVICE"
        ? !reservation.checkinCompleted ||
          (reservation.status === "COMPLETED" && !reservation.checkoutCompleted)
        : reservation.status === "COMPLETED" &&
          !reservation.checkoutCompleted),
  ).length;
  const activeBayCount = bays.filter((bay) => bay.isActive).length;
  const activePackageCount = packages.filter((item) => item.isActive).length;
  const unresolvedNotes = notes.filter((note) => !note.isResolved);
  const unresolvedIssueNotes = unresolvedNotes.filter(
    (note) => note.noteType !== "NOTE",
  );
  const issueNotes = notes.filter((note) => note.noteType !== "NOTE");
  const visibleNotes = notes.filter((note) => {
    if (noteFilter === "OPEN") {
      return !note.isResolved;
    }

    if (noteFilter === "ISSUES") {
      return note.noteType !== "NOTE";
    }

    return true;
  });
  const checkoutChecklistItems = detail?.checkout
    ? [
        detail.checkout.toolCheckCompleted,
        detail.checkout.cleaningCompleted,
        detail.checkout.wasteDisposalCompleted,
      ]
    : [];
  const checkoutChecklistCompletedCount =
    checkoutChecklistItems.filter(Boolean).length;

  return (
    <section id="overview" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold text-blue-700">
            TODAY&apos;S OPERATIONS
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            현장 운영 현황
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            예약, 베이 상태와 현장 이슈를 한 화면에서 관리합니다.
          </p>
        </div>
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
          <section className="rounded-lg border border-slate-200 bg-white p-4">
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
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["예약 확정", confirmedCount],
              ["이용 중", activeCount],
              ["증적 확인 필요", evidenceWaitCount],
              ["예약 가능 베이", `${activeBayCount}/${bays.length}`],
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

          <PartnerImageManager
            partnerId={selectedPartnerId}
            partnerName={selectedPartner?.partnerName ?? "정비소"}
          />

          <PartnerCheckinCredentialManager
            partnerId={selectedPartnerId}
            partnerName={selectedPartner?.partnerName ?? "정비소"}
          />

          <section
            id="bays"
            className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">베이 관리</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  예약 버퍼 종료 전인 확정·이용 예약이 있는 베이는 비활성화할 수
                  없습니다. 버퍼가 지난 과거 기록은 이력으로 보존하되 베이를
                  잠그지 않습니다. 차종과 중량 조건도 베이별로 관리합니다.
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
                bays.map((bay) => {
                  const hasActiveReservations = bay.activeReservationCount > 0;
                  const disableDeactivateButton =
                    bay.isActive &&
                    (!bay.canDeactivate || updatingBayId === bay.id);
                  const isButtonDisabled =
                    updatingBayId === bay.id || disableDeactivateButton;

                  return (
                    <div
                      key={bay.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{bay.name}</p>
                          <p
                            className={`mt-1 text-xs font-semibold ${
                              bay.isActive
                                ? "text-emerald-700"
                                : "text-zinc-500"
                            }`}
                          >
                            {bay.isActive ? "예약 가능" : "예약 중지"}
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              hasActiveReservations
                                ? "font-semibold text-amber-700"
                                : "text-zinc-500"
                            }`}
                          >
                            {hasActiveReservations
                              ? `진행/예정 예약 ${bay.activeReservationCount}건`
                              : "진행/예정 예약 없음"}
                          </p>
                        </div>
                        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600">
                          {bay.maxVehicleWeightKg === null
                            ? "중량 제한 없음"
                            : `${bay.maxVehicleWeightKg.toLocaleString("ko-KR")}kg 이하`}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-600">
                        허용 차종:{" "}
                        {bay.allowedVehicleTypes.length === 0
                          ? "전체"
                          : bay.allowedVehicleTypes.join(", ")}
                      </p>
                      {bay.blockingReservations.length > 0 ? (
                        <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
                          {bay.blockingReservations.map((reservation) => (
                            <button
                              key={reservation.id}
                              type="button"
                              onClick={() => {
                                setSelectedDate(
                                  new Intl.DateTimeFormat("en-CA", {
                                    timeZone: "Asia/Seoul",
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                  }).format(new Date(reservation.startTime)),
                                );
                                window.location.hash = "reservations";
                              }}
                              className="block w-full rounded px-1 py-1 text-left text-xs text-amber-900 hover:bg-amber-100"
                            >
                              {formatDate(reservation.startTime)} ·{" "}
                              {formatTime(reservation.startTime)}-
                              {formatTime(reservation.endTime)} ·{" "}
                              {statusLabel(reservation.status)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openBayCompatibility(bay)}
                          disabled={updatingBayId === bay.id}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          이용 조건 설정
                        </button>
                        <button
                          type="button"
                          disabled={isButtonDisabled}
                          title={
                            disableDeactivateButton
                              ? "진행/예정 예약이 있어 비활성화할 수 없습니다."
                              : undefined
                          }
                          onClick={() =>
                            void updateBayActiveState(bay, !bay.isActive)
                          }
                          className={`h-9 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            bay.isActive
                              ? "bg-zinc-900 text-white hover:bg-zinc-700"
                              : "bg-blue-600 text-white hover:bg-blue-500"
                          }`}
                        >
                          {updatingBayId === bay.id
                            ? "변경 중"
                            : disableDeactivateButton
                              ? "비활성화 불가"
                              : bay.isActive
                                ? "비활성화"
                                : "활성화"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section
            id="packages"
            className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">패키지/가격 확인</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  신규 예약에 노출되는 Shop Service 패키지와 가격입니다. 변경은
                  PitNow Admin을 통해 처리합니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                  {activePackageCount}/{packages.length} 노출
                </span>
                {isLoadingPackages ? (
                  <span className="text-xs font-medium text-zinc-500">
                    불러오는 중
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
              {packageRequestMessage ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 md:col-span-2 xl:col-span-3">
                  {packageRequestMessage}
                </p>
              ) : null}
              <form
                onSubmit={createPackageCreationRequest}
                className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 md:col-span-2 xl:col-span-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-blue-950">
                      신규 패키지 생성 요청
                    </h3>
                    <p className="mt-1 text-xs text-blue-700">
                      아직 카탈로그에 없는 작업을 Admin에게 제안합니다.
                    </p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-blue-700">
                    Admin 검토
                  </span>
                </div>
                <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1fr_140px_160px_1.2fr]">
                  <label className="text-xs font-semibold text-blue-950">
                    패키지명 <span className="text-blue-600">필수</span>
                    <input
                      required
                      value={newPackageRequest.name}
                      onChange={(event) =>
                        setNewPackageRequest((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                      placeholder="예: 시트 내부 청소 패키지"
                    />
                  </label>
                  <label className="text-xs font-semibold text-blue-950">
                    소요시간(분) <span className="text-blue-600">필수</span>
                    <input
                      required
                      type="number"
                      min="5"
                      step="5"
                      value={newPackageRequest.durationMinutes}
                      onChange={(event) =>
                        setNewPackageRequest((current) => ({
                          ...current,
                          durationMinutes: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                      placeholder="예: 60"
                    />
                    <span className="mt-1 block font-normal text-blue-700">
                      5분 단위
                    </span>
                  </label>
                  <label className="text-xs font-semibold text-blue-950">
                    희망 공임(원) <span className="text-blue-600">필수</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={newPackageRequest.laborPrice}
                      onChange={(event) =>
                        setNewPackageRequest((current) => ({
                          ...current,
                          laborPrice: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                      placeholder="예: 50000"
                    />
                  </label>
                  <label className="text-xs font-semibold text-blue-950">
                    사용자 노출 설명
                    <input
                      value={newPackageRequest.description}
                      onChange={(event) =>
                        setNewPackageRequest((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                      placeholder="예: 내부 시트, 핸들, 바닥 청소"
                    />
                  </label>
                </div>
                <div className="mt-3 grid items-end gap-2 lg:grid-cols-[1fr_auto]">
                  <label className="text-xs font-semibold text-blue-950">
                    Admin 검토 참고사항
                    <input
                      value={newPackageRequest.reason}
                      onChange={(event) =>
                        setNewPackageRequest((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                      placeholder="필요 사유, 적용 희망일 등"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isRequestingNewPackage}
                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isRequestingNewPackage ? "요청 중" : "생성 요청 보내기"}
                  </button>
                </div>
              </form>
              {packageCreationRequests.map((request) => (
                <div
                  key={request.id}
                  data-testid="package-creation-request"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-950">
                        {request.requestedName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {request.requestedDescription || "설명 없음"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        request.status === "PENDING"
                          ? "bg-amber-100 text-amber-800"
                          : request.status === "FULFILLED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {request.status === "PENDING"
                        ? "승인 대기 중"
                        : request.status === "FULFILLED"
                          ? "처리 완료"
                          : "거절됨"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-700">
                    <span>소요 {request.requestedDurationMinutes}분</span>
                    <span>희망 공임 {formatPrice(request.requestedLaborPrice)}</span>
                    <span>요청일 {formatDate(request.createdAt)}</span>
                  </div>
                  {request.reason ? (
                    <p className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-900">
                      검토 참고: {request.reason}
                    </p>
                  ) : null}
                </div>
              ))}
              {packages.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  등록된 Shop Service 패키지가 없습니다.
                </p>
              ) : (
                packages.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.name}</p>
                        <p className="mt-1 font-mono text-[11px] text-zinc-500">
                          {item.code}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-200 text-zinc-600"
                        }`}
                      >
                        {item.isActive ? "노출 중" : "숨김"}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {item.description}
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-white p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Duration
                        </p>
                        <p className="mt-1 font-semibold">
                          {item.durationMinutes}분
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Labor
                        </p>
                        <p className="mt-1 font-semibold">
                          {formatPrice(item.laborPrice)}
                        </p>
                      </div>
                    </div>
                    {!item.priceActive || !item.catalogActive ? (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        {item.catalogActive
                          ? "업장 가격이 비활성화되어 신규 예약에 보이지 않습니다."
                          : "전역 패키지가 비활성화되어 신규 예약에 보이지 않습니다."}
                      </p>
                    ) : null}
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <p className="text-xs font-semibold text-zinc-700">
                        가격 변경 요청
                      </p>
                      <div className="mt-2 grid gap-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={packageRequestPrices[item.packageId] ?? ""}
                          onChange={(event) =>
                            setPackageRequestPrices((current) => ({
                              ...current,
                              [item.packageId]: event.target.value,
                            }))
                          }
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
                          placeholder={`${formatPrice(item.laborPrice)}에서 변경`}
                        />
                        <input
                          value={packageRequestReasons[item.packageId] ?? ""}
                          onChange={(event) =>
                            setPackageRequestReasons((current) => ({
                              ...current,
                              [item.packageId]: event.target.value,
                            }))
                          }
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
                          placeholder="사유, 적용 희망일 등"
                        />
                        <button
                          type="button"
                          disabled={requestingPackageId === item.packageId}
                          onClick={() => void createPackageChangeRequest(item)}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
                        >
                          {requestingPackageId === item.packageId
                            ? "요청 중"
                            : "Admin에 변경 요청"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section
            id="availability"
            className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">예약 차단 시간</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  업장 전체 또는 특정 베이를 임시로 예약 불가 처리합니다.
                </p>
              </div>
              {isLoadingBlocks ? (
                <span className="text-xs font-medium text-zinc-500">
                  불러오는 중
                </span>
              ) : null}
            </div>

            <form
              onSubmit={createAvailabilityBlock}
              className="grid gap-3 border-b border-zinc-200 p-4 lg:grid-cols-[180px_1fr_1fr_1fr_auto]"
            >
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">
                  범위
                </span>
                <select
                  value={blockBayId}
                  onChange={(event) => setBlockBayId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
                >
                  <option value="">업장 전체</option>
                  {bays.map((bay) => (
                    <option key={bay.id} value={bay.id}>
                      {bay.name}
                    </option>
                  ))}
                </select>
              </label>

              <HourDateTimeInput
                label="시작"
                value={blockStartsAt}
                onChange={setBlockStartsAt}
              />

              <HourDateTimeInput
                label="종료"
                value={blockEndsAt}
                onChange={setBlockEndsAt}
              />

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">
                  사유
                </span>
                <input
                  value={blockReason}
                  onChange={(event) => setBlockReason(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
                  placeholder="장비 점검"
                />
              </label>

              <button
                type="submit"
                disabled={isCreatingBlock}
                className="self-end rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
              >
                {isCreatingBlock ? "생성 중" : "차단 추가"}
              </button>
            </form>

            <div className="divide-y divide-zinc-100">
              {availabilityBlocks.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">
                  활성 예약 차단 시간이 없습니다.
                </p>
              ) : (
                availabilityBlocks.map((block) =>
                  editingBlockId === block.id ? (
                    <form
                      key={block.id}
                      onSubmit={updateAvailabilityBlock}
                      className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                      <HourDateTimeInput
                        label="시작"
                        value={editBlockStartsAt}
                        onChange={setEditBlockStartsAt}
                      />
                      <HourDateTimeInput
                        label="종료"
                        value={editBlockEndsAt}
                        onChange={setEditBlockEndsAt}
                      />
                      <label className="block">
                        <span className="text-xs font-semibold text-zinc-500">
                          사유
                        </span>
                        <input
                          value={editBlockReason}
                          onChange={(event) =>
                            setEditBlockReason(event.target.value)
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium outline-none ring-blue-200 focus:ring-4"
                        />
                      </label>
                      <div className="flex items-end gap-2">
                        <button
                          type="submit"
                          disabled={updatingBlockId === block.id}
                          className="rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                        >
                          {updatingBlockId === block.id ? "저장 중" : "저장"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingAvailabilityBlock}
                          className="rounded-lg border border-zinc-300 px-3 py-2.5 text-xs font-semibold text-zinc-700"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      key={block.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {block.bayName ?? "업장 전체"} ·{" "}
                          {formatDateTime(block.startsAt)} -{" "}
                          {formatDateTime(block.endsAt)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {block.reason || "사유 없음"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingAvailabilityBlock(block)}
                          className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={updatingBlockId === block.id}
                          onClick={() =>
                            void deactivateAvailabilityBlock(block)
                          }
                          className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {updatingBlockId === block.id ? "해제 중" : "해제"}
                        </button>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </section>

          <section
            id="reservations"
            className="scroll-mt-24 overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">
                  {selectedPartner?.partnerName ?? "정비소"} 예약 ·{" "}
                  {formatDate(`${selectedDate}T00:00:00+09:00`)}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  선택 날짜 기준 예약 시작 시간으로 조회합니다.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold text-zinc-500">
                  조회일
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none ring-blue-200 focus:ring-4"
                />
                {isLoadingReservations ? (
                  <span className="text-xs font-medium text-zinc-500">
                    불러오는 중
                  </span>
                ) : null}
              </label>
            </div>

            <div className="divide-y divide-zinc-100">
              {reservations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  선택한 날짜의 예약이 없습니다.
                </p>
              ) : (
                reservations.map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    onClick={() => void loadReservationDetail(reservation.id)}
                    className={`grid w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/60 xl:grid-cols-[160px_120px_1fr_120px_160px_120px] ${
                      selectedReservationId === reservation.id
                        ? "bg-blue-50"
                        : "bg-white"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Time
                      </p>
                      <p className="mt-1 text-sm font-bold text-zinc-950">
                        {formatTime(reservation.startTime)} -{" "}
                        {formatTime(reservation.endTime)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDate(reservation.startTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Bay
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">
                        {reservation.bayLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Vehicle
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">
                        {reservation.vehicleLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Type
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">
                        {reservationTypeLabel(reservation.reservationType)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Status
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                          reservation.status,
                        )}`}
                      >
                        {statusLabel(reservation.status)}
                      </span>
                      <p className="mt-1 text-xs text-zinc-500">
                        체크인 {reservation.checkinCompleted ? "완료" : "대기"}{" "}
                        · 체크아웃{" "}
                        {reservation.checkoutCompleted ? "완료" : "대기"}
                      </p>
                    </div>
                    <div className="xl:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Price
                      </p>
                      <p className="mt-1 text-sm font-bold text-zinc-950">
                        {formatPrice(reservation.totalPrice)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {selectedReservationId ? (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-reservation-detail-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeReservationDetail();
                }
              }}
            >
              <aside className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-lg border border-zinc-200 bg-white p-4 shadow-2xl sm:rounded-lg sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Reservation detail
                    </p>
                    <h2
                      id="partner-reservation-detail-title"
                      className="mt-1 text-xl font-bold text-zinc-950"
                    >
                      예약 상세
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeReservationDetail}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    닫기
                  </button>
                </div>
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
                    {detail.reservation.reservationType === "SHOP_SERVICE" ? (
                      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-bold uppercase text-blue-700">
                          정비 맡기기 패키지
                        </p>
                        <div className="mt-2 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base font-bold text-blue-950">
                              {detail.reservation.packageName ??
                                "패키지 정보 확인 필요"}
                            </h3>
                            {detail.reservation.packageDescription ? (
                              <p className="mt-1 text-xs leading-5 text-blue-800">
                                {detail.reservation.packageDescription}
                              </p>
                            ) : null}
                          </div>
                          {detail.reservation.packageDurationMinutes ? (
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700">
                              {detail.reservation.packageDurationMinutes}분
                            </span>
                          ) : null}
                        </div>
                      </section>
                    ) : null}

                    <dl className="space-y-2 text-sm">
                      {[
                        ["예약 ID", detail.reservation.id],
                        [
                          "예약자",
                          detail.reservation.customer.name ??
                            detail.reservation.customer.email ??
                            detail.reservation.customer.userId,
                        ],
                        [
                          "예약자 이메일",
                          detail.reservation.customer.email ?? "-",
                        ],
                        [
                          "예약자 연락처",
                          detail.reservation.customer.phone ?? "미등록",
                        ],
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
                          <dt className="shrink-0 text-zinc-500">{label}</dt>
                          <dd
                            className={
                              label === "예약 ID"
                                ? "max-w-[70%] break-all text-right font-mono text-xs font-semibold text-zinc-800"
                                : "max-w-[220px] truncate text-right font-medium"
                            }
                          >
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            detail.reservation.status,
                          )}`}
                        >
                          {statusLabel(detail.reservation.status)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            detail.checkin
                              ? "bg-emerald-50 text-emerald-700"
                              : detail.reservation.reservationType ===
                                    "SHOP_SERVICE" &&
                                  detail.reservation.status !== "CONFIRMED"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {detail.reservation.reservationType === "SHOP_SERVICE"
                            ? `도착 인증 ${
                                detail.reservation.status !== "CONFIRMED"
                                  ? "완료"
                                  : "대기"
                              }`
                            : `체크인 ${
                                detail.checkin ? "증적 완료" : "증적 대기"
                              }`}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            detail.checkout
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          체크아웃 {detail.checkout ? "검수 완료" : "검수 전"}
                        </span>
                        {unresolvedIssueNotes.length > 0 ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            미해결 이슈 {unresolvedIssueNotes.length}
                          </span>
                        ) : null}
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {[
                          ["예약일", formatDate(detail.reservation.startTime)],
                          [
                            "예약 시간",
                            `${formatTime(detail.reservation.startTime)} - ${formatTime(
                              detail.reservation.endTime,
                            )}`,
                          ],
                          [
                            "버퍼 종료",
                            formatDateTime(detail.reservation.blockedUntil),
                          ],
                          [
                            "메모",
                            unresolvedNotes.length > 0
                              ? `미해결 ${unresolvedNotes.length}건`
                              : `${notes.length}건`,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-2"
                          >
                            <dt className="font-semibold text-zinc-500">
                              {label}
                            </dt>
                            <dd className="mt-1 font-semibold text-zinc-900">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    {detail.reservation.reservationType === "SHOP_SERVICE" &&
                    (detail.reservation.status === "CHECKED_IN" ||
                      detail.reservation.status === "IN_USE") ? (
                      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-bold text-blue-950">
                              정비 맡기기 작업 상태
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-blue-800">
                              {detail.reservation.status === "CHECKED_IN"
                                ? "고객 도착 인증이 완료되었습니다. 차량을 인계받은 뒤 작업을 시작하세요."
                                : "작업을 모두 마치고 차량 인도 준비가 끝났을 때 완료 처리하세요."}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isUpdatingShopStatus}
                            onClick={() =>
                              void updateShopReservationStatus(
                                detail.reservation.status === "CHECKED_IN"
                                  ? "START"
                                  : "COMPLETE",
                              )
                            }
                            className="h-10 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:bg-blue-300"
                          >
                            {isUpdatingShopStatus
                              ? "처리 중"
                              : detail.reservation.status === "CHECKED_IN"
                                ? "작업 시작"
                                : "작업 완료"}
                          </button>
                        </div>
                        {shopStatusMessage ? (
                          <p className="mt-3 text-xs font-bold text-emerald-700">
                            {shopStatusMessage}
                          </p>
                        ) : null}
                      </section>
                    ) : null}

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
                            <EvidenceImage
                              key={label}
                              label={label}
                              src={src}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">
                          {detail.reservation.reservationType === "SHOP_SERVICE"
                            ? "정비 맡기기 예약은 체크인 사진을 요구하지 않습니다."
                            : "체크인 증적이 아직 없습니다."}
                        </p>
                      )}
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold">체크아웃 검수</h3>
                      {detail.checkout && !detail.checkin ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          체크아웃 기록은 있으나 체크인 증적이 없습니다. 현재
                          정상 흐름에서는 체크인 사진 4장 없이는 이용을 시작할 수
                          없으므로, 이 예약은 과거 테스트 또는 비정상 데이터로
                          확인이 필요합니다.
                        </p>
                      ) : null}
                      {detail.checkout ? (
                        <div className="mt-2 space-y-3">
                          {detail.checkout.checkoutPhoto1 &&
                          detail.checkout.checkoutPhoto2 ? (
                            <div className="grid grid-cols-2 gap-2">
                              <EvidenceImage
                                label="체크아웃 사진 1"
                                src={detail.checkout.checkoutPhoto1}
                              />
                              <EvidenceImage
                                label="체크아웃 사진 2"
                                src={detail.checkout.checkoutPhoto2}
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-500">
                              저장된 체크아웃 사진이 없습니다.
                            </p>
                          )}
                          <dl className="space-y-2 text-sm">
                            {[
                              [
                                "공구 확인",
                                checklistValue(
                                  detail.checkout.toolCheckCompleted,
                                ),
                              ],
                              [
                                "청소 확인",
                                checklistValue(
                                  detail.checkout.cleaningCompleted,
                                ),
                              ],
                              [
                                "폐기물 확인",
                                checklistValue(
                                  detail.checkout.wasteDisposalCompleted,
                                ),
                              ],
                              [
                                "체크리스트",
                                `${checkoutChecklistCompletedCount}/${checkoutChecklistItems.length}`,
                              ],
                              [
                                "추가 요금",
                                formatPrice(detail.checkout.extraFee),
                              ],
                              [
                                "검수 요금",
                                formatPrice(detail.checkout.helperVerifyFee),
                              ],
                              [
                                "총 정산",
                                formatPrice(detail.checkout.totalSettlement),
                              ],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="flex justify-between gap-4"
                              >
                                <dt className="text-zinc-500">{label}</dt>
                                <dd className="font-medium">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">
                          체크아웃 정보가 아직 없습니다.
                        </p>
                      )}
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold">현장 운영 액션</h3>
                      <div className="mt-2 grid gap-2">
                        {OPERATIONAL_ACTIONS.map((action) => {
                          const isAllowed = action.allowedStatuses.includes(
                            detail.reservation.status,
                          );

                          return (
                            <button
                              key={action.type}
                              type="button"
                              disabled={!isAllowed || isCreatingOperationalNote}
                              onClick={() => openOperationalActionModal(action)}
                              className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${action.className}`}
                            >
                              {action.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        액션 기록은 현장 메모로 저장되고, 처리 후 해결 상태로
                        변경합니다.
                      </p>
                    </section>

                    <section>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">현장 메모</h3>
                          {isLoadingNotes ? (
                            <span className="text-xs text-zinc-500">
                              불러오는 중
                            </span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {[
                            ["전체", notes.length],
                            ["미해결", unresolvedNotes.length],
                            ["이슈", issueNotes.length],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2"
                            >
                              <p className="font-semibold text-zinc-500">
                                {label}
                              </p>
                              <p className="mt-1 text-base font-bold text-zinc-950">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              ["ALL", "전체"],
                              ["OPEN", "미해결"],
                              ["ISSUES", "이슈만"],
                            ] as const
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNoteFilter(value)}
                              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                                noteFilter === value
                                  ? "border-zinc-950 bg-zinc-950 text-white"
                                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <form
                        onSubmit={createReservationNote}
                        className="mt-2 space-y-2"
                      >
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <select
                            value={noteType}
                            onChange={(event) =>
                              setNoteType(event.target.value as PartnerNoteType)
                            }
                            className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold outline-none ring-blue-200 focus:ring-4"
                          >
                            <option value="NOTE">메모</option>
                            <option value="ISSUE">이슈</option>
                            <option value="DELAY">지연</option>
                            <option value="NO_SHOW">노쇼</option>
                          </select>
                          <button
                            type="submit"
                            disabled={isCreatingNote || !noteBody.trim()}
                            className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
                          >
                            {isCreatingNote ? "저장 중" : "메모 추가"}
                          </button>
                        </div>
                        <textarea
                          value={noteBody}
                          onChange={(event) => setNoteBody(event.target.value)}
                          className="min-h-20 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-4"
                          placeholder="고객 지연, 현장 특이사항, 작업 이슈 등을 기록"
                        />
                      </form>

                      <div className="mt-3 space-y-2">
                        {notes.length === 0 ? (
                          <p className="text-sm text-zinc-500">
                            등록된 현장 메모가 없습니다.
                          </p>
                        ) : visibleNotes.length === 0 ? (
                          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                            현재 필터에 해당하는 현장 메모가 없습니다.
                          </p>
                        ) : (
                          visibleNotes.map((note) => (
                            <div
                              key={note.id}
                              className={`rounded-lg border px-3 py-2 text-xs ${
                                note.isResolved
                                  ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                                  : "border-zinc-200 bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-semibold ${noteTypeClass(
                                      note.noteType,
                                    )}`}
                                  >
                                    {noteTypeLabel(note.noteType)}
                                  </span>
                                  {note.isResolved ? (
                                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                                      해결
                                    </span>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  disabled={updatingNoteId === note.id}
                                  onClick={() =>
                                    void updateReservationNoteResolved(
                                      note,
                                      !note.isResolved,
                                    )
                                  }
                                  className="font-semibold text-zinc-600 underline-offset-2 hover:underline disabled:opacity-50"
                                >
                                  {updatingNoteId === note.id
                                    ? "변경 중"
                                    : note.isResolved
                                      ? "다시 열기"
                                      : "해결"}
                                </button>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap leading-5">
                                {note.body}
                              </p>
                              <p className="mt-2 text-zinc-400">
                                {formatDateTime(note.createdAt)}
                                {note.resolvedAt
                                  ? ` · 해결 ${formatDateTime(note.resolvedAt)}`
                                  : ""}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold">상태 로그</h3>
                      <div className="mt-2 space-y-2">
                        {detail.statusLogs.length === 0 ? (
                          <p className="text-sm text-zinc-500">
                            로그가 없습니다.
                          </p>
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
                                {formatDateTime(log.createdAt)} ·{" "}
                                {log.reason ?? "-"}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                )}
              </aside>
            </div>
          ) : null}
        </>
      )}

      {selectedOperationalAction && detail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operational-action-title"
        >
          <form
            onSubmit={submitOperationalNote}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-4 shadow-2xl sm:rounded-lg sm:p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Operational action
                </p>
                <h3
                  id="operational-action-title"
                  className="mt-1 text-xl font-bold text-zinc-950"
                >
                  {selectedOperationalAction.label}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {detail.reservation.vehicleLabel} ·{" "}
                  {formatTime(detail.reservation.startTime)} -{" "}
                  {formatTime(detail.reservation.endTime)}
                </p>
              </div>
              <button
                type="button"
                disabled={isCreatingOperationalNote}
                onClick={closeOperationalActionModal}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
              >
                닫기
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Quick reason
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {selectedOperationalAction.quickReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    disabled={isCreatingOperationalNote}
                    onClick={() => setOperationalReason(reason)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold leading-5 transition disabled:opacity-50 ${
                      operationalReason.trim() === reason
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Reason
              </span>
              <textarea
                value={operationalReason}
                onChange={(event) => setOperationalReason(event.target.value)}
                className="mt-2 min-h-32 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 outline-none ring-blue-200 focus:ring-4"
                placeholder="사유를 입력하세요."
              />
            </label>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <p className="text-xs leading-5 text-zinc-500">
                저장 후 현장 메모 목록에 추가됩니다.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  disabled={isCreatingOperationalNote}
                  onClick={closeOperationalActionModal}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreatingOperationalNote || !operationalReason.trim()
                  }
                  className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
                >
                  {isCreatingOperationalNote ? "저장 중" : "저장"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {configuringBay ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bay-compatibility-title"
        >
          <form
            onSubmit={saveBayCompatibility}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-4 shadow-2xl sm:rounded-lg sm:p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="bay-compatibility-title" className="text-xl font-bold">
                  {configuringBay.name} 이용 조건
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  입점 시 확인한 베이 수용 조건을 입력합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfiguringBay(null)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                닫기
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">허용 차종</legend>
              <p className="mt-1 text-xs text-zinc-500">
                아무 차종도 선택하지 않으면 전체 차종을 허용합니다.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {VEHICLE_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={configVehicleTypes.includes(option.value)}
                      onChange={() => toggleConfigVehicleType(option.value)}
                      className="size-4 accent-blue-600"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block">
              <span className="text-sm font-semibold">최대 허용 중량 (kg)</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={configMaxWeightKg}
                onChange={(event) => setConfigMaxWeightKg(event.target.value)}
                placeholder="비워두면 중량 제한 없음"
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none ring-blue-200 focus:ring-4"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfiguringBay(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={updatingBayId === configuringBay.id}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
              >
                {updatingBayId === configuringBay.id ? "저장 중" : "저장"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

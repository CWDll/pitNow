"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  MapPinned,
  Navigation,
  ShieldCheck,
  Star,
  Warehouse,
  Wrench,
} from "lucide-react";

import { PartnerMap, type PartnerMapItem } from "./partner-map";

type SortMode = "DEFAULT" | "DISTANCE" | "PRICE" | "RATING";
type ServiceMode = "SELF" | "SHOP";

export interface HomePartnerExplorerItem extends PartnerMapItem {
  bayCount: number;
  activeBayCount: number;
  averageRating: number | null;
  reviewCount: number;
  cheapestPackagePrice: number | null;
  hourlyPrice: number | null;
  coverImageUrl: string | null;
}

interface GeoPoint {
  lat: number;
  lng: number;
}

interface HomePartnerExplorerProps {
  partners: HomePartnerExplorerItem[];
  kakaoMapAppKey: string | null;
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

function getDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const earthRadiusKm = 6371;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPartnerDistance(
  partner: HomePartnerExplorerItem,
  userLocation: GeoPoint | null,
): number | null {
  if (
    !userLocation ||
    typeof partner.lat !== "number" ||
    typeof partner.lng !== "number"
  ) {
    return null;
  }

  return getDistanceKm(userLocation, {
    lat: partner.lat,
    lng: partner.lng,
  });
}

function distanceLabel(distanceKm: number | null): string | null {
  if (distanceKm === null) {
    return null;
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }

  return `${distanceKm.toFixed(1)}km`;
}

function formatBaySummary(partner: HomePartnerExplorerItem) {
  if (partner.activeBayCount === partner.bayCount) {
    return `베이 ${partner.bayCount}개`;
  }

  return `베이 ${partner.bayCount}개 중 ${partner.activeBayCount}개 사용 가능`;
}

function sortPartners(
  partners: HomePartnerExplorerItem[],
  sortMode: SortMode,
  userLocation: GeoPoint | null,
) {
  return [...partners].sort((a, b) => {
    if (sortMode === "DISTANCE") {
      const aDistance = getPartnerDistance(a, userLocation);
      const bDistance = getPartnerDistance(b, userLocation);

      if (aDistance === null && bDistance === null) {
        return 0;
      }

      if (aDistance === null) {
        return 1;
      }

      if (bDistance === null) {
        return -1;
      }

      return aDistance - bDistance;
    }

    if (sortMode === "PRICE") {
      return (
        (a.cheapestPackagePrice ?? Number.POSITIVE_INFINITY) -
        (b.cheapestPackagePrice ?? Number.POSITIVE_INFINITY)
      );
    }

    if (sortMode === "RATING") {
      return (b.averageRating ?? -1) - (a.averageRating ?? -1);
    }

    return 0;
  });
}

function sortButtonClass(active: boolean, disabled = false) {
  if (active) {
    return "h-9 shrink-0 rounded-lg bg-slate-950 px-3.5 font-bold text-white shadow-sm";
  }

  if (disabled) {
    return "h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 font-bold text-slate-300";
  }

  return "h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 font-bold text-slate-600";
}

export function HomePartnerExplorer({
  partners,
  kakaoMapAppKey,
}: HomePartnerExplorerProps) {
  const [sortMode, setSortMode] = useState<SortMode>("DEFAULT");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("SELF");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const sortedPartners = useMemo(
    () => sortPartners(partners, sortMode, userLocation),
    [partners, sortMode, userLocation],
  );

  const handlePartnerSelect = useCallback((partnerId: string) => {
    setSelectedPartnerId(partnerId);
    window.requestAnimationFrame(() => {
      cardRefs.current.get(partnerId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const handleUserLocationChange = useCallback((location: GeoPoint) => {
    setUserLocation(location);
    setSortMode("DISTANCE");
    setToastMessage("");
  }, []);

  function handleDistanceSortClick() {
    if (!userLocation) {
      setToastMessage("위치 권한을 수락하면 거리 순으로 정비소를 확인할 수 있습니다.");
      window.setTimeout(() => setToastMessage(""), 2600);
      return;
    }

    setSortMode("DISTANCE");
  }

  return (
    <>
      {toastMessage ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-100 -translate-x-1/2 rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white shadow-xl">
          {toastMessage}
        </div>
      ) : null}

      <section aria-labelledby="service-mode-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-blue-600">2-WAY SERVICE</p>
            <h2 id="service-mode-title" className="mt-1 text-lg font-black text-slate-950">
              원하는 정비 방식을 선택하세요
            </h2>
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-400">예약 시 변경 가능</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={serviceMode === "SELF"}
            onClick={() => setServiceMode("SELF")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
              serviceMode === "SELF"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Wrench className="size-4" />
            <span>
              Self <span className="font-semibold opacity-80">직접 정비</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={serviceMode === "SHOP"}
            onClick={() => setServiceMode("SHOP")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
              serviceMode === "SHOP"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <ShieldCheck className="size-4" />
            <span>
              Shop <span className="font-semibold opacity-80">맡기기</span>
            </span>
          </button>
        </div>
        </div>
      </section>

      <PartnerMap
        partners={partners}
        kakaoMapAppKey={kakaoMapAppKey}
        selectedPartnerId={selectedPartnerId}
        onPartnerSelect={handlePartnerSelect}
        onUserLocationChange={handleUserLocationChange}
      />

      <section id="nearby-garages" className="scroll-mt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-blue-600">NEARBY GARAGES</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">예약 가능한 정비소</h2>
          </div>
          <span className="shrink-0 text-xs font-bold text-slate-400">{partners.length}곳</span>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSortMode("DEFAULT")}
            className={sortButtonClass(sortMode === "DEFAULT")}
          >
            추천
          </button>
          <button
            type="button"
            onClick={handleDistanceSortClick}
            className={sortButtonClass(sortMode === "DISTANCE", !userLocation)}
          >
            거리
          </button>
          <button
            type="button"
            onClick={() => setSortMode("PRICE")}
            className={sortButtonClass(sortMode === "PRICE")}
          >
            가격
          </button>
          <button
            type="button"
            onClick={() => setSortMode("RATING")}
            className={sortButtonClass(sortMode === "RATING")}
          >
            평점
          </button>
        </div>
      </section>

      <div className="space-y-3 pb-3">
        {sortedPartners.map((partner) => {
          const ratingLabel =
            partner.averageRating === null
              ? "-"
              : partner.averageRating.toFixed(1);
          const distance = getPartnerDistance(partner, userLocation);
          const selected = selectedPartnerId === partner.id;

          return (
            <article
              key={partner.id}
              ref={(node) => {
                if (node) {
                  cardRefs.current.set(partner.id, node);
                } else {
                  cardRefs.current.delete(partner.id);
                }
              }}
              className={`rounded-2xl border bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition ${
                selected
                  ? "border-blue-500 ring-4 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              <Link
                href={`/partner/${partner.id}`}
                aria-label={`${partner.name} 사진과 상세 정보 보기`}
                className="mb-4 block overflow-hidden rounded-lg bg-slate-100"
              >
                {partner.coverImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={partner.coverImageUrl}
                    alt={`${partner.name} 대표 사진`}
                    className="aspect-[16/7] w-full object-cover"
                  />
                ) : (
                  <span className="grid aspect-[16/7] place-items-center text-slate-400">
                    <span className="text-center">
                      <Warehouse className="mx-auto size-6" />
                      <span className="mt-2 block text-xs font-bold">
                        정비소 사진 준비 중
                      </span>
                    </span>
                  </span>
                )}
              </Link>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-slate-950">
                    {partner.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-500">
                    {partner.address}
                  </p>
                </div>
                <Link
                  href={`/partner/${partner.id}`}
                  aria-label={`${partner.name} 상세 보기`}
                  title={`${partner.name} 상세 보기`}
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                >
                  <ChevronRight className="size-5" />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold text-slate-600">
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Star className="size-3.5 fill-current" />
                  {ratingLabel}
                  <span className="font-semibold text-slate-400">({partner.reviewCount})</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Navigation className="size-3.5 text-blue-600" />
                  {distanceLabel(distance) ?? "위치 설정 시 거리 표시"}
                </span>
                <span
                  className={`rounded-md px-2 py-1 ${
                    partner.activeBayCount > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {formatBaySummary(partner)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div
                  className={`rounded-xl border p-3 ${
                    serviceMode === "SELF"
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-black text-blue-700">
                    <Wrench className="size-3.5" /> Self
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500">시간제 베이 예약</p>
                  <p className="mt-1 text-base font-black text-slate-950">
                    {partner.hourlyPrice
                      ? `${formatPrice(partner.hourlyPrice)}/시간`
                      : "요금 준비중"}
                  </p>
                </div>
                <div
                  className={`rounded-xl border p-3 ${
                    serviceMode === "SHOP"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-black text-emerald-700">
                    <ShieldCheck className="size-3.5" /> Shop
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500">정비 패키지 예약</p>
                  <p className="mt-1 text-base font-black text-slate-950">
                    {partner.cheapestPackagePrice
                      ? `${formatPrice(partner.cheapestPackagePrice)}부터`
                      : "패키지 준비중"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <p className="min-w-0 flex-1 text-xs font-semibold leading-5 text-slate-500">
                  상세 화면에서 작업과 시간을 선택할 수 있어요.
                </p>
                <Link
                  href={`/partner/${partner.id}`}
                  className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  예약하기
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </article>
          );
        })}

        {partners.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center shadow-sm">
            <div className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
              <MapPinned className="size-5" />
            </div>
            <p className="mt-3 text-sm font-black text-slate-800">주변 정비소를 준비하고 있습니다</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
              이용 가능한 제휴 정비소가 등록되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

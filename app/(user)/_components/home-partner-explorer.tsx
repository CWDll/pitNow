"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { PartnerMap, type PartnerMapItem } from "./partner-map";

type SortMode = "FASTEST" | "DISTANCE" | "PRICE" | "RATING";

export interface HomePartnerExplorerItem extends PartnerMapItem {
  bayCount: number;
  activeBayCount: number;
  averageRating: number | null;
  reviewCount: number;
  cheapestPackagePrice: number | null;
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
    return "rounded-full bg-blue-600 px-4 py-2 font-semibold text-white";
  }

  if (disabled) {
    return "rounded-full border border-zinc-200 px-4 py-2 text-zinc-300";
  }

  return "rounded-full border border-zinc-300 px-4 py-2 text-zinc-600";
}

export function HomePartnerExplorer({
  partners,
  kakaoMapAppKey,
}: HomePartnerExplorerProps) {
  const [sortMode, setSortMode] = useState<SortMode>("FASTEST");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
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
  }, []);

  return (
    <>
      <PartnerMap
        partners={partners}
        kakaoMapAppKey={kakaoMapAppKey}
        selectedPartnerId={selectedPartnerId}
        onPartnerSelect={handlePartnerSelect}
        onUserLocationChange={handleUserLocationChange}
      />

      <div className="flex gap-2 overflow-x-auto text-sm">
        <button
          type="button"
          onClick={() => setSortMode("FASTEST")}
          className={sortButtonClass(sortMode === "FASTEST")}
        >
          가장 빠른 예약
        </button>
        <button
          type="button"
          onClick={() => setSortMode("DISTANCE")}
          disabled={!userLocation}
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
              className={`rounded-3xl border bg-white p-4 shadow-sm transition ${
                selected
                  ? "border-blue-500 ring-4 ring-blue-100"
                  : "border-zinc-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-900">
                    {partner.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {partner.address} · {formatBaySummary(partner)}
                  </p>
                </div>
                <Link
                  href={`/partner/${partner.id}`}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
                >
                  보기
                </Link>
              </div>

              <p className="mt-4 text-sm text-zinc-700">
                평점 {ratingLabel} · 리뷰 {partner.reviewCount}개
                {distanceLabel(distance) ? ` · ${distanceLabel(distance)}` : ""}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                    Self
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">시간대 예약</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    요금 정책 확인
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Shop
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">패키지 맡기기</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {partner.cheapestPackagePrice
                      ? `${formatPrice(partner.cheapestPackagePrice)}부터`
                      : "패키지 준비중"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  운영 정보는 상세 페이지에서 확인
                </span>
                <Link
                  href={`/partner/${partner.id}`}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  예약하기
                </Link>
              </div>
            </article>
          );
        })}

        {partners.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            등록된 제휴 정비소가 없습니다.
          </p>
        ) : null}
      </div>
    </>
  );
}

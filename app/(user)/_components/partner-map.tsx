"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

export interface PartnerMapItem {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface PartnerMapProps {
  partners: PartnerMapItem[];
  kakaoMapAppKey: string | null;
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  setBounds(bounds: KakaoLatLngBounds): void;
  addControl(control: unknown, position: number): void;
}

interface KakaoMarker {
  setMap(map: KakaoMap | null): void;
}

interface KakaoInfoWindow {
  open(map: KakaoMap, marker: KakaoMarker): void;
}

interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
}

interface KakaoMapsNamespace {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMap;
  Marker: new (options: {
    map?: KakaoMap;
    position: KakaoLatLng;
    title?: string;
  }) => KakaoMarker;
  InfoWindow: new (options: { content: string }) => KakaoInfoWindow;
  ZoomControl: new () => unknown;
  ControlPosition: {
    RIGHT: number;
  };
  event: {
    addListener(target: unknown, type: string, handler: () => void): void;
  };
  load(callback: () => void): void;
}

declare global {
  interface Window {
    kakao?: {
      maps: KakaoMapsNamespace;
    };
  }
}

const DEFAULT_CENTER = {
  lat: 37.5007,
  lng: 127.0364,
};

function loadKakaoMapSdk(appKey: string): Promise<KakaoMapsNamespace> {
  return new Promise((resolve, reject) => {
    const resolveLoadedMaps = () => {
      if (!window.kakao?.maps) {
        reject(new Error("Kakao Maps SDK did not expose window.kakao.maps"));
        return;
      }

      window.kakao.maps.load(() => resolve(window.kakao!.maps));
    };

    if (window.kakao?.maps) {
      resolveLoadedMaps();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-pitnow-kakao-map="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => {
          resolveLoadedMaps();
        },
        { once: true },
      );
      existingScript.addEventListener("error", () => reject(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.pitnowKakaoMap = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey,
    )}&autoload=false`;
    script.addEventListener("load", () => {
      resolveLoadedMaps();
    });
    script.addEventListener("error", () => reject());
    document.head.appendChild(script);
  });
}

function getMapPartners(partners: PartnerMapItem[]) {
  return partners.filter(
    (partner) =>
      typeof partner.lat === "number" &&
      Number.isFinite(partner.lat) &&
      typeof partner.lng === "number" &&
      Number.isFinite(partner.lng),
  ) as Array<PartnerMapItem & { lat: number; lng: number }>;
}

function getFallbackPosition(
  partner: PartnerMapItem & { lat: number; lng: number },
  partners: Array<PartnerMapItem & { lat: number; lng: number }>,
) {
  const lats = partners.map((item) => item.lat);
  const lngs = partners.map((item) => item.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.001);
  const lngRange = Math.max(maxLng - minLng, 0.001);

  return {
    top: `${82 - ((partner.lat - minLat) / latRange) * 64}%`,
    left: `${12 + ((partner.lng - minLng) / lngRange) * 76}%`,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function PartnerMap({ partners, kakaoMapAppKey }: PartnerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRefs = useRef<KakaoMarker[]>([]);
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "fallback">(
    kakaoMapAppKey ? "idle" : "fallback",
  );
  const [locationMessage, setLocationMessage] = useState(
    "위치 권한을 허용하면 내 주변 기준으로 볼 수 있어요.",
  );

  const mapPartners = useMemo(() => getMapPartners(partners), [partners]);
  const center = mapPartners[0] ?? DEFAULT_CENTER;

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!kakaoMapAppKey || !containerRef.current || mapPartners.length === 0) {
        setStatus("fallback");
        return;
      }

      setStatus("loading");

      try {
        const kakaoMaps = await loadKakaoMapSdk(kakaoMapAppKey);

        if (cancelled || !containerRef.current) {
          return;
        }

        const mapCenter = new kakaoMaps.LatLng(center.lat, center.lng);
        const map = new kakaoMaps.Map(containerRef.current, {
          center: mapCenter,
          level: 6,
        });
        map.addControl(
          new kakaoMaps.ZoomControl(),
          kakaoMaps.ControlPosition.RIGHT,
        );

        markerRefs.current.forEach((marker) => marker.setMap(null));
        markerRefs.current = [];

        const bounds = new kakaoMaps.LatLngBounds();

        for (const partner of mapPartners) {
          const position = new kakaoMaps.LatLng(partner.lat, partner.lng);
          const marker = new kakaoMaps.Marker({
            map,
            position,
            title: partner.name,
          });
          const infoWindow = new kakaoMaps.InfoWindow({
            content: `<div style="padding:8px 10px;font-size:12px;line-height:1.4;white-space:nowrap;"><strong>${escapeHtml(
              partner.name,
            )}</strong><br/>${escapeHtml(partner.address)}</div>`,
          });

          kakaoMaps.event.addListener(marker, "click", () => {
            infoWindow.open(map, marker);
          });
          markerRefs.current.push(marker);
          bounds.extend(position);
        }

        map.setBounds(bounds);
        mapRef.current = map;
        setStatus("ready");
      } catch {
        setStatus("fallback");
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      markerRefs.current.forEach((marker) => marker.setMap(null));
      markerRefs.current = [];
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
    };
  }, [center.lat, center.lng, kakaoMapAppKey, mapPartners]);

  function moveToCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("이 브라우저에서는 위치 기능을 사용할 수 없어요.");
      return;
    }

    setLocationMessage("현재 위치를 확인하는 중입니다.");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!window.kakao?.maps || !mapRef.current) {
          setLocationMessage("지도 준비 후 다시 시도해 주세요.");
          return;
        }

        const currentPosition = new window.kakao.maps.LatLng(
          position.coords.latitude,
          position.coords.longitude,
        );
        userMarkerRef.current?.setMap(null);
        userMarkerRef.current = new window.kakao.maps.Marker({
          map: mapRef.current,
          position: currentPosition,
          title: "내 위치",
        });
        mapRef.current.setCenter(currentPosition);
        setLocationMessage("현재 위치 기준으로 지도를 이동했어요.");
      },
      () => {
        setLocationMessage("위치 권한이 없어 기본 지역으로 표시 중입니다.");
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
      },
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">내 주변 정비소</p>
          <p className="mt-0.5 text-xs text-zinc-500">{locationMessage}</p>
        </div>
        <button
          type="button"
          onClick={moveToCurrentLocation}
          disabled={status !== "ready"}
          className="rounded-full bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          내 위치
        </button>
      </div>

      <div className="relative h-52 bg-zinc-100">
        {status === "fallback" ? (
          <div className="absolute inset-0 overflow-hidden bg-[#eef3ea]">
            <div className="absolute left-[-10%] top-[24%] h-4 w-[120%] rotate-[-8deg] bg-white/80" />
            <div className="absolute left-[12%] top-[-10%] h-[120%] w-3 rotate-[24deg] bg-white/80" />
            <div className="absolute left-[60%] top-[-10%] h-[120%] w-4 rotate-[-18deg] bg-white/80" />
            <div className="absolute left-[-20%] top-[62%] h-5 w-[140%] rotate-[4deg] bg-white/80" />
            <div className="absolute right-[-10%] top-[6%] h-28 w-24 rounded-full bg-blue-100/70" />
            <div className="absolute bottom-[-18%] left-[-8%] h-28 w-32 rounded-full bg-emerald-100/80" />
            <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm">
              지도 키 설정 전 미리보기
            </div>
            {mapPartners.map((partner) => {
              const position = getFallbackPosition(partner, mapPartners);

              return (
                <Link
                  key={partner.id}
                  href={`/partner/${partner.id}`}
                  className="absolute -translate-x-1/2 -translate-y-full"
                  style={position}
                  aria-label={`${partner.name} 상세 보기`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg ring-4 ring-white">
                    P
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
        <div
          ref={containerRef}
          className={`h-full w-full ${status === "fallback" ? "invisible" : ""}`}
        />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
            지도를 불러오는 중입니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}

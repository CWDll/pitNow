"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  selectedPartnerId?: string | null;
  onPartnerSelect?: (partnerId: string) => void;
  onUserLocationChange?: (location: { lat: number; lng: number }) => void;
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  setBounds(bounds: KakaoLatLngBounds): void;
  setLevel(level: number): void;
  addControl(control: unknown, position: number): void;
}

interface KakaoOverlay {
  setMap(map: KakaoMap | null): void;
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
  }) => KakaoOverlay;
  CustomOverlay: new (options: {
    clickable?: boolean;
    content: HTMLElement | string;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
  }) => KakaoOverlay;
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

let kakaoMapSdkPromise: Promise<KakaoMapsNamespace> | null = null;

function loadKakaoMapSdk(appKey: string): Promise<KakaoMapsNamespace> {
  if (kakaoMapSdkPromise) {
    return kakaoMapSdkPromise;
  }

  kakaoMapSdkPromise = new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      kakaoMapSdkPromise = null;
      reject(error);
    };

    const resolveLoadedMaps = () => {
      if (!window.kakao?.maps) {
        fail(new Error("Kakao Maps SDK did not expose window.kakao.maps"));
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
      existingScript.remove();
    }

    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      script.remove();
      fail(new Error("Kakao Maps SDK load timed out"));
    }, 8000);

    script.async = true;
    script.dataset.pitnowKakaoMap = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey,
    )}&autoload=false`;
    script.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      resolveLoadedMaps();
    });
    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      fail(new Error("Kakao Maps SDK script failed to load"));
    });
    document.head.appendChild(script);
  });

  return kakaoMapSdkPromise;
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

function createPartnerOverlayContent(
  partner: PartnerMapItem,
  selected: boolean,
  onSelect: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `${partner.name} 선택`);
  button.style.cssText = [
    "appearance:none",
    "border:0",
    "background:transparent",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "gap:3px",
    "padding:0",
    "cursor:pointer",
    "transform:translateY(-2px)",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = partner.name;
  label.style.cssText = [
    "max-width:128px",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "border-radius:999px",
    "background:white",
    `border:1px solid ${selected ? "#2563eb" : "rgba(24,24,27,0.14)"}`,
    "box-shadow:0 8px 20px rgba(15,23,42,0.16)",
    "color:#18181b",
    "font-size:11px",
    "font-weight:700",
    "line-height:1",
    "padding:6px 8px",
  ].join(";");

  const pin = document.createElement("span");
  pin.style.cssText = [
    "display:flex",
    "height:28px",
    "width:28px",
    "align-items:center",
    "justify-content:center",
    "border-radius:999px",
    `background:${selected ? "#1d4ed8" : "#2563eb"}`,
    "box-shadow:0 8px 20px rgba(37,99,235,0.35)",
    "color:white",
    "font-size:12px",
    "font-weight:800",
    "outline:4px solid white",
  ].join(";");
  pin.textContent = "P";

  button.append(label, pin);
  button.addEventListener("click", onSelect);

  return button;
}

function createUserLocationOverlayContent() {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-label", "내 위치");
  wrapper.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "gap:3px",
    "transform:translateY(-2px)",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "내 위치";
  label.style.cssText = [
    "border-radius:999px",
    "background:white",
    "border:1px solid rgba(220,38,38,0.35)",
    "box-shadow:0 8px 20px rgba(15,23,42,0.16)",
    "color:#991b1b",
    "font-size:11px",
    "font-weight:800",
    "line-height:1",
    "padding:6px 8px",
  ].join(";");

  const dot = document.createElement("span");
  dot.style.cssText = [
    "display:block",
    "height:16px",
    "width:16px",
    "border-radius:999px",
    "background:#ef4444",
    "box-shadow:0 0 0 6px rgba(239,68,68,0.18),0 8px 20px rgba(239,68,68,0.35)",
    "outline:3px solid white",
  ].join(";");

  wrapper.append(label, dot);

  return wrapper;
}

export function PartnerMap({
  partners,
  kakaoMapAppKey,
  selectedPartnerId,
  onPartnerSelect,
  onUserLocationChange,
}: PartnerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRefs = useRef<KakaoOverlay[]>([]);
  const userMarkerRef = useRef<KakaoOverlay | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "fallback">(
    kakaoMapAppKey ? "idle" : "fallback",
  );
  const [mapFallbackReason, setMapFallbackReason] = useState(
    kakaoMapAppKey
      ? "Kakao 지도를 불러오지 못해 미리보기로 표시 중입니다."
      : "지도 키 설정 전 미리보기",
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
        setMapFallbackReason(
          kakaoMapAppKey
            ? "지도에 표시할 정비소 위치 정보가 없습니다."
            : "지도 키 설정 전 미리보기",
        );
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
          const marker = new kakaoMaps.CustomOverlay({
            clickable: true,
            content: createPartnerOverlayContent(
              partner,
              selectedPartnerId === partner.id,
              () => {
                onPartnerSelect?.(partner.id);
              },
            ),
            position,
            xAnchor: 0.5,
            yAnchor: 1,
          });

          marker.setMap(map);
          markerRefs.current.push(marker);

          bounds.extend(position);
        }

        map.setBounds(bounds);
        mapRef.current = map;
        setStatus("ready");
      } catch {
        setMapFallbackReason(
          "Kakao 지도를 불러오지 못해 미리보기로 표시 중입니다.",
        );
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
  }, [
    center.lat,
    center.lng,
    kakaoMapAppKey,
    mapPartners,
    onPartnerSelect,
    selectedPartnerId,
  ]);

  useEffect(() => {
    if (!selectedPartnerId || !window.kakao?.maps || !mapRef.current) {
      return;
    }

    const partner = mapPartners.find((item) => item.id === selectedPartnerId);

    if (!partner) {
      return;
    }

    mapRef.current.setCenter(
      new window.kakao.maps.LatLng(partner.lat, partner.lng),
    );
    mapRef.current.setLevel(5);
  }, [mapPartners, selectedPartnerId]);

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
        userMarkerRef.current = new window.kakao.maps.CustomOverlay({
          content: createUserLocationOverlayContent(),
          position: currentPosition,
          xAnchor: 0.5,
          yAnchor: 1,
        });
        userMarkerRef.current.setMap(mapRef.current);
        mapRef.current.setCenter(currentPosition);
        mapRef.current.setLevel(4);
        onUserLocationChange?.({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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
              {mapFallbackReason}
            </div>
            {mapPartners.map((partner) => {
              const position = getFallbackPosition(partner, mapPartners);

              return (
                <button
                  type="button"
                  key={partner.id}
                  className="absolute -translate-x-1/2 -translate-y-full"
                  style={position}
                  aria-label={`${partner.name} 상세 보기`}
                  onClick={() => onPartnerSelect?.(partner.id)}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg ring-4 ring-white">
                    P
                  </span>
                </button>
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

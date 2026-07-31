"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BookOpen,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImageIcon,
  LogIn,
  LogOut,
  Save,
  Scale,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";

import { authFetch } from "@/src/lib/auth-fetch";
import { supabase } from "@/src/lib/supabase";

import { ImageLightbox } from "../_components/image-lightbox";
import LegalFooter from "../_components/legal-footer";
import { Card, Line, Screen, StatePanel } from "../_components/mobile-ui";

const menuItems = [
  { label: "예약 내역", description: "예정된 예약과 지난 이용", href: "/reservation", icon: CalendarDays },
  { label: "내 차 관리", description: "예약 차량과 정비 이력", href: "/my-car", icon: CarFront },
  { label: "이용 가이드", description: "체크인과 체크아웃 절차", href: "/guide", icon: BookOpen },
  { label: "SELF 공통 안전교육", description: "최초 이용 전 시설·장비 안전수칙", href: "/safety-training?next=/mypage", icon: ShieldCheck },
  { label: "사업자 정보 및 정책", description: "이용기준, 개인정보, 취소·환불 안내", href: "/legal", icon: Scale },
];

interface UserProfile {
  nickname: string;
  full_name: string | null;
  phone: string | null;
}

interface MyReview {
  id: string;
  reservationId: string;
  partnerId: string;
  partnerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  images: Array<{ path: string; url: string }>;
}

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return fallback;
  }

  const error = (payload as { error?: string | { message?: string } }).error;
  return typeof error === "string" ? error : error?.message ?? fallback;
}

export default function MyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewPreview, setReviewPreview] = useState<{
    reviewId: string;
    imageIndex: number;
  } | null>(null);
  const previewReview = reviewPreview
    ? myReviews.find((review) => review.id === reviewPreview.reviewId)
    : null;
  const previewImages =
    previewReview?.images.map((image, index) => ({
      src: image.url,
      alt: `${previewReview.partnerName} 리뷰 사진 ${index + 1} 상세보기`,
    })) ?? [];
  const visibleReviews = showAllReviews ? myReviews : myReviews.slice(0, 3);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();

        if (mounted) {
          setUser(data.session?.user ?? null);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    void loadSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMemberData() {
      if (!user) {
        setProfile(null);
        setMyReviews([]);
        setShowAllReviews(false);
        return;
      }

      setIsProfileLoading(true);
      setIsReviewsLoading(true);

      const [profileResult, reviewResult] = await Promise.allSettled([
        authFetch("/api/profile", { cache: "no-store" }),
        authFetch("/api/reviews?mine=1", { cache: "no-store" }),
      ]);

      if (cancelled) {
        return;
      }

      if (profileResult.status === "fulfilled") {
        const payload = (await profileResult.value.json()) as {
          profile?: UserProfile | null;
        };
        if (profileResult.value.ok && payload.profile) {
          setProfile(payload.profile);
          setNickname(payload.profile.nickname);
          setFullName(payload.profile.full_name ?? "");
          setPhone(payload.profile.phone ?? "");
        } else {
          setProfileError("사용자 정보를 불러오지 못했습니다.");
        }
      } else {
        setProfileError("사용자 정보를 불러오지 못했습니다.");
      }

      if (reviewResult.status === "fulfilled") {
        const payload = (await reviewResult.value.json()) as {
          reviews?: MyReview[];
        };
        if (reviewResult.value.ok) {
          setMyReviews(payload.reviews ?? []);
          setShowAllReviews(false);
        }
      }

      setIsProfileLoading(false);
      setIsReviewsLoading(false);
    }

    void loadMemberData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  async function handleProfileSave() {
    setProfileError("");
    setProfileMessage("");
    setIsProfileSaving(true);

    try {
      const response = await authFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, fullName, phone }),
      });
      const payload = (await response.json()) as {
        profile?: UserProfile;
        error?: string | { message?: string };
      };

      if (!response.ok || !payload.profile) {
        setProfileError(readApiError(payload, "사용자 정보를 저장하지 못했습니다."));
        return;
      }

      setProfile(payload.profile);
      setNickname(payload.profile.nickname);
      setFullName(payload.profile.full_name ?? "");
      setPhone(payload.profile.phone ?? "");
      setProfileMessage("사용자 정보를 저장했습니다.");
    } catch {
      setProfileError("네트워크 오류로 사용자 정보를 저장하지 못했습니다.");
    } finally {
      setIsProfileSaving(false);
    }
  }

  return (
    <Screen title="마이페이지" subtitle="계정과 PitNow 이용 정보를 관리하세요.">
      {isLoading ? (
        <Card className="space-y-3">
          <Line widthClass="w-1/3" />
          <Line widthClass="w-2/3" />
        </Card>
      ) : user ? (
        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <UserRound className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-blue-600">PITNOW MEMBER</p>
              <p className="mt-1 truncate text-lg font-black text-slate-950">
                {profile?.nickname ?? "회원 정보 확인 중"}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {user.email ?? "이메일 정보 없음"}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-slate-600">닉네임</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                disabled={isProfileLoading}
                maxLength={20}
                placeholder="리뷰에 표시할 닉네임"
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              />
              <span className="text-[11px] font-semibold text-slate-500">
                리뷰에는 이름이나 연락처 대신 닉네임만 공개됩니다.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-bold text-slate-600">이름</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={isProfileLoading}
                  maxLength={50}
                  autoComplete="name"
                  placeholder="예약자 이름"
                  className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-bold text-slate-600">연락처</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={isProfileLoading}
                  maxLength={20}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                  className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
            </div>
          </div>

          {profileError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
              {profileError}
            </p>
          ) : null}
          {profileMessage ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              {profileMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleProfileSave()}
            disabled={isProfileSaving || isProfileLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Save className="size-4" />
            {isProfileSaving ? "저장 중..." : "사용자 정보 저장"}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:text-slate-300"
          >
            <LogOut className="size-4" />
            {isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </Card>
      ) : (
        <StatePanel
          icon={<UserRound className="size-6" />}
          title="로그인하고 PitNow를 이어서 이용하세요"
          description="예약, 체크인 사진, 체크아웃 정산을 계정에 안전하게 연결합니다."
          action={
            <Link
              href="/login?next=/mypage"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white"
            >
              <LogIn className="size-4" />
              로그인 / 회원가입
            </Link>
          }
        />
      )}

      <section aria-labelledby="my-menu-title">
        <h2 id="my-menu-title" className="mb-3 text-lg font-black text-slate-950">서비스 메뉴</h2>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 py-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">{item.label}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{item.description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-slate-400" />
            </Link>
            );
          })}
        </div>
      </section>

      {user ? (
        <section aria-labelledby="my-review-title">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 id="my-review-title" className="text-lg font-black text-slate-950">
                내가 남긴 리뷰
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                작성한 평가와 사진을 정비소별로 확인하세요.
              </p>
            </div>
            <span className="text-xs font-black text-blue-600">
              {myReviews.length}개
            </span>
          </div>

          {isReviewsLoading ? (
            <Card className="space-y-3">
              <Line widthClass="w-1/3" />
              <Line widthClass="w-2/3" />
            </Card>
          ) : myReviews.length === 0 ? (
            <Card className="py-8 text-center">
              <Star className="mx-auto size-6 text-slate-400" />
              <p className="mt-3 text-sm font-black text-slate-800">
                아직 작성한 리뷰가 없습니다.
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                정비 이용을 완료하면 리뷰를 남길 수 있습니다.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {visibleReviews.map((review) => (
                <article
                  key={review.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">
                          {review.partnerName}
                        </p>
                        <p className="mt-1 text-xs font-bold text-amber-500">
                          {"★".repeat(review.rating)}
                          <span className="text-slate-300">
                            {"★".repeat(5 - review.rating)}
                          </span>
                        </p>
                      </div>
                      <time className="shrink-0 text-[11px] font-semibold text-slate-500">
                        {new Intl.DateTimeFormat("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(review.createdAt))}
                      </time>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">
                      {review.comment || "별점으로 남긴 리뷰입니다."}
                    </p>

                    {review.images.length > 0 ? (
                      <div className="mt-3 grid grid-cols-4 gap-1.5">
                        {review.images.map((image, index) => (
                          <button
                            key={image.path}
                            type="button"
                            onClick={() =>
                              setReviewPreview({
                                reviewId: review.id,
                                imageIndex: index,
                              })
                            }
                            aria-label={`${review.partnerName} 리뷰 사진 ${index + 1} 크게 보기`}
                            className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                          >
                            {/* Public review media is intentionally rendered directly. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image.url}
                              alt={`${review.partnerName} 리뷰 사진 ${index + 1}`}
                              className="size-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                        <ImageIcon className="size-3.5" />
                        첨부 사진 없음
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/partner/${review.partnerId}/reviews`}
                    className="flex h-10 items-center justify-center gap-1 border-t border-slate-100 text-xs font-black text-blue-600"
                  >
                    정비소 리뷰 보기
                    <ChevronRight className="size-3.5" />
                  </Link>
                </article>
              ))}
              {myReviews.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllReviews((current) => !current)}
                  aria-expanded={showAllReviews}
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm"
                >
                  {showAllReviews ? (
                    <>
                      리뷰 접기
                      <ChevronUp className="size-4" />
                    </>
                  ) : (
                    <>
                      전체 리뷰 {myReviews.length}개 보기
                      <ChevronDown className="size-4" />
                    </>
                  )}
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <LegalFooter />

      <ImageLightbox
        images={previewImages}
        activeIndex={reviewPreview?.imageIndex ?? null}
        dialogLabel={
          previewReview
            ? `${previewReview.partnerName} 리뷰 사진 상세보기`
            : "내 리뷰 사진 상세보기"
        }
        closeLabel="내 리뷰 사진 닫기"
        onClose={() => setReviewPreview(null)}
        onIndexChange={(imageIndex) =>
          setReviewPreview((current) =>
            current ? { ...current, imageIndex } : null,
          )
        }
      />
    </Screen>
  );
}

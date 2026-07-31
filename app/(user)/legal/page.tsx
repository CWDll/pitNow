import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Handshake,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";

import { Screen } from "../_components/mobile-ui";

export const metadata: Metadata = {
  title: "사업자 정보 및 정책",
  description: "PitNow 운영 정보, 이용기준, 개인정보처리 및 취소·환불 정책",
};

const policyLinks = [
  { href: "#operator", label: "운영자 정보" },
  { href: "#intermediary", label: "중개 서비스" },
  { href: "#terms", label: "이용기준" },
  { href: "#privacy", label: "개인정보처리" },
  { href: "#refunds", label: "취소·환불" },
  { href: "#disputes", label: "분쟁처리" },
];

const operatorRows = [
  ["서비스명", "PitNow"],
  ["서비스 유형", "정비소 예약 및 결제 중개"],
  ["사업자등록번호", "등록 완료 후 공개"],
  ["통신판매업 신고번호", "신고 완료 후 공개"],
  ["사업장 소재지", "사업자등록 정보 확정 후 공개"],
  ["고객 문의", "운영 연락처 확정 후 공개"],
];

function PolicySection({
  id,
  icon,
  eyebrow,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-5 border-t border-slate-200 pt-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </span>
        <div>
          <p className="text-[11px] font-black text-blue-600">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-1 text-lg font-black text-slate-950">
            {title}
          </h2>
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm font-medium leading-6 text-slate-600">
        {children}
      </div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <Screen title="사업자 정보 및 정책" subtitle="PitNow 이용과 거래에 적용되는 기준을 확인하세요.">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-700" />
          <div>
            <p className="text-sm font-black text-blue-950">예약 전에 거래 주체를 확인해 주세요</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-blue-800">
              실제 베이·정비 서비스의 판매자와 제공자는 예약한 정비소이며, PitNow는 정비소 정보와 예약·결제를 연결하는 통신판매중개 서비스입니다.
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="정책 목차" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {policyLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-11 items-center justify-between bg-white px-3 text-xs font-bold text-slate-700"
          >
            {item.label}
            <ChevronRight className="size-3.5 text-slate-400" />
          </Link>
        ))}
      </nav>

      <PolicySection
        id="operator"
        icon={<Building2 className="size-4.5" />}
        eyebrow="OPERATOR"
        title="운영자 정보"
      >
        <dl className="divide-y divide-slate-100 border-y border-slate-200">
          {operatorRows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[7.25rem_1fr] gap-3 py-3">
              <dt className="text-xs font-bold text-slate-500">{label}</dt>
              <dd className="text-right text-xs font-bold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          사업자등록과 통신판매업 신고가 완료되면 등록된 상호, 대표자, 사업장 주소, 등록번호와 고객 문의 채널을 이 화면에 공개합니다.
        </p>
      </PolicySection>

      <PolicySection
        id="intermediary"
        icon={<Handshake className="size-4.5" />}
        eyebrow="MARKETPLACE"
        title="통신판매중개자 고지"
      >
        <p>
          PitNow는 정비소와 이용자 사이의 예약 및 결제를 중개합니다. 예약한 정비소는 실제 시설과 정비 서비스를 제공하며, 정비소별 상호·주소·연락처와 서비스 조건은 정비소 상세 및 결제 단계에서 확인할 수 있습니다.
        </p>
        <p>
          PitNow는 거래 당사자가 아니라는 이유만으로 PitNow의 예약·결제 시스템 오류, 잘못된 정보 표시 또는 관계 법령에 따른 책임까지 배제하지 않습니다.
        </p>
      </PolicySection>

      <PolicySection
        id="terms"
        icon={<FileCheck2 className="size-4.5" />}
        eyebrow="SERVICE RULES"
        title="서비스 이용기준"
      >
        <ul className="list-disc space-y-2 pl-5 marker:text-blue-600">
          <li>예약자는 정확한 회원·차량 정보를 등록하고 선택한 정비소, 작업, 시간과 이용 조건을 확인해야 합니다.</li>
          <li>SELF 예약은 선택한 작업 범위와 안전수칙을 지키며, 현장 도착 인증과 차량 사진 제출 후 이용을 시작합니다.</li>
          <li>SHOP 예약은 정비소가 작업 시작과 완료 상태를 관리하며, 이용자는 앱에서 진행 상태를 확인합니다.</li>
          <li>예약 종료 후에는 공구 반납, 베이 청소, 폐기물 처리와 체크아웃 증적 제출이 필요합니다.</li>
          <li>종료 시각을 넘긴 SELF 이용에는 공개된 기준에 따른 추가요금이 발생할 수 있습니다.</li>
        </ul>
        <div className="rounded-xl bg-slate-100 px-3 py-3 text-xs font-semibold leading-5 text-slate-600">
          정비사 작업 확인은 예약한 SELF 작업 중 신청한 항목만 확인하는 부가서비스입니다. 차량 전체의 안전성, 향후 고장 또는 운행 가능 여부를 보증하지 않습니다.
        </div>
      </PolicySection>

      <PolicySection
        id="privacy"
        icon={<LockKeyhole className="size-4.5" />}
        eyebrow="PRIVACY"
        title="개인정보 처리 안내"
      >
        <p className="font-bold text-slate-800">처리하는 정보</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-blue-600">
          <li>계정 식별정보, 이메일, 이름, 연락처, 공개용 닉네임</li>
          <li>차량번호, 모델, 연식, 차종과 예약 차량 정보</li>
          <li>예약·결제·환불 상태, 체크인·체크아웃 기록과 증적 사진</li>
          <li>안전교육 및 동의 기록, 리뷰·리뷰 사진, 서비스 이용 로그</li>
        </ul>
        <p>
          이 정보는 회원 관리, 예약 이행, 현장 운영, 결제·환불, 분쟁 대응과 서비스 보안을 위해 사용합니다. 카드번호와 결제 인증정보는 PitNow가 직접 저장하지 않으며 계약된 결제사업자가 처리합니다.
        </p>
        <p>
          예약 이행에 필요한 예약자·차량·작업 정보와 증적은 해당 정비소에 제공될 수 있습니다. 리뷰에는 이용자가 설정한 닉네임만 공개하며 이름, 연락처와 차량번호는 공개하지 않습니다.
        </p>
        <p>
          개인정보는 이용 목적 달성 또는 회원 탈퇴 시 지체 없이 파기하는 것을 원칙으로 하며, 전자상거래 등 관계 법령에 보존 의무가 있는 거래 기록은 해당 기간 동안 분리해 보관합니다.
        </p>
      </PolicySection>

      <PolicySection
        id="refunds"
        icon={<CircleDollarSign className="size-4.5" />}
        eyebrow="CANCELLATION"
        title="취소·환불 및 노쇼"
      >
        <ul className="list-disc space-y-2 pl-5 marker:text-blue-600">
          <li>예약 확정 상태에서는 예약 내역에서 취소를 요청할 수 있습니다.</li>
          <li>환불 가능 금액은 결제 시 고지된 기준과 해당 정비소의 취소 정책에 따라 결정됩니다.</li>
          <li>체크인 이후에는 앱에서 직접 취소할 수 없으며, 정비소와 PitNow의 확인이 필요합니다.</li>
          <li>예약 종료 시각까지 체크인하지 않은 예약은 노쇼로 처리되며 자동 환불되지 않습니다.</li>
          <li>정비소 또는 시스템 귀책으로 서비스를 제공하지 못한 경우 확인 후 환불 절차를 진행합니다.</li>
        </ul>
        <p>
          결제 취소가 결제사업자에서 즉시 완료되지 않으면 환불 확인 상태로 기록하고 운영자가 결제 내역을 확인합니다.
        </p>
      </PolicySection>

      <PolicySection
        id="disputes"
        icon={<MessageSquareText className="size-4.5" />}
        eyebrow="SUPPORT"
        title="문의 및 분쟁 처리"
      >
        <p>
          예약·결제 시스템 오류는 PitNow가 확인하고, 정비 품질·시설·현장 작업에 관한 사항은 실제 서비스를 제공한 정비소가 우선 확인합니다. PitNow는 예약 ID, 결제 기록, 증적 사진과 상태 로그를 바탕으로 접수와 사실 확인을 지원합니다.
        </p>
        <p>
          접수된 분쟁은 3영업일 이내 진행 상황을 안내하고, 10영업일 이내 처리 결과 또는 향후 처리 계획을 안내하는 것을 운영 기준으로 합니다. 책임 판단이 어려운 사고는 보험사 또는 관계 기관의 절차를 따를 수 있습니다.
        </p>
      </PolicySection>

      <div className="border-t border-slate-200 pt-4 text-[11px] font-medium leading-5 text-slate-500">
        <p>시행일: 2026년 7월 31일</p>
        <p className="mt-1">정책 변경 시 적용일과 주요 변경 내용을 서비스에서 안내합니다.</p>
      </div>
    </Screen>
  );
}

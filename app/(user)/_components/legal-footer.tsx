import Link from "next/link";

const legalLinks = [
  { href: "/legal#terms", label: "이용기준" },
  { href: "/legal#privacy", label: "개인정보처리" },
  { href: "/legal#refunds", label: "취소·환불" },
  { href: "/legal#disputes", label: "분쟁처리" },
];

export default function LegalFooter() {
  return (
    <footer
      aria-label="PitNow 사업자 및 정책 정보"
      className="border-t border-slate-200 pb-2 pt-5 text-[11px] font-medium leading-5 text-slate-500"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-slate-700">PitNow</p>
        <Link href="/legal" className="font-bold text-slate-700 underline underline-offset-4">
          사업자·정책 정보
        </Link>
      </div>
      <p className="mt-2">정비소 예약 및 결제 중개 서비스</p>
      <p>사업자등록번호·통신판매업 신고번호는 등록 완료 후 공개됩니다.</p>
      <nav aria-label="정책 바로가기" className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {legalLinks.map((item) => (
          <Link key={item.href} href={item.href} className="font-bold text-slate-600">
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-slate-400">© 2026 PitNow. All rights reserved.</p>
    </footer>
  );
}

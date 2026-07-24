const fieldLabels: Record<string, string> = {
  action: "작업",
  allowedVehicleTypes: "허용 차종",
  bayName: "베이",
  blockId: "차단 ID",
  code: "패키지 코드",
  description: "설명",
  durationMinutes: "소요시간",
  endAt: "종료",
  id: "ID",
  isActive: "활성 상태",
  laborPrice: "공임",
  maxVehicleWeightKg: "최대 허용 중량",
  name: "이름",
  noteType: "메모 유형",
  packageId: "패키지 ID",
  partnerId: "정비소 ID",
  priceId: "가격 ID",
  reason: "사유",
  reservationId: "예약 ID",
  startAt: "시작",
  targetType: "대상",
};

function normalizeKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function humanizeKey(key: string) {
  const normalized = normalizeKey(key);
  return (
    fieldLabels[normalized] ??
    normalized.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) =>
      value.toUpperCase(),
    )
  );
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "없음";
  }

  if (typeof value === "boolean") {
    return value ? "활성" : "비활성";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "전체";
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => `${humanizeKey(childKey)}: ${formatValue(childKey, childValue)}`)
      .join(" · ");
  }

  const normalizedKey = normalizeKey(key);
  const numericValue = Number(value);

  if (
    Number.isFinite(numericValue) &&
    ["laborPrice", "price", "amount"].some((part) =>
      normalizedKey.toLowerCase().includes(part.toLowerCase()),
    )
  ) {
    return `${numericValue.toLocaleString("ko-KR")}원`;
  }

  if (normalizedKey === "durationMinutes" && Number.isFinite(numericValue)) {
    return `${numericValue.toLocaleString("ko-KR")}분`;
  }

  if (normalizedKey === "maxVehicleWeightKg" && Number.isFinite(numericValue)) {
    return `${numericValue.toLocaleString("ko-KR")}kg`;
  }

  return String(value);
}

interface AuditChangeListProps {
  after: Record<string, unknown>;
  before?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function AuditChangeList({
  after,
  before = {},
  metadata = {},
}: AuditChangeListProps) {
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const metadataEntries = Object.entries(metadata);

  if (keys.length === 0 && metadataEntries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      {keys.map((key) => (
        <div
          key={key}
          className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 bg-white px-4 py-3 text-sm last:border-b-0"
        >
          <span className="font-semibold text-slate-600">{humanizeKey(key)}</span>
          <span className="min-w-0 text-slate-900">
            {Object.prototype.hasOwnProperty.call(before, key) ? (
              <>
                <span className="text-slate-500">
                  {formatValue(key, before[key])}
                </span>
                <span className="px-2 text-slate-400">→</span>
              </>
            ) : null}
            <span className="font-semibold">{formatValue(key, after[key])}</span>
          </span>
        </div>
      ))}
      {metadataEntries.map(([key, value]) => (
        <div
          key={`metadata-${key}`}
          className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm last:border-b-0"
        >
          <span className="font-semibold text-slate-600">{humanizeKey(key)}</span>
          <span className="text-slate-900">{formatValue(key, value)}</span>
        </div>
      ))}
    </div>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => setCopied(await copyToClipboard(address))}
      aria-label={copied ? "주소 복사 완료" : "주소 복사"}
      title={copied ? "주소 복사 완료" : "주소 복사"}
      className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors ${
        copied
          ? "bg-emerald-50 text-emerald-600"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      <span className="sr-only" aria-live="polite">
        {copied ? "주소가 복사되었습니다." : ""}
      </span>
    </button>
  );
}

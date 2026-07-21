import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface ScreenProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

interface PillProps {
  label: string;
  tone?: "default" | "accent";
}

interface LineProps {
  widthClass?: string;
}

interface StatePanelProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger";
}

interface FlowHeaderProps {
  title: string;
  onBack: () => void;
}

function cx(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <section className="space-y-5 pt-7">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="text-sm font-medium leading-6 text-slate-500">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

export function FlowHeader({ title, onBack }: FlowHeaderProps) {
  return (
    <header className="mb-5 flex min-h-11 items-center gap-3 pt-6">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로가기"
        className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
      >
        <ArrowLeft className="size-5" />
      </button>
      <h1 className="text-2xl font-black text-slate-950">{title}</h1>
    </header>
  );
}

export function Card({ children, className }: CardProps) {
  return (
    <article
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function Pill({ label, tone = "default" }: PillProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-bold",
        tone === "accent"
          ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
          : "bg-slate-100 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

export function Line({ widthClass = "w-full" }: LineProps) {
  return <div className={cx("h-3 animate-pulse rounded-md bg-slate-100", widthClass)} />;
}

export function DotGrid() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className="aspect-square rounded-xl border border-dashed border-slate-300 bg-slate-50"
        />
      ))}
    </div>
  );
}

export function StatePanel({
  icon,
  title,
  description,
  action,
  tone = "default",
}: StatePanelProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-7 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div
        className={cx(
          "mx-auto grid size-12 place-items-center rounded-2xl",
          tone === "danger"
            ? "bg-red-50 text-red-600"
            : "bg-blue-50 text-blue-700",
        )}
      >
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-slate-500">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </article>
  );
}

import type { ReactNode } from "react";

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

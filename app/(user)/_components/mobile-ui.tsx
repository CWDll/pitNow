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
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="text-sm text-zinc-500">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

export function Card({ children, className }: CardProps) {
  return (
    <article
      className={cx(
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,0.04)]",
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
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        tone === "accent" ? "bg-black text-white" : "bg-zinc-100 text-zinc-600",
      )}
    >
      {label}
    </span>
  );
}

export function Line({ widthClass = "w-full" }: LineProps) {
  return <div className={cx("h-3 rounded-md bg-zinc-100", widthClass)} />;
}

export function DotGrid() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className="aspect-square rounded-xl border border-dashed border-zinc-300 bg-zinc-50" />
      ))}
    </div>
  );
}

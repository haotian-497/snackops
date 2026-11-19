import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "ok" | "warn" | "danger" | "info";

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-muted text-foreground",
  ok: "bg-emerald-50 text-emerald-900",
  warn: "bg-amber-50 text-amber-950",
  danger: "bg-red-50 text-red-900",
  info: "bg-sky-50 text-sky-900",
};

export function StatusLabel({
  text,
  tone = "neutral",
  className,
}: {
  text: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {text}
    </span>
  );
}

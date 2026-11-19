import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function FeedbackBanner({
  phase,
  message,
}: {
  phase: "idle" | "loading" | "success" | "error";
  message: string;
}) {
  if (phase === "idle" || !message) {
    return null;
  }

  const Icon =
    phase === "loading" ? LoaderCircle : phase === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={phase === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        phase === "loading" && "border-border bg-muted",
        phase === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        phase === "error" && "border-red-200 bg-red-50 text-red-950",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", phase === "loading" && "animate-spin")} />
      <p>{message}</p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

export type ActionPhase = "idle" | "loading" | "success" | "error";

export function useActionFeedback() {
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<string>, fallbackError: string) {
    setPhase("loading");
    setMessage("正在处理…");
    startTransition(() => {
      void task()
        .then((text) => {
          setPhase("success");
          setMessage(text);
        })
        .catch((error: unknown) => {
          setPhase("error");
          setMessage(error instanceof Error ? error.message : fallbackError);
        });
    });
  }

  return { phase: pending ? "loading" : phase, message, run };
}

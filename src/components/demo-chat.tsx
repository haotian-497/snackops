"use client";

import { Send } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { streamAgentRun } from "@/lib/agent/client";
import type { AgentEvent } from "@/lib/agent/events";
import { cn } from "@/lib/utils";
import type { RunRecord } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  runId?: string;
  seed?: boolean;
};

const SEED_MESSAGES: ChatMessage[] = [
  { id: "seed_u1", role: "user", content: "我买的零食到哪了？", seed: true },
  {
    id: "seed_a1",
    role: "assistant",
    content: "您的订单 86731 已到本地仓，预计明天送达~",
    seed: true,
  },
  { id: "seed_u2", role: "user", content: "怎么退货？", seed: true },
  {
    id: "seed_a2",
    role: "assistant",
    content: "支持 7 天无理由，我帮您发起~",
    seed: true,
  },
];

const QUICK_QUESTIONS = [
  "我的快递到哪了？",
  "怎么退货？",
  "换货要多久？",
  "推荐几款好吃的零食",
];

const LOW_SCORE_REASONS = ["回答不准", "态度不好", "没有解决问题", "其他"];
const RATING_IDLE_MS = 20_000;
const END_UTTERANCE =
  /^(?:(?:好的?|行|嗯)[,，]?)?(?:谢谢(?:你|了)?[,，]?)?(?:不用了|不需要了?|没事了|没问题了|就这样吧?|先这样吧?|不聊了|不回了|先不回了|先不聊了|再见|拜拜|结束对话|结束|不用回复了?)(?:了|吧|哦|呀|哈|！|!|。|~|～)*$/;

function isExplicitEnd(text: string) {
  const normalized = text.trim().replace(/\s+/g, "");
  return normalized.length > 0 && normalized.length <= 24 && END_UTTERANCE.test(normalized);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DemoChat() {
  const conversationId = useId().replace(/:/g, "") || "demo";
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
  const [score, setScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const endNowRef = useRef(false);

  function clearIdleTimer() {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing, ratingOpen, rated]);

  useEffect(() => {
    return () => clearIdleTimer();
  }, []);

  useEffect(() => {
    clearIdleTimer();
    setScore(0);
    setHoverScore(0);
    setReason("");
    setComment("");
    setRated(false);
    setRatingOpen(false);
    if (!lastRun?.finalReply) return;
    if (endNowRef.current) {
      endNowRef.current = false;
      setRatingOpen(true);
    }
  }, [lastRun?.id]);

  useEffect(() => {
    if (!lastRun?.finalReply || ratingOpen || rated || busy) return;
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      setRatingOpen(true);
    }, RATING_IDLE_MS);
    return () => clearIdleTimer();
  }, [busy, draft, lastRun?.id, rated, ratingOpen]);

  async function saveRating(nextScore: number, nextReason: string) {
    if (!lastRun) return;
    setRatingBusy(true);
    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: lastRun.id,
          score: nextScore,
          comment: [nextReason, comment].filter(Boolean).join(" · "),
          channel: "user",
          createdBy: "用户",
          issueType: nextReason || undefined,
        }),
      });
      const json = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || json.ok === false) throw new Error(json.message || "评分失败");
      setRated(true);
      toast.success("感谢你的评价");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "评分失败");
    } finally {
      setRatingBusy(false);
    }
  }

  async function submitRating(nextScore: number) {
    if (!lastRun || ratingBusy || rated) return;
    setScore(nextScore);
    if (nextScore > 2) {
      await saveRating(nextScore, "");
      return;
    }
    if (reason) await saveRating(nextScore, reason);
  }

  async function sendMessage(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;

    const history = messages.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: question,
    };
    endNowRef.current = isExplicitEnd(question);
    clearIdleTimer();
    setRatingOpen(false);
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setBusy(true);
    setTyping(true);
    setLastRun(null);

    const started = Date.now();
    const result: { run: RunRecord | null; errorMessage: string } = { run: null, errorMessage: "" };

    try {
      await streamAgentRun(
        {
          question,
          source: "demo",
          conversationId: `demo_${conversationId}`,
          conversationHistory: history,
        },
        (event: AgentEvent) => {
          if (event.type === "done") result.run = event.run;
          if (event.type === "error") result.errorMessage = event.message;
        },
      );
    } catch (error) {
      result.errorMessage = error instanceof Error ? error.message : "暂时没连上客服，请稍后再试";
    }

    const elapsed = Date.now() - started;
    if (elapsed < 1000) await sleep(1000 - elapsed);
    setTyping(false);

    if (result.run?.finalReply) {
      const doneRun = result.run;
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${doneRun.id}`,
          role: "assistant",
          content: doneRun.finalReply || "",
          runId: doneRun.id,
        },
      ]);
      setLastRun(doneRun);
    } else {
      endNowRef.current = false;
      setMessages((prev) => [
        ...prev,
        {
          id: `a_err_${Date.now()}`,
          role: "assistant",
          content: result.errorMessage || "抱歉，刚才没回复成功，您可以再发一次。",
        },
      ]);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex h-[min(780px,calc(100vh-7.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#e8d9c8] bg-[#f6efe6] shadow-[0_12px_40px_rgba(92,60,30,0.08)]">
      {/* 顶部标题栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[#eadfce] bg-[#fff9f2] px-5 py-3.5">
        <div className="flex size-10 items-center justify-center rounded-full bg-[#f0e0d0] text-sm font-semibold text-[#a85a2a]">
          零
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-wide text-[#2a211c]">零食小助手</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#7a6a5c]">
            <span className="inline-block size-2 rounded-full bg-[#3cb371]" aria-hidden />
            在线 · 查物流 / 退换货 / 推荐零食
          </p>
        </div>
      </header>

      {/* 消息区 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((item) => (
          <div
            key={item.id}
            className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words shadow-sm",
                item.role === "user"
                  ? "rounded-br-md bg-[#e8a06a] text-[#2a1810]"
                  : "rounded-bl-md border border-[#eadfce] bg-[#fffdf9] text-[#2a211c]",
              )}
            >
              {item.content}
            </div>
          </div>
        ))}

        {typing ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-[#eadfce] bg-[#fffdf9] px-3.5 py-2.5 text-sm text-[#8a7a6c]">
              正在输入…
            </div>
          </div>
        ) : null}

        {ratingOpen && lastRun?.finalReply && !typing ? (
          <div className="rounded-xl border border-[#eadfce] bg-[#fffaf3]/90 px-3 py-2.5">
            {rated ? (
              <p className="text-sm font-medium text-[#7a5a40]">感谢你的评价</p>
            ) : (
              <>
                <p className="mb-1.5 text-xs font-medium text-[#7a5a40]">这次回复怎么样？</p>
                <div className="flex flex-wrap items-center gap-1">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const active = (hoverScore || score) >= value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={ratingBusy}
                        aria-label={`${value} 分`}
                        className={cn(
                          "h-8 w-8 rounded-lg border text-xs",
                          active
                            ? "border-[#c45c26] bg-[#f0e0d0] font-medium text-[#8a4b24]"
                            : "border-[#e4d8c8] text-[#8a7a6c]",
                          ratingBusy && "opacity-60",
                        )}
                        onMouseEnter={() => setHoverScore(value)}
                        onMouseLeave={() => setHoverScore(0)}
                        onClick={() => void submitRating(value)}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                {score > 0 && score <= 2 ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {LOW_SCORE_REASONS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            reason === item
                              ? "border-[#c45c26] bg-[#f0e0d0] text-[#8a4b24]"
                              : "border-[#e4d8c8] text-[#7a6a5c]",
                          )}
                          onClick={() => setReason(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="min-h-14 w-full rounded-xl border border-[#e4d8c8] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#c45c26]"
                      placeholder="补充说明（可选）"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={ratingBusy}
                      className="rounded-full bg-[#c45c26] px-3 py-1 text-xs text-white disabled:opacity-60"
                      onClick={() => void saveRating(score, reason)}
                    >
                      提交评价
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* 底部：推荐问题 + 输入 */}
      <footer className="shrink-0 border-t border-[#eadfce] bg-[#fff9f2] px-3 py-3">
        <div className="mb-2.5 flex flex-wrap gap-2 px-0.5">
          {QUICK_QUESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              disabled={busy}
              className="rounded-full border border-[#e2d0bc] bg-white/90 px-3 py-1 text-xs text-[#8a5a35] transition hover:border-[#c45c26] hover:bg-[#fff6eb] disabled:opacity-50"
              onClick={() => void sendMessage(text)}
            >
              {text}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(draft);
          }}
        >
          <textarea
            rows={1}
            value={draft}
            disabled={busy}
            placeholder="说说您的订单、退换货或想吃什么…"
            className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-[#e4d8c8] bg-white px-3.5 py-2.5 text-sm leading-5 text-[#2a211c] outline-none placeholder:text-[#b0a090] focus:border-[#c45c26] disabled:opacity-60"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(draft);
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="发送"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#c45c26] text-white shadow-sm transition hover:bg-[#a84c1e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-[#a09080]">回车发送 · Shift+回车换行 · 真实走客服 Agent</p>
      </footer>
    </div>
  );
}

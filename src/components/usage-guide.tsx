"use client";

import { CircleHelp, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "1. 先跑通一次客服回复（约 2 分钟）",
    body: "默认已是 Demo 演示模式，无需 API Key。打开「工作台」或「Demo」，输入问题（可试：「客服说我中奖了，要转账验证才能兑奖」），观察 Planner → Tool → Skill → 风险审核 → 回复的完整链路。",
    href: "/" as const,
    linkLabel: "去工作台",
  },
  {
    title: "2. 看清「怎么答出来的」",
    body: "在运行结束后点进「运行详情」：核对计划选了哪些 Skill/Tool、查数结果、风险结论与最终回复。失败会标在具体步骤，不会用客服口吻把事故说圆。",
    href: "/runs" as const,
    linkLabel: "看运行存档",
  },
  {
    title: "3. 摸清业务数据与能力配置",
    body: "「业务目录」看商品/订单/FAQ 等样例数据；「Skill / Tool / Planner」查看与编辑提示词、工具说明（保存会打版本快照，便于回滚）。",
    href: "/catalog" as const,
    linkLabel: "看业务目录",
  },
  {
    title: "4. 走一遍运营改进闭环",
    body: "「运营」中心按顺序体验：运行监控 → 服务评价（Demo 一轮结束后可打分）→ 低分进改进建议 → 测评集跑批 → Prompt A/B → 版本回滚。这是产品区别于普通聊天机器人的核心。",
    href: "/ops" as const,
    linkLabel: "进运营中心",
  },
  {
    title: "5.（可选）切换真实模型对比效果",
    body: "「模型」页选厂商预设，填写 API Key 与 Base URL，切换到 openai-compatible 并测试连接。缺密钥会报错，不会静默退回 Demo。演示数据乱了可用「一键恢复演示数据」。",
    href: "/models" as const,
    linkLabel: "配置模型",
  },
] as const;

export function UsageGuideButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const dialog =
    open && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-foreground/40"
              aria-label="关闭使用说明"
              onClick={close}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
              style={{ maxHeight: "min(85vh, 36rem)" }}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <h2 id={titleId} className="text-base font-semibold">
                    SnackOps 使用说明
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    第一次用？按下面 5 步，约 10 分钟体验全套功能。
                  </p>
                </div>
                <Button
                  ref={closeRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  onClick={close}
                  aria-label="关闭"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <div
                className="space-y-4 overflow-y-auto overscroll-contain px-4 py-3 text-sm"
                style={{ maxHeight: "calc(min(85vh, 36rem) - 8.5rem)" }}
              >
                <div className="rounded-md bg-secondary/70 px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                  <p className="font-medium">产品是什么</p>
                  <p className="mt-1 text-muted-foreground">
                    零食电商客服 Agent
                    <span className="text-foreground">运营台</span>
                    ：不是再做一个聊天机器人，而是把每次回复拆成可检查、可打分、可回滚的步骤，让「答坏了」看得见、改得了、退得回。
                  </p>
                </div>

                <ol className="space-y-3">
                  {STEPS.map((step) => (
                    <li
                      key={step.title}
                      className="rounded-md border border-border bg-background/60 px-3 py-2.5"
                    >
                      <p className="font-medium leading-snug">{step.title}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                      <Link
                        href={step.href}
                        onClick={close}
                        className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                      >
                        {step.linkLabel} →
                      </Link>
                    </li>
                  ))}
                </ol>

                <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">记住 3 个要点</p>
                  <ul className="list-disc space-y-1 pl-4 leading-relaxed">
                    <li>先 Demo 讲通链路，再切真模型对比效果。</li>
                    <li>安全类问题看 risk-check；低分会进改进建议，改完用测评/A/B 验证。</li>
                    <li>顶栏模块都能点；运行存档从工作台「最近运行」或直接进详情。</li>
                  </ul>
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
                <Button type="button" variant="secondary" size="sm" onClick={close}>
                  知道了
                </Button>
                <Button type="button" size="sm" asChild>
                  <Link href="/" onClick={close}>
                    从工作台开始
                  </Link>
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
        使用说明
      </Button>
      {dialog}
    </>
  );
}

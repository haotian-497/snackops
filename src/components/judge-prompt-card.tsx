"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FeedbackBanner } from "@/components/feedback-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-state";
import { DEFAULT_JUDGE_SYSTEM_PROMPT } from "@/lib/eval/judge-prompt";
import type { JudgeConfig } from "@/lib/types";

export function JudgePromptCard({ initialConfig }: { initialConfig: JudgeConfig }) {
  const [prompt, setPrompt] = useState(initialConfig.systemPrompt);
  const [savedAt, setSavedAt] = useState(initialConfig.updatedAt);
  const saveAction = useActionFeedback();

  return (
    <Card>
      <CardHeader>
        <CardTitle>大模型裁判</CardTitle>
        <CardDescription>
          单条测试和批量测评都会用这段系统提示词做 LLM-as-Judge。六维分数为 1-5，与人工标注同一把尺子。保存后立即生效。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          裁判提示词
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-1 min-h-48 font-mono text-sm"
          />
        </label>
        <p className="text-xs text-muted-foreground">最近保存：{savedAt || "尚未保存"}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() =>
              saveAction.run(async () => {
                const response = await fetch("/api/eval/judge-config", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ systemPrompt: prompt }),
                });
                const json = (await response.json()) as { ok?: boolean; message?: string; config?: JudgeConfig };
                if (!response.ok || json.ok === false || !json.config) {
                  throw new Error(json.message || "保存失败");
                }
                setPrompt(json.config.systemPrompt);
                setSavedAt(json.config.updatedAt);
                toast.success(json.message || "已保存 Judge 提示词");
                return json.message || "已保存 Judge 提示词";
              }, "保存失败")
            }
          >
            保存提示词
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrompt(DEFAULT_JUDGE_SYSTEM_PROMPT)}
          >
            恢复默认
          </Button>
        </div>
        <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
      </CardContent>
    </Card>
  );
}

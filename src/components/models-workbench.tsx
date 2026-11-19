"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FeedbackBanner } from "@/components/feedback-banner";
import { StatusLabel } from "@/components/status-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/hooks/use-action-state";
import type { LlmProviderId, PublicLlmConfig } from "@/lib/types";

type TestResult = {
  ok?: boolean;
  provider?: string;
  model?: string;
  fixture?: boolean;
  code?: string;
  message?: string;
  hint?: string;
};

export function ModelsWorkbench({ initialConfig }: { initialConfig: PublicLlmConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [model, setModel] = useState(initialConfig.model);
  const [temperature, setTemperature] = useState(String(initialConfig.temperature));
  const [maxTokens, setMaxTokens] = useState(String(initialConfig.maxTokens));
  const [vendorPresetId, setVendorPresetId] = useState(initialConfig.connection.vendorPresetId || "deepseek");
  const [baseUrl, setBaseUrl] = useState(initialConfig.connection.baseUrl);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const modeAction = useActionFeedback();
  const saveAction = useActionFeedback();
  const testAction = useActionFeedback();
  const resetAction = useActionFeedback();

  const isDemo = config.provider === "demo";

  const activePreset = useMemo(
    () => config.presets.find((item) => item.id === vendorPresetId),
    [config.presets, vendorPresetId],
  );

  const activeSlot = config.connection.slots?.[vendorPresetId];

  function syncFromConfig(next: PublicLlmConfig) {
    setConfig(next);
    setModel(next.model);
    setTemperature(String(next.temperature));
    setMaxTokens(String(next.maxTokens));
    setBaseUrl(next.connection.baseUrl);
    setVendorPresetId(next.connection.vendorPresetId || "custom");
    setApiKeyInput("");
  }

  async function putConfig(body: Record<string, unknown>) {
    const response = await fetch("/api/llm-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      message?: string;
      config?: PublicLlmConfig;
    };
    if (!response.ok || !json.config) throw new Error(json.message || "保存失败");
    syncFromConfig(json.config);
    return json;
  }

  async function switchMode(provider: LlmProviderId, nextModel?: string) {
    const response = await fetch("/api/llm-config/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: nextModel }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      message?: string;
      config?: PublicLlmConfig;
    };
    if (!response.ok || !json.config) throw new Error(json.message || "切换失败");
    syncFromConfig(json.config);
    return json;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">运行模式</CardTitle>
            <CardDescription>一键切换 Demo / 真实模型</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={isDemo ? "default" : "outline"}
                onClick={() =>
                  modeAction.run(async () => {
                    const json = await switchMode("demo", "demo-v1");
                    toast.success(json.message || "已切换到 Demo");
                    return json.message || "已切换到 Demo";
                  }, "切换失败")
                }
              >
                Demo
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isDemo ? "default" : "outline"}
                onClick={() =>
                  modeAction.run(async () => {
                    const preset = config.presets.find((item) => item.id === vendorPresetId);
                    const slotModel = config.connection.slots?.[vendorPresetId]?.model;
                    const nextModel =
                      slotModel ||
                      (model && model !== "demo-v1" ? model : preset?.models[0]?.id || "deepseek-v4-flash");
                    await putConfig({
                      provider: "openai-compatible",
                      model: nextModel,
                      vendorPresetId,
                      baseUrl: config.connection.slots?.[vendorPresetId]?.baseUrl || baseUrl,
                    });
                    toast.success("已切换到真实模型");
                    return "已切换到真实模型";
                  }, "切换失败")
                }
              >
                真实模型
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isDemo ? (
                <>
                  当前 <StatusLabel text="Demo" tone="warn" /> · 不调外部接口
                </>
              ) : (
                <>
                  当前 <StatusLabel text="真实模型" tone="ok" /> · {config.connection.vendorPresetId}
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-muted-foreground">
                温度
                <Input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  className="mt-1 h-8"
                />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                Token
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                  className="mt-1 h-8"
                />
              </label>
            </div>
            <FeedbackBanner phase={modeAction.phase} message={modeAction.message} />
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">真实模型配置</CardTitle>
            <CardDescription>
              每个厂商单独预存 Key；切换 DeepSeek / 通义会自动带出对应槽位，不用重复粘贴。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {config.presets.map((preset) => {
                const slot = config.connection.slots?.[preset.id];
                const active = vendorPresetId === preset.id && !isDemo;
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 gap-1 px-2.5"
                    onClick={() =>
                      modeAction.run(async () => {
                        const nextModel =
                          slot?.model || preset.models[0]?.id || (model !== "demo-v1" ? model : "");
                        const nextBaseUrl = slot?.baseUrl || preset.baseUrl || baseUrl;
                        await putConfig({
                          provider: "openai-compatible",
                          model: nextModel || undefined,
                          baseUrl: nextBaseUrl,
                          vendorPresetId: preset.id,
                          temperature: Number(temperature),
                          maxTokens: Number(maxTokens),
                        });
                        toast.success(
                          slot?.apiKeySet
                            ? `已切换到 ${preset.label}（已用预存 Key）`
                            : `已切换到 ${preset.label}（尚未保存 Key）`,
                        );
                        return `已切换到 ${preset.label}`;
                      }, "切换厂商失败")
                    }
                  >
                    {preset.label}
                    {slot?.apiKeySet ? <span className="text-[10px] opacity-80">·已存</span> : null}
                  </Button>
                );
              })}
            </div>
            {activePreset ? <p className="text-[11px] text-muted-foreground">{activePreset.description}</p> : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px] text-muted-foreground sm:col-span-2">
                Base URL
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="mt-1 h-8"
                  placeholder="https://api.deepseek.com"
                />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                模型名
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="mt-1 h-8"
                  list="llm-model-suggestions"
                />
                <datalist id="llm-model-suggestions">
                  {(activePreset?.models?.length ? activePreset.models : config.models).map((item) => (
                    <option key={item.id} value={item.id} />
                  ))}
                </datalist>
              </label>
              <label className="block text-[11px] text-muted-foreground">
                API Key（当前厂商槽位）
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  className="mt-1 h-8"
                  placeholder={
                    activeSlot?.apiKeySet
                      ? `已存：${activeSlot.apiKeyMasked}`
                      : config.connection.apiKeySet
                        ? `${config.connection.apiKeySource}：${config.connection.apiKeyMasked}`
                        : "粘贴后点保存"
                  }
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  saveAction.run(async () => {
                    await putConfig({
                      provider: "openai-compatible",
                      model,
                      baseUrl,
                      vendorPresetId,
                      temperature: Number(temperature),
                      maxTokens: Number(maxTokens),
                      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
                    });
                    toast.success(`已保存到「${activePreset?.label || vendorPresetId}」槽位`);
                    return "已保存";
                  }, "保存失败")
                }
              >
                保存到当前厂商槽位
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  saveAction.run(async () => {
                    await putConfig({ clearApiKey: true, vendorPresetId });
                    toast.success("已清除当前厂商 Key");
                    return "已清除当前厂商 Key";
                  }, "清除失败")
                }
              >
                清除此槽位 Key
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {activeSlot?.apiKeySet ? `当前槽位已存 Key` : "当前槽位尚无 Key"}
              </span>
            </div>
            <FeedbackBanner phase={saveAction.phase} message={saveAction.message} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">测试与演示恢复</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                testAction.run(async () => {
                  const response = await fetch("/api/llm-config/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: config.provider as LlmProviderId }),
                  });
                  const json = (await response.json()) as {
                    ok?: boolean;
                    message?: string;
                    result?: TestResult;
                    code?: string;
                    hint?: string;
                  };
                  const result =
                    json.result ??
                    ({
                      ok: json.ok,
                      message: json.message,
                      code: json.code,
                      hint: json.hint,
                    } satisfies TestResult);
                  setTestResult(result);
                  if (!response.ok || json.ok === false || result.ok === false) {
                    throw new Error(result.message || json.message || "连接测试失败");
                  }
                  return result.message || "连接成功";
                }, "连接测试失败")
              }
            >
              测试当前模式
            </Button>
            {config.allowDemoReset ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  resetAction.run(async () => {
                    if (!window.confirm("恢复 Demo 种子数据（保留业务商品）。继续？")) return "已取消";
                    const response = await fetch("/api/demo/reset", { method: "POST" });
                    const json = (await response.json()) as { ok?: boolean; message?: string };
                    if (!response.ok || json.ok === false) throw new Error(json.message || "恢复失败");
                    const cfgRes = await fetch("/api/llm-config");
                    const cfgJson = (await cfgRes.json()) as { config?: PublicLlmConfig };
                    if (cfgJson.config) syncFromConfig(cfgJson.config);
                    toast.success(json.message || "Demo 数据已恢复");
                    return json.message || "Demo 数据已恢复";
                  }, "恢复失败")
                }
              >
                恢复演示数据
              </Button>
            ) : null}
          </div>
          <FeedbackBanner phase={testAction.phase} message={testAction.message} />
          <FeedbackBanner phase={resetAction.phase} message={resetAction.message} />
          {testResult && testResult.ok === false ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-950">
              <p className="font-medium">{testResult.message}</p>
              {testResult.code ? <p className="text-xs">code：{testResult.code}</p> : null}
              {testResult.hint ? <p className="break-words text-xs">{testResult.hint}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

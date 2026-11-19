import "server-only";

import { randomUUID } from "node:crypto";

import { calculatePrice } from "@/lib/tools/calculate-price";
import { queryActivities } from "@/lib/tools/query-activities";
import { queryCoupons } from "@/lib/tools/query-coupons";
import { queryLogistics } from "@/lib/tools/query-logistics";
import { queryOrders } from "@/lib/tools/query-orders";
import { queryProducts } from "@/lib/tools/query-products";
import type { ToolResult } from "@/lib/tools/types";
import { ensureJsonFile, readJson, updateJson } from "@/lib/store";
import { diffText } from "@/lib/skills/diff";
import type { Tool, ToolsConfig, ToolVersionSnapshot } from "@/lib/types";

const runners: Record<string, (input: Record<string, unknown>) => Promise<ToolResult<unknown>>> = {
  query_products: (input) =>
    queryProducts({
      keyword: typeof input.keyword === "string" ? input.keyword : undefined,
      category: typeof input.category === "string" ? input.category : undefined,
      allergen: typeof input.allergen === "string" ? input.allergen : undefined,
      status:
        input.status === "on_sale" || input.status === "sold_out" || input.status === "off_shelf"
          ? input.status
          : undefined,
    }),
  query_activities: (input) =>
    queryActivities({
      status:
        input.status === "draft" || input.status === "live" || input.status === "ended"
          ? input.status
          : undefined,
      productId: typeof input.productId === "string" ? input.productId : undefined,
    }),
  query_coupons: (input) =>
    queryCoupons({
      code: typeof input.code === "string" ? input.code : undefined,
      productId: typeof input.productId === "string" ? input.productId : undefined,
      newCustomerOnly: typeof input.newCustomerOnly === "boolean" ? input.newCustomerOnly : undefined,
    }),
  calculate_price: (input) =>
    calculatePrice({
      userId: typeof input.userId === "string" ? input.userId : undefined,
      couponCode: typeof input.couponCode === "string" ? input.couponCode : undefined,
      activityId: typeof input.activityId === "string" ? input.activityId : undefined,
      items: Array.isArray(input.items)
        ? input.items.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            if (typeof record.sku !== "string" || typeof record.quantity !== "number") return [];
            return [{ sku: record.sku, quantity: record.quantity }];
          })
        : undefined,
    }),
  query_orders: (input) =>
    queryOrders({
      orderId: typeof input.orderId === "string" ? input.orderId : undefined,
      userId: typeof input.userId === "string" ? input.userId : undefined,
    }),
  query_logistics: (input) =>
    queryLogistics({
      orderId: typeof input.orderId === "string" ? input.orderId : undefined,
      trackingNo: typeof input.trackingNo === "string" ? input.trackingNo : undefined,
    }),
};

export async function listTools(): Promise<Tool[]> {
  return readJson<Tool[]>("tools.json");
}

export async function listEnabledTools(): Promise<Tool[]> {
  const [tools, config] = await Promise.all([
    listTools(),
    readJson<ToolsConfig>("tools-config.json"),
  ]);
  return tools.filter((tool) => {
    const override = config.overrides[tool.id]?.enabled;
    if (override === false) return false;
    return tool.enabled && tool.status !== "disabled";
  });
}

export async function getTool(id: string): Promise<Tool> {
  const tools = await listTools();
  const tool = tools.find((item) => item.id === id);
  if (!tool) {
    throw new Error(`未找到 Tool：${id}`);
  }
  return tool;
}

export async function listToolVersions(toolId?: string): Promise<ToolVersionSnapshot[]> {
  const versions = await ensureJsonFile<ToolVersionSnapshot[]>("tool-versions.json", []);
  return versions
    .filter((item) => (toolId ? item.toolId === toolId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteToolVersion(toolId: string, versionId: string): Promise<{ id: string }> {
  const versions = await listToolVersions(toolId);
  if (!versions.some((item) => item.id === versionId)) {
    throw new Error(`未找到 Tool 版本：${versionId}`);
  }
  await updateJson<ToolVersionSnapshot[]>("tool-versions.json", (items) =>
    (items ?? []).filter((item) => item.id !== versionId),
  );
  return { id: versionId };
}

async function snapshotTool(tool: Tool, changeNote: string): Promise<ToolVersionSnapshot> {
  await ensureJsonFile<ToolVersionSnapshot[]>("tool-versions.json", []);
  const snapshot: ToolVersionSnapshot = {
    id: `tv_${randomUUID()}`,
    toolId: tool.id,
    createdAt: new Date().toISOString(),
    changeNote,
    name: tool.name,
    description: tool.description,
    enabled: tool.enabled,
    timeoutMs: tool.timeoutMs,
  };
  await updateJson<ToolVersionSnapshot[]>("tool-versions.json", (items) => [snapshot, ...(items ?? [])]);
  return snapshot;
}

function toolConfigText(input: {
  name: string;
  description: string;
  enabled: boolean;
  timeoutMs?: number;
}) {
  return [
    `name: ${input.name}`,
    `enabled: ${input.enabled ? "true" : "false"}`,
    `timeoutMs: ${input.timeoutMs ?? ""}`,
    `description:`,
    input.description,
  ].join("\n");
}

export async function saveToolVersion(toolId: string, changeNote: string) {
  const tool = await getTool(toolId);
  return snapshotTool(tool, changeNote || "添加快照");
}

export async function diffToolVersion(toolId: string, versionId: string) {
  const [tool, versions] = await Promise.all([getTool(toolId), listToolVersions(toolId)]);
  const from = versions.find((item) => item.id === versionId);
  if (!from) throw new Error(`未找到 Tool 版本：${versionId}`);
  const before = toolConfigText(from);
  const after = toolConfigText(tool);
  return {
    toolId,
    from: { id: from.id, createdAt: from.createdAt, changeNote: from.changeNote },
    to: { id: "current", createdAt: null as string | null },
    lines: diffText(before, after),
  };
}

export async function setToolEnabled(id: string, enabled: boolean): Promise<Tool> {
  return updateTool(id, { enabled, snapshotBefore: false, changeNote: enabled ? "运营启停：启用" : "运营启停：停用" });
}

export async function updateTool(
  id: string,
  patch: { enabled?: boolean; description?: string; name?: string; timeoutMs?: number; changeNote?: string; snapshotBefore?: boolean },
): Promise<Tool> {
  const current = await getTool(id);
  const nextName = patch.name ?? current.name;
  const nextDescription = patch.description ?? current.description;
  const nextTimeout = patch.timeoutMs ?? current.timeoutMs;
  const nextEnabled = patch.enabled ?? current.enabled;
  const contentChanged =
    nextName !== current.name ||
    nextDescription !== current.description ||
    nextTimeout !== current.timeoutMs ||
    nextEnabled !== current.enabled;

  if (patch.snapshotBefore !== false && contentChanged) {
    await snapshotTool(current, patch.changeNote || "修改前自动快照");
  }
  const tools = await updateJson<Tool[]>("tools.json", (items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        name: nextName,
        description: nextDescription,
        timeoutMs: nextTimeout,
        enabled: nextEnabled,
        status: nextEnabled ? (item.status === "disabled" ? "ready" : item.status) : "disabled",
      };
    }),
  );
  if (patch.enabled !== undefined && nextEnabled !== current.enabled) {
    await updateJson<ToolsConfig>("tools-config.json", (config) => ({
      ...config,
      updatedAt: new Date().toISOString(),
      overrides: {
        ...config.overrides,
        [id]: { ...config.overrides[id], enabled: patch.enabled },
      },
    }));
  }
  const next = tools.find((item) => item.id === id);
  if (!next) throw new Error(`未找到 Tool：${id}`);
  return next;
}

export async function rollbackTool(toolId: string, versionId: string): Promise<Tool> {
  const versions = await listToolVersions(toolId);
  const version = versions.find((item) => item.id === versionId);
  if (!version) {
    throw new Error(`未找到 Tool 版本：${versionId}`);
  }
  return updateTool(toolId, {
    name: version.name,
    description: version.description,
    enabled: version.enabled,
    changeNote: `回滚到 ${version.id} 前自动快照`,
  });
}

export async function runTool(
  id: string,
  input: Record<string, unknown>,
  options?: { ignoreEnabled?: boolean },
): Promise<ToolResult<unknown>> {
  if (!options?.ignoreEnabled) {
    const enabled = await listEnabledTools();
    if (!enabled.some((tool) => tool.id === id)) {
      return {
        ok: false,
        toolId: id,
        error: { code: "TOOL_DISABLED", message: `Tool ${id} 未启用，无法测试` },
      };
    }
  } else {
    await getTool(id);
  }
  const runner = runners[id];
  if (!runner) {
    return {
      ok: false,
      toolId: id,
      error: { code: "TOOL_NOT_IMPLEMENTED", message: `尚未实现 Tool：${id}` },
    };
  }
  return runner(input);
}

export function sampleInputFor(toolId: string): Record<string, unknown> {
  switch (toolId) {
    case "query_products":
      return { keyword: "海带" };
    case "query_activities":
      return { status: "live" };
    case "query_coupons":
      return { code: "XINREN8" };
    case "calculate_price":
      return {
        userId: "usr_chen",
        couponCode: "XINREN8",
        activityId: "act_mid_autumn",
        items: [
          { sku: "KL-SPICY-80G", quantity: 2 },
          { sku: "GM-PEACH-50G", quantity: 2 },
        ],
      };
    case "query_orders":
      return { orderId: "ord_20260906_10021" };
    case "query_logistics":
      return { orderId: "ord_20260906_10021" };
    default:
      return {};
  }
}

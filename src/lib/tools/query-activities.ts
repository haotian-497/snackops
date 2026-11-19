import "server-only";

import { readJson } from "@/lib/store";
import type { Activity } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";

export async function queryActivities(input: {
  status?: Activity["status"];
  productId?: string;
}): Promise<ToolResult<{ items: Activity[]; count: number }>> {
  try {
    const activities = await readJson<Activity[]>("activities.json");
    const items = activities.filter((activity) => {
      if (input.status && activity.status !== input.status) return false;
      if (input.productId && !activity.productIds.includes(input.productId)) return false;
      return true;
    });
    return { ok: true, toolId: "query_activities", data: { items, count: items.length } };
  } catch (error) {
    return {
      ok: false,
      toolId: "query_activities",
      error: { code: "ACTIVITY_QUERY_FAILED", message: error instanceof Error ? error.message : "活动查询失败" },
    };
  }
}

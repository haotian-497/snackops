import "server-only";

import { readJson } from "@/lib/store";
import type { LogisticsTrack } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";

export async function queryLogistics(input: {
  orderId?: string;
  trackingNo?: string;
}): Promise<ToolResult<{ items: LogisticsTrack[]; count: number }>> {
  try {
    const tracks = await readJson<LogisticsTrack[]>("logistics.json");
    const items = tracks.filter((track) => {
      if (input.orderId && track.orderId !== input.orderId) return false;
      if (input.trackingNo && track.trackingNo !== input.trackingNo) return false;
      return true;
    });
    return { ok: true, toolId: "query_logistics", data: { items, count: items.length } };
  } catch (error) {
    return {
      ok: false,
      toolId: "query_logistics",
      error: { code: "LOGISTICS_QUERY_FAILED", message: error instanceof Error ? error.message : "物流查询失败" },
    };
  }
}

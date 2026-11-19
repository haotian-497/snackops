import type { OpsTimeRange, OpsTrafficScope } from "@/lib/ops/compute-metrics";

export type OpsMonitorFilters = {
  range: OpsTimeRange;
  traffic: OpsTrafficScope;
  dedupe: boolean;
};

export const DEFAULT_OPS_FILTERS: OpsMonitorFilters = {
  range: "7d",
  traffic: "business",
  dedupe: false,
};

function isRange(value: string | null | undefined): value is OpsTimeRange {
  return value === "today" || value === "7d" || value === "all";
}

function isTraffic(value: string | null | undefined): value is OpsTrafficScope {
  return value === "business" || value === "eval" || value === "all";
}

/** 从 URL / searchParams 解析监控筛选 */
export function parseOpsFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined | null>,
): OpsMonitorFilters {
  const get = (key: string) => {
    if (input instanceof URLSearchParams) return input.get(key);
    const raw = input[key];
    return Array.isArray(raw) ? raw[0] : raw ?? null;
  };

  const rangeRaw = get("range");
  const trafficRaw = get("traffic");
  const dedupeRaw = get("dedupe");

  return {
    range: isRange(rangeRaw) ? rangeRaw : DEFAULT_OPS_FILTERS.range,
    traffic: isTraffic(trafficRaw) ? trafficRaw : DEFAULT_OPS_FILTERS.traffic,
    dedupe: dedupeRaw === "1" || dedupeRaw === "true",
  };
}

/** 写入 URL 查询串（省略与默认相同的 dedupe=0） */
export function serializeOpsFilters(filters: OpsMonitorFilters): string {
  const params = new URLSearchParams();
  params.set("traffic", filters.traffic);
  params.set("range", filters.range);
  if (filters.dedupe) params.set("dedupe", "1");
  return params.toString();
}

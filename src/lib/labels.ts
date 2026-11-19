import type { TicketStatus } from "@/lib/types";

export const ticketStatusLabel: Record<TicketStatus, string> = {
  queued: "排队中",
  bot_handling: "机器人处理中",
  human_takeover: "已转人工接管",
  resolved: "已解决",
};

export const productStatusLabel = {
  on_sale: "在售",
  sold_out: "售罄",
  off_shelf: "已下架",
} as const;

export const runStatusLabel = {
  running: "运行中",
  succeeded: "已成功",
  failed: "已失败",
  handed_off: "已转交",
} as const;

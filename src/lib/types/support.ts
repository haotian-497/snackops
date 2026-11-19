export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  skillId: string;
};

export type TicketStatus = "queued" | "bot_handling" | "human_takeover" | "resolved";
export type TicketPriority = "low" | "medium" | "high";

export type Ticket = {
  id: string;
  userId: string;
  orderId?: string;
  intent: string;
  status: TicketStatus;
  priority: TicketPriority;
  summary: string;
  handoffReason?: string;
  updatedAt: string;
};

export type HandoffRule = {
  id: string;
  when: string;
  action: "stay_bot" | "human_takeover";
  note: string;
};

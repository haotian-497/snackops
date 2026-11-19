export const CAPABILITY_OPTIONS = ["price", "order", "logistics", "risk", "recommend", "allergy"] as const;

export type PlannerCapability = (typeof CAPABILITY_OPTIONS)[number];

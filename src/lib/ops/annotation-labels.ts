/** Shared annotation label taxonomy (client + server). */

export const ANNOTATION_LABELS = [
  { value: "bad_case", label: "综合 Bad Case", issueHint: "风险" },
  { value: "safety_hard", label: "安全硬失败", issueHint: "风险" },
  { value: "dangerous_claim", label: "危险承诺", issueHint: "风险" },
  { value: "wrong_price", label: "价格错误", issueHint: "价格" },
  { value: "low_correctness", label: "事实/正确性不足", issueHint: "推荐" },
  { value: "quality_miss", label: "关键词/完整性不足", issueHint: "推荐" },
  { value: "tone_issue", label: "语气不当", issueHint: "" },
  { value: "empty_reply", label: "空回复", issueHint: "" },
  { value: "review", label: "待人工裁定", issueHint: "" },
  { value: "other", label: "其他", issueHint: "" },
] as const;

export type AnnotationLabelValue = (typeof ANNOTATION_LABELS)[number]["value"];

const LABEL_SET = new Set<string>(ANNOTATION_LABELS.map((item) => item.value));

export function isKnownAnnotationLabel(label: string) {
  return LABEL_SET.has(label);
}

/** Labels that should promote improvements as source=bad_case. */
export function isBadCaseLabel(label: string) {
  return label !== "other" && LABEL_SET.has(label);
}

export function annotationLabelTitle(label: string) {
  return ANNOTATION_LABELS.find((item) => item.value === label)?.label ?? label;
}

export function annotationLabelIssueHint(label: string) {
  return ANNOTATION_LABELS.find((item) => item.value === label)?.issueHint ?? "";
}

/** Prefer severity-based default when opening a queue item. */
export function defaultLabelForSeverity(severity?: string) {
  if (!severity) return "bad_case";
  if (severity === "quality_no_override") return "quality_miss";
  if (severity === "low_rating") return "bad_case";
  if (LABEL_SET.has(severity)) return severity;
  return "bad_case";
}

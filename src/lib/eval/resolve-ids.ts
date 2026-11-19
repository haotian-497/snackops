export function resolveBatchCaseIds(input: {
  requested?: string[] | null;
  enabledIds: string[];
  knownIds: string[];
}): string[] {
  if (input.requested === undefined || input.requested === null) {
    return [...input.enabledIds];
  }
  if (input.requested.length === 0) {
    throw Object.assign(new Error("caseIds 不能是空数组"), { code: "EMPTY_CASE_IDS", status: 400 });
  }
  const known = new Set(input.knownIds);
  const invalidIds = [...new Set(input.requested)].filter((id) => !known.has(id));
  if (invalidIds.length > 0) {
    throw Object.assign(new Error(`存在无效 caseId：${invalidIds.join("、")}`), {
      code: "INVALID_CASE_IDS",
      status: 400,
      invalidIds,
    });
  }
  return [...new Set(input.requested)];
}

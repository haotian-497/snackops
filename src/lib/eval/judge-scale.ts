export const JUDGE_SCORE_MIN = 1;
export const JUDGE_SCORE_MAX = 5;
export const JUDGE_OVERRIDE_MIN = 4;
export const JUDGE_PASS_OVERALL_MIN = 4;
export const JUDGE_REVIEW_OVERALL_MIN = 3;
export const JUDGE_WEAK_OVERALL = 3;
export const JUDGE_LOW_CORRECTNESS_MAX = 3;

export function toJudgeFive(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  const scaled = number > JUDGE_SCORE_MAX ? number / 2 : number;
  return Math.max(0, Math.min(JUDGE_SCORE_MAX, Math.round(scaled * 10) / 10));
}

export function formatJudgeScore(value: unknown) {
  return `${toJudgeFive(value)}/${JUDGE_SCORE_MAX}`;
}

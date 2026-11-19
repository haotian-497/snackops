const base = process.env.ACCEPT_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5004";

async function req(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

const results = [];
function record(name, ok, extra = {}) {
  results.push({ name, ok, ...extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`, extra);
}

const created = await req("/api/eval/cases", {
  method: "POST",
  body: JSON.stringify({ name: "API验收用例", question: "随便看看海带", category: "custom" }),
});
record("EvalCase 新增", created.status === 200 && Boolean(created.json.case?.id), { status: created.status });
const caseId = created.json.case?.id;

const listed = await req("/api/eval/cases");
record("EvalCase 列表含新增", Boolean((listed.json.cases ?? []).some((item) => item.id === caseId)));

const patched = await req(`/api/eval/cases/${caseId}`, {
  method: "PATCH",
  body: JSON.stringify({ expectedKeywords: [{ op: "or", terms: ["海带"] }] }),
});
record("EvalCase 更新", patched.status === 200 && patched.json.case?.expectedKeywords?.[0]?.terms?.[0] === "海带");

const empty = await req("/api/eval/batch/run", { method: "POST", body: JSON.stringify({ caseIds: [] }) });
record("空 caseIds 返回 400", empty.status === 400, { status: empty.status, message: empty.json.message });

const invalid = await req("/api/eval/batch/run", { method: "POST", body: JSON.stringify({ caseIds: ["nope_id"] }) });
record("无效 caseId 返回 400 并列 ID", invalid.status === 400 && Array.isArray(invalid.json.invalidIds), {
  invalidIds: invalid.json.invalidIds,
});

const batch = await req("/api/eval/batch/run", {
  method: "POST",
  body: JSON.stringify({
    name: "API三案",
    versionLabel: "api-v1",
    caseIds: ["ec_spicy_office", "ec_scam_prize", "ec_vague_need"],
  }),
});
record("3 个 caseIds total=3", batch.status === 200 && batch.json.batch?.total === 3, {
  total: batch.json.batch?.total,
  ids: batch.json.batch?.caseIds,
});

const batchId = batch.json.batchId;
let latest = batch.json.batch;
for (let i = 0; i < 40; i += 1) {
  const poll = await req(`/api/eval/batch/${batchId}`);
  latest = poll.json.batch;
  if (["done", "error", "cancelled"].includes(latest?.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 700));
}
record("批次轮询到终态", ["done", "error", "cancelled"].includes(latest?.status), { status: latest?.status });
record(
  "批次只含 3 个 caseId",
  latest?.caseResults?.length === 3 && latest.caseResults.every((item) => ["ec_spicy_office", "ec_scam_prize", "ec_vague_need"].includes(item.caseId)),
  { ids: latest?.caseResults?.map((item) => item.caseId) },
);
record("结果含回复或 ERROR 证据", Boolean(latest?.caseResults?.every((item) => item.status === "ERROR" || item.finalReply || item.evidence?.length)));

const missing = await req("/api/eval/batch/not-found-batch");
record("批次 404 结构化", missing.status === 404 && missing.json.code === "EVAL_BATCH_NOT_FOUND");

const resetGet = await req("/api/demo/reset");
record(
  "重置接口可探测或禁用",
  (resetGet.status === 200 && resetGet.json.allowDemoReset === true) ||
    (resetGet.status === 404 && resetGet.json.code === "RESET_DISABLED"),
);
const resetPost = await req("/api/demo/reset", { method: "POST" });
record(
  "重置接口 POST 可用或禁用",
  (resetPost.status === 200 && resetPost.json.ok === true) || resetPost.status === 404,
);

const llm = await req("/api/llm-config");
record("公开配置不含密钥", llm.status === 200 && !JSON.stringify(llm.json).includes("sk-") && llm.json.config?.env?.OPENAI_API_KEY !== undefined);

const switched = await req("/api/llm-config/switch", {
  method: "POST",
  body: JSON.stringify({ provider: "openai-compatible", model: "qwen-plus" }),
});
const missingKey = await req("/api/llm-config/test", {
  method: "POST",
  body: JSON.stringify({ provider: "openai-compatible" }),
});
record(
  "真实 Provider 缺配置结构化失败",
  missingKey.status === 400 && missingKey.json.ok === false && Boolean(missingKey.json.result?.code || missingKey.json.message),
  { status: missingKey.status, code: missingKey.json.result?.code, message: missingKey.json.message },
);
const back = await req("/api/llm-config/switch", {
  method: "POST",
  body: JSON.stringify({ provider: "demo", model: "demo-v1" }),
});
record("切回演示稳定模式", back.status === 200 && back.json.config?.mode === "demo", { mode: back.json.config?.mode });
record("切换接口可用", switched.status === 200);

const versions = await req("/api/skills/risk-check/versions");
record("Skill 版本快照可读取", versions.status === 200 && Array.isArray(versions.json.versions || versions.json.items || versions.json.snapshots || []));

if (caseId) {
  await req(`/api/eval/cases/${caseId}`, { method: "DELETE" });
}

const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ base, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);

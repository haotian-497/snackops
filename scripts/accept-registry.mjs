const base = "http://127.0.0.1:5000";

async function req(path, init) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await response.json();
  return { status: response.status, json };
}

const results = [];

const enabledSkills = await req("/api/skills?enabled=1");
results.push({
  name: "read enabled skills",
  status: enabledSkills.status,
  ok: enabledSkills.json.ok && Array.isArray(enabledSkills.json.skills) && enabledSkills.json.skills.length >= 14,
  count: enabledSkills.json.skills?.length,
});

const enabledTools = await req("/api/tools?enabled=1");
results.push({
  name: "read enabled tools",
  status: enabledTools.status,
  ok: enabledTools.json.ok && enabledTools.json.tools?.length === 6,
  count: enabledTools.json.tools?.length,
});

const disableId = "conversation-summary";
const disabled = await req(`/api/skills/${disableId}`, {
  method: "PATCH",
  body: JSON.stringify({ enabled: false, snapshotBefore: false }),
});
const afterDisable = await req("/api/skills?enabled=1");
const gone = !(afterDisable.json.skills ?? []).some((item) => item.id === disableId);
results.push({
  name: "disabled skill removed from enabled list",
  status: afterDisable.status,
  ok: disabled.json.ok && gone,
});

await req(`/api/skills/${disableId}`, {
  method: "PATCH",
  body: JSON.stringify({ enabled: true, snapshotBefore: false }),
});

const productTest = await req("/api/tools/query_products/test", {
  method: "POST",
  body: JSON.stringify({ input: { keyword: "海带" } }),
});
const productName = JSON.stringify(productTest.json.result ?? {});
results.push({
  name: "tool test reads real products.json",
  status: productTest.status,
  ok: productTest.json.ok && productName.includes("香辣海带结"),
});

const skillId = "need-extraction";
const current = await req(`/api/skills/${skillId}`);
const original = current.json.skill.systemPrompt;

const saved = await req(`/api/skills/${skillId}/versions`, {
  method: "POST",
  body: JSON.stringify({ changeNote: "验收：保存当前版本" }),
});
const listed = await req(`/api/skills/${skillId}/versions`);
results.push({
  name: "saved version visible after persist",
  status: listed.status,
  ok: saved.json.ok && listed.json.versions?.length >= 1,
  versions: listed.json.versions?.length,
});

const patched = await req(`/api/skills/${skillId}`, {
  method: "PATCH",
  body: JSON.stringify({
    systemPrompt: `${original}\n\n> 验收追加一行`,
    changeNote: "修改前自动快照",
  }),
});
const versionsAfterEdit = await req(`/api/skills/${skillId}/versions`);
const fromId = versionsAfterEdit.json.versions?.[0]?.id;
const diff = await req(`/api/skills/${skillId}/diff?from=${fromId}`);
results.push({
  name: "auto snapshot before edit and diff available",
  status: diff.status,
  ok:
    patched.json.ok &&
    versionsAfterEdit.json.versions?.length >= 2 &&
    Array.isArray(diff.json.diff?.lines),
});

await req(`/api/skills/${skillId}`, {
  method: "PATCH",
  body: JSON.stringify({ systemPrompt: original, changeNote: "验收后恢复正文" }),
});

const traversal = await req(`/api/skills/${skillId}`, {
  method: "PATCH",
  body: JSON.stringify({ filePath: "../../secret.md" }),
});
results.push({
  name: "reject path traversal",
  status: traversal.status,
  ok: traversal.status === 400 && traversal.json.ok === false,
  message: traversal.json.message,
});

console.log(JSON.stringify({ results }, null, 2));
if (results.some((item) => !item.ok)) process.exit(1);

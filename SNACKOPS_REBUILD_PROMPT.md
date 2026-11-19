# 从零构建：SnackOps（零食电商客服 Agent 运营台）

你是资深全栈工程师。请从零实现一个可运行的完整产品 **SnackOps**（package name: `snackops`），中文 UI，产品定位为「零食电商客服 Agent 运营台」。不要做成通用 ChatGPT 壳子；要做成可运营、可测评、可回滚的 Agent 运营系统。本提示词是一份完整规格，可直接整段复制使用。

## 0. 硬性约束（必须遵守）

1. **Next.js 版本特殊**：使用 Next.js **16.3.x** + React **19.2.x** + TypeScript + **pnpm**。这不是你训练数据里的经典 Next.js。写任何路由/约定前，必须先阅读本仓库 `node_modules/next/dist/docs/`（或等价本地文档），遵守其 breaking changes。在 `AGENTS.md` / `CLAUDE.md` 写入同样的 nextjs-agent-rules 提醒。
2. **无数据库**：全部业务状态用项目内 JSON 文件持久化（`data/`），通过带文件锁 + 原子写的 `store` 层读写。浏览器绝不直接读 `data/`。
3. **LLM 不允许静默降级**：真实 Provider 缺密钥/失败时，必须返回结构化错误；**禁止**自动悄悄切到 Demo。用户只能显式切换 Provider。
4. **LLM Provider 仅两种**：
   - `demo`：本地确定性演示，不调外部模型，文案称「Demo 演示稳定模式」（不要用「课堂」字样）
   - `openai-compatible`：OpenAI Chat Completions 兼容协议；默认厂商 DeepSeek（`https://api.deepseek.com`），并支持其它兼容厂商预设
5. **不要接入 Coze / 扣子 Provider**。
6. UI 语言：简体中文；品牌名 **SnackOps**；视觉：暖色零食运营台（奶油底 `#f7f3ee` + 陶土橙 `#c45c26`），字体 Noto Sans SC；避免紫黑赛博、默认 Inter/系统字体堆。
7. 开发端口默认 `DEPLOY_RUN_PORT=5000`（可用环境变量覆盖）。
8. **默认 Provider 为 `demo`**，开箱无需任何 API Key 即可演示完整链路。
9. **Run 列表页禁止把完整 `plan`/`steps` 塞进 RSC/客户端 payload**（历史踩坑：`runs.json` 数 MB 会导致工作台/相关页刷新卡住）。列表只用摘要；详情页再读完整 Run。

## 1. 技术栈与工程脚手架

- Next.js App Router，`typedRoutes: true`
- Tailwind CSS v4、Radix Slot/Separator、CVA、clsx/tailwind-merge、lucide-react、sonner、recharts、zod v4、server-only
- 根目录提供简明 `README.md`：3 分钟 Demo 上手、模型页配 Key、一键恢复演示数据、环境变量表、演示方注意事项
- scripts：
  - `dev` / `start`：自定义 `scripts/dev.mjs`、`scripts/start.mjs`（读端口）
  - `demo:reset`：从 `fixtures/demo/` 恢复演示数据
  - `test`：node `--experimental-strip-types --test` 覆盖 eval/demo/ops 单测
  - `test:api`：`scripts/accept-api.mjs` 冒烟
  - `validate`：tsc + eslint + test
- 目录约定：
  - `src/app/` 页面与 API
  - `src/components/` UI 与各 workbench
  - `src/lib/{agent,llm,skills,tools,planner,eval,ops,demo,schemas,types,store,paths}/`
  - `data/` 运行时 JSON（密钥文件见下文，必须 gitignore）
  - `skills/*.md` Skill/Planner 提示词文件
  - `tools/*.json` Tool 示例 payload
  - `fixtures/demo/` Demo 重置种子（含 skills）

路径解析：`DATA_DIR` 或 `<SNACKOPS_ROOT|projectRoot>/data`。

## 2. 产品信息架构（页面与导航）

### 顶栏主导航
工作台 `/` · Demo `/demo` · 业务目录 `/catalog` · Skill `/skills` · Tool `/tools` · Planner `/planner` · 模型 `/models` · 运营 `/ops`  
品牌：SnackOps + 副标题「客服 Agent 运营台」。运行存档不进主导航，从工作台「最近运行」进。

### 其它页面
- `/runs` 运行存档，`/runs/[runId]` 运行详情（处置中枢）
- `/help/risk-rules` 风险规则手册
- `/eval` 重定向到 `/ops/eval`

### 运营中心 `/ops`（共享 layout + 子导航）
- `/ops` 运行监控
- `/ops/ratings` 服务评价
- `/ops/annotate` 数据标注
- `/ops/improvements` 改进建议
- `/ops/prompt-ab` Prompt A/B
- `/ops/rollback` 版本回滚
- `/ops/eval` 测评集
- `/ops/center` 测评中心（含 batch/case 详情路由）

## 3. 核心：客服 Agent 运行管线

### 入口
`POST /api/agent/run`，**SSE** 推送事件，服务端主流程 `runAgent()`。

事件类型：`plan | step | risk | reply | error | done`。

### 执行顺序（必须）
1. `assertProviderReady()`；加载启用的 Skill/Tool；可读内存覆盖（skillPromptOverrides / plannerPromptOverride / toolOverrides，供 A/B）
2. 从用户问题推断强制能力 `mandatoryCapabilities`：`price | order | logistics | risk | recommend | allergy`
3. **Planner**：读 `skills/planner.md`（或默认提示），LLM 产出 JSON 计划 `AgentPlan`：
   - `selectedSkills`、`selectedTools`、`reasoning`、`risk`、可选 `handoff`
   - Planner JSON 解析失败时允许 **plan 级 fallback 计划**（步骤标记 planner-fallback），这不是 Provider 降级
4. **Validator**：对照启用清单与强制能力打分；若不通过 → Run `failed`，**不得伪装成功**，落盘后结束
5. **Executor**：
   - 按计划顺序跑 Tool → 聚合 `toolFacts`
   - 跑 Skill（除 risk-check）→ 生成草稿（优先 response-generator）
   - 跑 **risk-check** Skill → 解析 `{verdict, triggeredRules, safeRewriteHint}`
   - 若 `block` → 再走 **rewrite**（LLM purpose=rewrite）；rewrite 失败则回退到固定安全中文句
6. 终态：Tool 失败 → `failed`；计划 `handoff` → `handed_off`；否则 `succeeded`
7. 持久化 `RunRecord` 到 `data/runs.json`（写入时最多保留最近 **200** 条，防止无限膨胀）

### 步骤类型
`planner | validator | skill | tool | risk-check | rewrite`

### Run 来源
`workbench | demo | retry | legacy | eval`

### 内置 Skill（磁盘 md + registry）
至少包含：`need-extraction`、`recommendation-decision`、`recommendation-reason`、`response-generator`、`risk-check`、`clarification-question`、`product-substitution`、`after-sales-classification`、`complaint-triage`、`conversation-summary`、`human-handoff-decision`、`gift-scenario-advisor`、`allergy-risk-reminder`、`对话问候-skill`，以及 `planner.md`。

### 内置 Tool（本地 runner，读业务 JSON）
`query_products`、`query_activities`、`query_coupons`、`query_orders`、`query_logistics`、`calculate_price`。

业务种子数据：`products/orders/coupons/users/activities/faq/logistics/return-policies/handoff-rules/...`。

## 4. LLM 子系统

### 统一入口
`completeLlm({ purpose, messages, model?, temperature?, maxTokens?, timeoutMs? })`  
purpose 至少：`planner | skill | risk-check | rewrite | explain | judge`

### Provider 行为
- **demo**：确定性输出，覆盖 planner/risk/rewrite/explain/judge/skill；`fixture:true`；默认模型 `demo-v1`
- **openai-compatible**：解析凭证后调 Chat Completions；缺配置抛 `LlmConfigError`；HTTP/鉴权/超时等抛 `LlmCallError`（见下）

### 厂商预设（Vendor Presets）
在 `src/lib/llm/presets.ts` 提供至少这些预设（均可走同一 openai-compatible 协议）：
- DeepSeek（默认）：`https://api.deepseek.com`，模型含 `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-chat`
- OpenAI：`https://api.openai.com/v1`，如 `gpt-4o-mini` / `gpt-4o`
- 通义千问：DashScope 兼容模式 URL，如 `qwen-plus` / `qwen-turbo` / `qwen-max`
- Kimi（月之暗面，地址 `https://api.moonshot.cn/v1`）：`kimi-k3`、`kimi-k2.6`、`kimi-k2.7-code`
- 智谱 GLM：`https://open.bigmodel.cn/api/paas/v4`
- 自定义：用户自填 Base URL 与模型名

### 密钥与连接（本地优先，可给多人演示）
- 非密钥配置：`data/llm-config.json`（provider / model / temperature / maxTokens / updatedAt 等）
- 密钥与连接：`data/llm-secrets.json`（**必须 gitignore**），结构支持：
  - `vendorPresetId`
  - **按厂商分槽 `slots`**：每个预设独立保存 `apiKey` / `baseUrl` / `model`，切换 DeepSeek ↔ 通义时 Key 互不覆盖
  - 兼容旧字段：根级 `apiKey`/`baseUrl` 可一次性迁移进当前 slot
- 解析优先级：当前 slot 本地 Key/BaseURL → 环境变量 `OPENAI_API_KEY` / `OPENAI_BASE_URL` → 预设默认 BaseURL
- 对外 API/UI **只返回脱敏**（如 `sk-••••abcd`）与 `apiKeySet` 布尔，永不回传明文 Key
- 版本：`data/llm-versions.json`
- API：`GET/PATCH /api/llm-config`，`POST /api/llm-config/switch`，`POST /api/llm-config/test`（测试前必须已切换到目标 provider）；保存密钥走服务端写 secrets，不经客户端日志打印明文
- 兼容：旧 ID `classroom-fixture` → `demo`，`classroom-fixture-v1` → `demo-v1`（仅内部 normalize，产品文案不出现「课堂」）

### 错误码（对用户友好）
`LlmCallError` / 路由错误至少区分：
- `LLM_AUTH_FAILED`：密钥无效/未授权
- `LLM_MODEL_INVALID`：模型名不存在或不允许
- `LLM_TIMEOUT`：超时
- `LLM_REQUEST_FAILED`：其它请求失败  
响应含 `code` / `message` / 可选 `hint`，UI 用中文提示「检查 Key / Base URL / 模型名」，禁止堆栈原文糊脸。

### `/models` 页 UX（演示包装重点）
左右紧凑布局，顶部两大模式：
1. **Demo 演示稳定模式**：一键切到 `demo`，说明无需 Key
2. **真实模型**：点选厂商预设后 **自动切换** 到 `openai-compatible`（不要让用户先选厂商再往下再切 Provider）
   - 展示该厂商 Base URL、模型下拉（自定义可手填）
   - API Key 输入框；已存的厂商按钮显示「已存」
   - 保存密钥 / 测试连接 / 切换生效
   - 开发环境或 `ALLOW_DEMO_RESET=1` 时提供「一键恢复演示数据」按钮（调 `POST /api/demo/reset`）

### .env.example
```
DATA_DIR=
SNACKOPS_ROOT=
DEPLOY_RUN_PORT=5000
LLM_PROVIDER=demo
LLM_MODEL=deepseek-v4-flash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.deepseek.com
ALLOW_DEMO_RESET=
```
注释写明：真实 Provider 缺密钥不会静默回落 Demo；密钥也可在模型页写入 `data/llm-secrets.json`（已 gitignore）。

## 5. Skill / Tool / Planner 管理与版本

共性模式（必须有）：
- 列表 + 编辑关键字段 + **版本快照**（改前自动快照；无实质变更不重复打快照）
- 共用 **VersionSnapshotPanel**：默认折叠；点快照即 diff；链到 `/ops/rollback`；「添加快照」；删除快照主要在运营回滚页

### Skill
- 元数据 `data/skills.json`，正文 `skills/*.md`
- 版本 `data/skill-versions.json`（id 如 `sv_*`，含完整 systemPrompt）
- API：CRUD、versions、diff、rollback、删除版本
- UI：`/skills`

### Tool
- 可编辑 description / timeoutMs；schema 只读；保存可打快照
- `data/tools-config.json`、`data/tool-versions.json`（`tv_*`）
- API：CRUD、versions、diff、test
- UI：`/tools`（Tool 注册中心工作台：列表、启用停用、单项测试、版本对比）

### Planner
- `data/planner-config.json`：enabledSkillIds、enabledToolIds、mandatoryCapabilities、filePath、version
- 版本 `data/planner-versions.json`（`pv_*`）
- API：读写 + preview
- UI：`/planner`

## 6. 运行与运营监控

### 工作台 `/`
- 提问跑 Agent，展示计划/时间线/风险/最终回复
- 「最近运行」**最多 8 条摘要** +「查看全部运行存档」→ `/runs`
- **不要**把全量 `runs.json`（含 steps）作为 `initialRuns` 传给客户端
- 服务端提供 `summarizeRunRecord()` / `listRunRecords({ summary?: boolean, limit?: number })`：摘要清空 `plan`/`steps`/`riskResult`/`finalReply` 等重字段，只保留列表所需 id/question/status/provider/source/createdAt/durationMs 等
- 首页可另算「运行中」数量（基于摘要列表扫描即可）
- 不要在首页再放一份完整运行全表（避免与存档重复）

### 运行存档 `/runs`、详情 `/runs/[id]`
- `/runs` 列表同样只传 **summary**（可筛选）；`/api/runs` 列表接口默认返回摘要 + total/limit/offset
- 详情页按 id `getRunRecord` 读完整 trace
- 处置：标注、改进、进测评、A/B 等入口

### 运行监控 `/ops`
- 时间窗口：今日 / 7天 / 全部
- KPI：总量、成功率、耗时、告警等
- 状态分布（成功/失败/转人工/运行中）可视化
- **风险与失败**区：
  - 「风险审核分布」（allow/block/none）
  - 「风险规则命中」Top
  - 失败步骤统计
- 失败与转人工专区、最慢 Run、最近运行、运营摘要链接
- 不要把代评/建 A/B/写测评表单塞进监控页（监控页保持收敛）

## 7. 测评闭环

### 测评集 `/ops/eval`
- Cases：`data/eval_cases.json`（问题、期望行为、关键词、禁词、期望 skill、风险期望、价格核验等）
- 批次：`data/eval_batches.json`；跑批时对每个 case 调 `runAgent` + 规则评分 + 可选 LLM-as-Judge
- Judge：`data/judge-config.json` + `judge-versions.json`；维度与裁决 PASS/FAIL/REVIEW/ERROR
- 对比两个批次：`/api/eval/compare`
- 测评中心 `/ops/center` 看批次与 case 明细
- 套件筛选保留「全部启用 / 标注转入」等运营向过滤；不要「课堂套件」文案

### 标注 `/ops/annotate`
- `data/annotations.json`：多维打分、金标回复、可晋升到改进/测评

### 服务评价 `/ops/ratings`
- `data/ratings.json`（user|ops）；低分可生成改进

### 改进建议 `/ops/improvements`
- `data/improvements.json`：根因诊断、生成/应用 prompt、拆分、晋升测评、建议 A/B

### Prompt A/B `/ops/prompt-ab`
- `data/prompt-ab-experiments.json`
- 克隆 skill/planner/tool 候选 → 双批次测评 → 对比 → promote/discard
- 临时克隆 id 可用 `__pab_` 前缀，回滚中心过滤这些临时项

### 版本回滚 `/ops/rollback`
- 聚合 skill/planner/tool/judge/llm 版本与已晋升实验
- 回滚、紧急启停、撤销晋升；删除快照确认

## 8. 数据文件清单（`data/`）

平台：`skills.json` `skill-versions.json` `tools.json` `tools-config.json` `tool-versions.json` `planner-config.json` `planner-versions.json` `runs.json` `llm-config.json` `llm-versions.json` `llm-secrets.json`（gitignore，按厂商 slots 存 Key/BaseURL）

运营测评：`ratings.json` `annotations.json` `improvements.json` `prompt-ab-experiments.json` `eval_cases.json` `eval_batches.json` `judge-config.json` `judge-versions.json` `ab-tests.json`

业务：`products.json` `activities.json` `coupons.json` `orders.json` `users.json` `return-policies.json` `logistics.json` `faq.json` `handoff-rules.json` `tickets.json` 等

### Demo 重置
- CLI：`pnpm demo:reset`（`scripts/demo-reset.mjs`），用 `fixtures/demo/` 覆盖运营/测评/skill/llm-config 等；**保留** products/orders/coupons/users/activities/faq/logistics/return-policies；重置后 llm-config 为 `demo`
- **不清除** `llm-secrets.json`（避免演示方每次重置丢 Key）
- HTTP `POST /api/demo/reset`：
  - 开发环境（`NODE_ENV !== production`）默认允许
  - 生产默认拒绝；仅当 `ALLOW_DEMO_RESET=1` 时允许
  - （早期「始终 404」已废弃，改为上述可控开关，方便模型页一键恢复）

## 9. API 面（需齐全，路由按域名组织）

Agent/Runs：`/api/agent/run`（SSE）、`/api/run/retry`、`/api/runs`（摘要列表）、`/api/runs/[id]`、annotate、handoff、`/api/explain`

Skills/Tools/Planner/LLM：见上文（含 llm-config 读写、secrets 脱敏、switch、test）

Eval：cases、batch/run、batch/[id]、score、compare、judge-config

Ops：`/api/ops`、`/api/ops/rollback`、annotations(+export)、ratings、improvements（generate/apply/split/promote-eval/suggest-ab）、prompt-ab（run/promote/discard）、ab-tests

Misc：catalog、registry、health、store-test、`POST /api/demo/reset`（受 ALLOW_DEMO_RESET / 非生产约束）

请求校验用 zod schemas（agent/admin/eval/ops/registry）。错误返回结构化 JSON（含 code/message/hint）。

## 10. UI / UX 细节要求

- 页面结构：`PageHeader` + Card 工作台；空态、状态标签、反馈条
- Agent：执行时间线、计划面板、风险摘要、完整 trace
- 运营页：共用 OpsLayout + 中文子导航
- VersionSnapshotPanel 文案：「版本快照」「添加快照」「去版本回滚」
- 监控页风险区标题：「风险审核分布」「风险规则命中」（不要含糊的「风险等级 / Top」）
- 首页不要重复全量「最近运行」表；存档入口放在工作台最近运行旁
- 模型页：厂商按钮「已存」状态、Demo/真实模型二分、点厂商即切真实 Provider
- 性能：任何会把 `RunRecord[]` 传到 Client Component 的页面，默认 summary；工作台刷新必须在百 KB 量级，禁止数 MB HTML

## 11. 交付标准

1. `pnpm install && pnpm dev` 可启动；默认端口 5000；根 `README.md` 写清 Demo 上手
2. 默认 Demo Provider 下可完整跑通：提问 → 计划 → Tool/Skill → 风险 → 回复 → Run 落盘（无需 Key）
3. 可在 `/models` 选厂商预设、按槽位存 Key、自动切到 openai-compatible 并测试连接；缺 Key 时报友好错误且不静默回 Demo
4. Skill/Tool/Planner 可编辑并产生版本快照；回滚中心可见
5. 可创建测评集、跑批次、看监控指标
6. `pnpm demo:reset` 与（非生产或 ALLOW_DEMO_RESET）模型页一键恢复可用；不擦除 llm-secrets
7. 代码分域清晰，类型在 `src/lib/types`；**业务配置 JSON 不含密钥**；密钥仅在 gitignore 的 `llm-secrets.json` 或环境变量
8. 全程中文产品文案；不出现「课堂」；不出现 Coze Provider
9. 工作台与运行列表不会因完整 steps 序列化而卡死；`runs.json` 写入封顶 200 条

请按以上规格从零实现完整可运行项目，并准备最小可用的零食电商 fixture 数据与 Skill/Tool 提示词，使 Demo 模式无需外部密钥即可演示完整客服链路；再通过模型页厂商预设让不同演示方各自配置兼容大模型。

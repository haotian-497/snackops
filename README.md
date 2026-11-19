# SnackOps

零食电商的 **AI 客服质量治理台**。顾客提问后，系统按固定步骤规划、查商品/订单/物流、生成回复，并在发出前做风险审核。运营可以回看每一次回复是怎么来的，把低分回复收进改进，用测评和 Prompt A/B 验证，变差了再回滚。

这是个人作品集项目。我以产品经理角色独立完成需求、信息架构和运营闭环设计，并用 Cursor 做成可在本机运行的 Demo。订单、商品、对话都是样例数据，用来演示流程，不代表已在某家公司上线。

默认是 **Demo 演示模式，不需要 API Key**，装好依赖就能把整条链路跑一遍。

## 打开之后能看到什么

顶部导航对应这些能力：

| 页面 | 做什么 |
| --- | --- |
| 工作台 | 输入顾客问题，跑完规划、查数、话术、风险审核，并看到最近运行 |
| Demo | 用对话方式体验同一条客服链路 |
| 业务目录 | 查看商品、订单、物流、FAQ 等样例数据 |
| Skill / Tool / Planner | 查看并编辑话术、查数工具和规划提示词；保存会留下版本 |
| 模型 | 保持 Demo，或改接 DeepSeek、OpenAI、通义、Kimi、智谱等兼容接口 |
| 运营 | 运行监控、服务评价、数据标注、改进建议、测评、Prompt A/B、版本回滚 |

一次回复的顺序是：规划 → 计划校验 → 查数 → 生成话术 → 风险审核 → 必要时转人工。查数失败会标成运行失败，页面上能看到失败停在哪一步。

## 在自己的电脑上运行

需要：

- [Node.js 20.9](https://nodejs.org/) 或更高（安装后自带 `npm`）
- [Git](https://git-scm.com/)
- pnpm 10（下面第 2 步会装）

在终端依次执行（Windows 用 PowerShell 即可）：

```bash
node -v
npm install -g pnpm@10.15.1
git clone https://github.com/haotian-497/snackops.git
cd snackops
pnpm install
pnpm dev
```

`git clone` 里的地址换成这个仓库的地址。克隆出来的文件夹名如果不是 `snackops`，`cd` 进实际文件夹即可。

依赖安装需要联网。看到本地地址后，用浏览器打开：

[http://localhost:5000](http://localhost:5000)

结束时在运行 `pnpm dev` 的窗口按 `Ctrl + C`。如果 5000 端口已被占用，可以换端口再启动：

```powershell
$env:DEPLOY_RUN_PORT=5001; pnpm dev
```

然后打开 `http://localhost:5001`。

## 建议按这个顺序看

1. 打开 **Demo** 或 **工作台**，输入：`客服说我中奖了，要转账验证才能兑奖`。看回复是否拒绝转账，以及这次回答经过了哪些步骤。
2. 在工作台点 **查看全部运行存档**，进入一条记录，核对计划、查数结果、风险结论和最终回复。
3. 打开 **业务目录**，看商品和订单样例；再打开 **Skill / Tool / Planner**，看话术和工具是怎么配的。
4. 打开 **运营**，按页面顺序看一遍：运行监控 → 服务评价 → 改进建议 → 测评集 → Prompt A/B → 版本回滚。这些页面里已经放好了演示数据。

演示数据被改乱之后，在项目目录执行：

```bash
pnpm demo:reset
```

或在 **模型** 页点击「一键恢复演示数据」。这会恢复测评、标注、Skill 元数据和模型配置，并切回 Demo 模式；商品、订单等业务样例会保留。页面上保存过的 API Key 不会被清掉。

## 可选：换成真实模型

保持 Demo 就够看完整个产品。如果要对比真实模型效果：打开 **模型** → 选择厂商 → 填写 API Key 和 Base URL → 保存 → 切换到 `openai-compatible` → **测试连接**。

Key 保存在本机 `data/llm-secrets.json`。不要把这个文件或填了 Key 的 `.env` 提交到 GitHub、也不要发给别人。真实模型缺少 Key 时会直接报错，页面不会悄悄改回 Demo 答案。

## 环境变量

需要改端口或默认模型时，把 `.env.example` 复制为 `.env`：

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `demo` 或 `openai-compatible` |
| `LLM_MODEL` | 模型名 |
| `OPENAI_API_KEY` | 兼容接口密钥；也可以只在「模型」页填写 |
| `OPENAI_BASE_URL` | 兼容接口地址 |
| `DEPLOY_RUN_PORT` | 端口，默认 `5000` |
| `ALLOW_DEMO_RESET` | 设为 `1` 时，生产环境也允许在页面上恢复演示数据 |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 本地运行 |
| `pnpm demo:reset` | 恢复演示数据 |
| `pnpm test` | 运行测试 |
| `pnpm validate` | 类型检查、代码检查和测试 |
| `pnpm build` 然后 `pnpm start` | 按生产模式构建并启动 |

## 技术栈

Next.js、React、TypeScript、Tailwind CSS。业务数据和运行记录放在本地 JSON 文件里，Demo 模式不连接外部数据库，也不需要申请模型账号。

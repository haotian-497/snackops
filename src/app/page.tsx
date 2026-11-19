import { Cookie, Database, GitBranch, Wrench } from "lucide-react";

import { AgentWorkbench } from "@/components/agent-workbench";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusLabel } from "@/components/status-label";
import { TicketChart } from "@/components/ticket-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listRunRecords } from "@/lib/agent/runs";
import { listDataFileStats } from "@/lib/inventory";
import { ticketStatusLabel, productStatusLabel } from "@/lib/labels";
import { readJson } from "@/lib/store";
import type { Product, Skill, Ticket } from "@/lib/types";
import { formatFen } from "@/lib/utils";

export const dynamic = "force-dynamic";

function toneForTicket(status: Ticket["status"]) {
  if (status === "resolved") return "ok" as const;
  if (status === "human_takeover") return "danger" as const;
  if (status === "bot_handling") return "info" as const;
  return "warn" as const;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const initialQuestion = typeof query.q === "string" ? query.q : undefined;

  const [products, tickets, skills, runSummaries, fileStats] = await Promise.all([
    readJson<Product[]>("products.json"),
    readJson<Ticket[]>("tickets.json"),
    readJson<Skill[]>("skills.json"),
    listRunRecords({ summary: true }),
    listDataFileStats(),
  ]);

  const recentRuns = runSummaries.slice(0, 8);
  const runningCount = runSummaries.filter((run) => run.status === "running").length;

  const ticketSeries = Object.entries(ticketStatusLabel).map(([status, name]) => ({
    name,
    count: tickets.filter((ticket) => ticket.status === status).length,
  }));

  const failedFiles = fileStats.filter((item) => !item.ok);
  const storeReady = failedFiles.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agent 工作台"
        description="输入问题后走 Planner、计划校验、Tool/Skill 执行和 risk-check。下方为工单分布与商品基线。"
      />

      <AgentWorkbench initialRuns={recentRuns} initialQuestion={initialQuestion} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="min-h-[4.5rem]">
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-primary" aria-hidden="true" />
              数据文件
            </CardTitle>
            <CardDescription>服务端 JSON 目录</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-semibold">{fileStats.length}</p>
            <StatusLabel
              text={storeReady ? "全部可读" : `${failedFiles.length} 个读取失败`}
              tone={storeReady ? "ok" : "danger"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="min-h-[4.5rem]">
            <CardTitle>待处理工单</CardTitle>
            <CardDescription>非已解决状态</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {tickets.filter((ticket) => ticket.status !== "resolved").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="min-h-[4.5rem]">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="size-4 text-primary" aria-hidden="true" />
              已启用 Skill
            </CardTitle>
            <CardDescription>skills 配置中已开启</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {skills.filter((skill) => skill.enabled).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="min-h-[4.5rem]">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" aria-hidden="true" />
              运行中会话
            </CardTitle>
            <CardDescription>status 为 running</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{runningCount}</p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>工单状态分布</CardTitle>
            <CardDescription>数字来自 tickets.json，不是占位图</CardDescription>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <EmptyState title="暂无工单" description="接入工单写入后，这里会显示状态分布。" />
            ) : (
              <TicketChart data={ticketSeries} />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>商品快照</CardTitle>
            <CardDescription>客服解释库存与价格时使用</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {products.length === 0 ? (
              <EmptyState title="暂无商品" description="请向 products.json 写入演示数据。" />
            ) : (
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-2 font-medium">商品</th>
                    <th className="pb-2 font-medium">价格</th>
                    <th className="pb-2 font-medium">库存</th>
                    <th className="pb-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-t border-border">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Cookie className="size-3.5 text-primary" aria-hidden="true" />
                          <span>{product.name}</span>
                        </div>
                      </td>
                      <td>{formatFen(product.priceFen)}</td>
                      <td>{product.stock}</td>
                      <td>
                        <StatusLabel
                          text={productStatusLabel[product.status]}
                          tone={product.status === "on_sale" ? "ok" : "warn"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近工单</CardTitle>
            <CardDescription>状态同时用文字标注，不只靠颜色</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{ticket.summary}</p>
                  <p className="text-xs text-muted-foreground">{ticket.id}</p>
                </div>
                <StatusLabel text={ticketStatusLabel[ticket.status]} tone={toneForTicket(ticket.status)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>JSON 存储清单</CardTitle>
          <CardDescription>仅服务端可读，客户端不能直接访问 data 目录</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fileStats.map((item) => (
              <li key={item.file} className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{item.file}</span>
                <StatusLabel
                  text={item.ok ? `${item.records} 条` : item.error || "读取失败"}
                  tone={item.ok ? "ok" : "danger"}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

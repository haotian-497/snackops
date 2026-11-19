import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RISK_RULES } from "@/lib/agent/risk-labels";

export const dynamic = "force-dynamic";

export default function RiskRulesHelpPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="风险规则手册"
        description="给新人看的 risk-check 说明：什么是 allow/block、什么是命中规则、R1–R7 各管什么。"
        actions={<BackButton href="/" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>先看这三个词</CardTitle>
          <CardDescription>和「计划与风险」框一一对应</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>
            <strong>风险评估（低/中/高）</strong>
            ：Planner 在出计划时猜的风险程度，只作提示，不等于最终能不能发。
          </p>
          <p>
            <strong>审核结论 allow / block</strong>
            ：对「草稿回复」做 risk-check 的结果。allow=可原样发；block=草稿踩线，通常会再走安全改写。
          </p>
          <p>
            <strong>命中规则（R1…）</strong>
            ：解释「为什么 block」——草稿触发了哪些不允许的检查项。命中 ≥1 条就会 block。
          </p>
          <p className="text-muted-foreground">
            完整 Skill 原文见仓库 <code className="text-xs">skills/risk-check.md</code>
            。点右上角「返回」回到工作台，本次运行结果会保留。
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {RISK_RULES.map((rule) => (
          <Card key={rule.id} id={rule.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {rule.id} · {rule.title}
              </CardTitle>
              <CardDescription>{rule.summary}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{rule.detail}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

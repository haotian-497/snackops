import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATALOG_TYPES, loadCatalog, type CatalogType } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const labels: Record<CatalogType, string> = {
  products: "商品",
  activities: "活动",
  coupons: "优惠券",
  orders: "订单",
  users: "用户",
  "return-policies": "售后政策",
  faq: "FAQ",
  logistics: "物流",
  tickets: "工单",
  "handoff-rules": "转人工规则",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const type = CATALOG_TYPES.includes(params.type as CatalogType)
    ? (params.type as CatalogType)
    : "products";
  const catalog = await loadCatalog(type);
  const columns = catalog.rows[0] ? Object.keys(catalog.rows[0]) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="业务数据目录"
        description="按类型查看零食客服主数据摘要。数据来自服务端 JSON，不是静态占位。"
      />
      <div className="flex flex-wrap gap-2">
        {CATALOG_TYPES.map((item) => (
          <Link
            key={item}
            href={{ pathname: "/catalog", query: { type: item } }}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm",
              item === type ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {labels[item]}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{catalog.label}</CardTitle>
          <Badge>{catalog.count} 条</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {catalog.rows.length === 0 ? (
            <EmptyState title="没有数据" description="对应 JSON 文件为空。" />
          ) : (
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  {columns.map((column) => (
                    <th key={column} className="pb-2 pr-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.rows.map((row, index) => (
                  <tr key={`${type}-${index}`} className="border-t border-border align-top">
                    {columns.map((column) => (
                      <td key={column} className="py-2 pr-3">
                        {row[column]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

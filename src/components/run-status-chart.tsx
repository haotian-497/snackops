"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS: Record<string, string> = {
  成功: "#10b981",
  失败: "#ef4444",
  转人工: "#f59e0b",
  运行中: "#0ea5e9",
};

export function RunStatusChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  const hasData = data.some((item) => item.count > 0);
  if (!hasData) {
    return <p className="text-sm text-muted-foreground">本窗口暂无状态数据。</p>;
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
          <Tooltip formatter={(value) => [`${value} 条`, "数量"]} contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((item) => (
              <Cell key={item.name} fill={COLORS[item.name] || "var(--color-primary)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

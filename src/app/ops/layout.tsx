import type { ReactNode } from "react";

import { OpsSubNav } from "@/components/ops-sub-nav";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">运营中心</h1>
        <OpsSubNav />
      </div>
      {children}
    </div>
  );
}

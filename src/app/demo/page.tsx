import { DemoChat } from "@/components/demo-chat";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <div className="flex justify-center py-1">
      <DemoChat />
    </div>
  );
}

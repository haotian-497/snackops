"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function BackButton({ href = "/", preferHref = false }: { href?: string; preferHref?: boolean }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (!preferHref && window.history.length > 1) {
          router.back();
        } else {
          router.push(href as Parameters<typeof router.push>[0]);
        }
      }}
    >
      <ArrowLeft />
      返回
    </Button>
  );
}

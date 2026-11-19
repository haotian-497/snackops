import { NextResponse } from "next/server";

import { storeProbeSchema, storeTestWriteSchema } from "@/lib/schemas/store-test";
import { ensureJsonFile, readJson, updateJson, writeJson } from "@/lib/store";

const PROBE_FILE = "store-lock-probe.json";

const emptyProbe = {
  writes: 0,
  lastMessage: "未写入",
  updatedAt: new Date(0).toISOString(),
};

export async function GET() {
  const value = await ensureJsonFile(PROBE_FILE, emptyProbe);
  const parsed = storeProbeSchema.parse(value);
  return NextResponse.json({
    ok: true,
    file: PROBE_FILE,
    probe: parsed,
    message: `当前写入计数 ${parsed.writes}`,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = storeTestWriteSchema.parse(body);

  await ensureJsonFile(PROBE_FILE, emptyProbe);
  await writeJson(PROBE_FILE, emptyProbe);

  if (input.injectFailure) {
    await writeJson(PROBE_FILE, {
      writes: 7,
      lastMessage: "提交前快照",
      updatedAt: new Date().toISOString(),
    });

    let failedAsExpected = false;
    try {
      await writeJson(
        PROBE_FILE,
        {
          writes: 99,
          lastMessage: "这行不应被提交",
          updatedAt: new Date().toISOString(),
        },
        {
          beforeCommit: () => {
            throw new Error("injected-write-failure");
          },
        },
      );
    } catch (error) {
      failedAsExpected = error instanceof Error && error.message === "injected-write-failure";
      if (!failedAsExpected) {
        throw error;
      }
    }

    const preserved = storeProbeSchema.parse(await readJson(PROBE_FILE));
    const previousPreserved = preserved.writes === 7 && preserved.lastMessage === "提交前快照";

    return NextResponse.json({
      ok: previousPreserved && failedAsExpected,
      previousPreserved,
      failedAsExpected,
      probe: preserved,
      message: previousPreserved
        ? "写入在提交前失败，上一份有效数据仍在。"
        : "失败回退未生效，上一份数据被覆盖。",
    });
  }

  const workers = Array.from({ length: input.concurrency }, (_, index) =>
    updateJson(PROBE_FILE, (current) => {
      const probe = storeProbeSchema.parse(current);
      return {
        writes: probe.writes + 1,
        lastMessage: `worker-${index}`,
        updatedAt: new Date().toISOString(),
      };
    }),
  );

  await Promise.all(workers);
  const finalProbe = storeProbeSchema.parse(await readJson(PROBE_FILE));
  const lockHeld = finalProbe.writes === input.concurrency;

  return NextResponse.json({
    ok: lockHeld,
    lockHeld,
    writes: finalProbe.writes,
    expectedWrites: input.concurrency,
    probe: finalProbe,
    message: lockHeld
      ? `8 路并发计数正确：最终 writes=${finalProbe.writes}，进程锁生效。`.replace(
          "8",
          String(input.concurrency),
        )
      : `锁可能失效：期望 ${input.concurrency}，实际 ${finalProbe.writes}。`,
  });
}

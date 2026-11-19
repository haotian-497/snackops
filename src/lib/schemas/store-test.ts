import { z } from "zod";

export const storeTestWriteSchema = z.object({
  concurrency: z.number().int().min(1).max(32).default(8),
  injectFailure: z.boolean().default(false),
});

export type StoreTestWriteInput = z.infer<typeof storeTestWriteSchema>;

export const storeProbeSchema = z.object({
  writes: z.number().int().nonnegative(),
  lastMessage: z.string(),
  updatedAt: z.string(),
});

export type StoreProbe = z.infer<typeof storeProbeSchema>;

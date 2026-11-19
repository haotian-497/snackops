import "server-only";

import { readJson } from "@/lib/store";
import { DATA_FILES, type DataFileName } from "@/lib/types";
import { countItems } from "@/lib/utils";

export type DataFileStat = {
  file: DataFileName;
  records: number;
  ok: boolean;
  error?: string;
};

export async function listDataFileStats(): Promise<DataFileStat[]> {
  const results = await Promise.all(
    DATA_FILES.map(async (file) => {
      try {
        const value = await readJson<unknown>(file);
        return { file, records: countItems(value), ok: true };
      } catch (error) {
        return {
          file,
          records: 0,
          ok: false,
          error: error instanceof Error ? error.message : "读取失败",
        };
      }
    }),
  );
  return results;
}

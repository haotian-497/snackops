export type ToolResult<T> =
  | { ok: true; toolId: string; data: T }
  | { ok: false; toolId: string; error: { code: string; message: string } };

export type PriceItemInput = {
  sku: string;
  quantity: number;
};

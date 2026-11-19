"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#f7f3ee] p-6 text-[#1f1a17]">
        <h1 className="text-lg font-semibold">SnackOps 发生未捕获错误</h1>
        <p className="mt-2 text-sm">{error.message || "应用无法继续渲染。"}</p>
        <button
          type="button"
          className="mt-4 rounded-md bg-[#c45c26] px-3 py-2 text-sm text-white"
          onClick={reset}
        >
          重试
        </button>
      </body>
    </html>
  );
}

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTrendResearch } from "./useTrendResearch";

const ev = (type: string, data: Record<string, unknown>) =>
  `data: ${JSON.stringify({ type, data })}\n\n`;

const PLAN = ev("plan_created", {
  title: "計畫",
  tasks: [{ id: "t1", type: "search", objective: "搜尋" }],
});
const RESULT = ev("search_result", { task_id: "t1", results: [{ title: "A", url: "https://a" }] });

function sseResponse(text: string) {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

const input = { title: "題目", content: "", researchDirection: "" };

describe("useTrendResearch", () => {
  it("正常完成", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse(PLAN + RESULT + ev("complete", { final_report: "# 報告" })),
    );
    const { result } = renderHook(() => useTrendResearch({ fetchImpl }));

    await act(() => result.current.start(input));

    expect(result.current.state.phase).toBe("completed");
    expect(result.current.isResearching).toBe(false);
  });

  it("串流結束但沒有 complete → interrupted，而不是誤判為完成", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(PLAN + RESULT));
    const { result } = renderHook(() => useTrendResearch({ fetchImpl }));

    await act(() => result.current.start(input));

    expect(result.current.state.phase).toBe("interrupted");
    expect(result.current.state.error).toMatch(/未收到完成事件/);
  });

  it("格式錯誤的事件被略過並回報，流程繼續", async () => {
    const onInvalidEvent = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse(PLAN + "data: {壞掉\n\n" + ev("complete", { final_report: "# 報告" })),
    );
    const { result } = renderHook(() => useTrendResearch({ fetchImpl, onInvalidEvent }));

    await act(() => result.current.start(input));

    expect(onInvalidEvent).toHaveBeenCalledWith("{壞掉");
    expect(result.current.state.phase).toBe("completed");
  });

  it("HTTP 錯誤 → error，訊息包含狀態碼", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("down", { status: 500 }));
    const { result } = renderHook(() => useTrendResearch({ fetchImpl }));

    await act(() => result.current.start(input));

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toMatch(/HTTP 500/);
  });

  it("元件卸載時中止請求", async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {}); // 永遠不回應
    });
    const { result, unmount } = renderHook(() =>
      useTrendResearch({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    act(() => {
      void result.current.start(input);
    });
    await waitFor(() => expect(signal).toBeDefined());

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("取消後回到 idle，按鈕狀態跟著恢復", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() =>
      useTrendResearch({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    act(() => {
      void result.current.start(input);
    });
    expect(result.current.isResearching).toBe(true);

    act(() => result.current.cancel());
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.isResearching).toBe(false);
  });
});

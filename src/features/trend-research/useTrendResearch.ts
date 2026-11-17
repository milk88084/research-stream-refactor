"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { parseSSEStream } from "@/lib/sse/parseSSEStream";
import { parseResearchEvent } from "./events";
import {
  initialResearchState,
  researchReducer,
  selectIsResearching,
} from "./researchReducer";

export interface StartResearchInput {
  title: string;
  content: string;
  researchDirection: string;
}

export interface UseTrendResearchOptions {
  /** 研究串流 API；預設打本專案的 mock API */
  endpoint?: string;
  /** 方便測試時注入 */
  fetchImpl?: typeof fetch;
  /** 收到格式錯誤的事件時呼叫（可接 Sentry 等監控） */
  onInvalidEvent?: (raw: string) => void;
}

/**
 * 趨勢研究的「流程控制」：發請求、讀串流、把事件交給 reducer、處理取消與錯誤。
 * 頁面元件只需要拿 state 來畫畫面，以及呼叫 start / cancel / reset。
 */
export function useTrendResearch({
  endpoint = "/api/mock-research",
  fetchImpl,
  onInvalidEvent,
}: UseTrendResearchOptions = {}) {
  const [state, dispatch] = useReducer(researchReducer, initialResearchState);
  const controllerRef = useRef<AbortController | null>(null);
  // 用 ref 保存回呼，避免呼叫端每次 render 傳入新函式導致 start 一直重建
  const onInvalidRef = useRef(onInvalidEvent);
  useEffect(() => {
    onInvalidRef.current = onInvalidEvent;
  });
  const reportInvalid = (raw: string) =>
    (onInvalidRef.current ?? defaultOnInvalid)(raw);

  // 元件卸載時中止進行中的請求
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(
    async (input: StartResearchInput) => {
      controllerRef.current?.abort(); // 重新開始前先中止上一次
      const controller = new AbortController();
      controllerRef.current = controller;
      const doFetch = fetchImpl ?? fetch;

      dispatch({ type: "started" });

      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.text().catch(() => "")).slice(0, 300);
          throw new Error(`研究服務回應 HTTP ${res.status}${body ? `：${body}` : ""}`);
        }
        if (!res.body) throw new Error("無法讀取研究服務的串流回應");

        for await (const data of parseSSEStream(res.body, controller.signal)) {
          const event = parseResearchEvent(safeJsonParse(data));
          if (!event) {
            reportInvalid(data);
            continue;
          }
          dispatch({ type: "event", event });
        }

        // 串流已關閉；如果還沒進入完成或失敗狀態，reducer 會轉成 interrupted / error
        if (!controller.signal.aborted) dispatch({ type: "stream_ended" });
      } catch (err) {
        if (controller.signal.aborted) return; // 取消或被下一次 start 取代，不算錯誤
        dispatch({ type: "failed", message: toUserMessage(err) });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportInvalid 只讀 ref
    [endpoint, fetchImpl],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: "cancelled" });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  return {
    state,
    isResearching: selectIsResearching(state),
    start,
    cancel,
    reset,
  };
}

/** JSON 解析失敗回傳 undefined，交給 parseResearchEvent 判定為無效事件 */
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const defaultOnInvalid = (raw: string) =>
  console.warn("[research] 略過格式錯誤的事件", raw);

function toUserMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof TypeError || /network|failed to fetch|load failed/i.test(msg)) {
    return "連線中斷，已保留目前進度。可以檢視部分結果，或重新執行研究。";
  }
  return msg || "發生未知錯誤";
}

import type { ResearchEvent, SearchResultItem, TaskType } from "./events";

/**
 * 研究流程的狀態與狀態轉換，全部集中在這個純函式裡。
 *
 * 改善前：
 * - 狀態轉換散落在元件內的 switch，每個 case 各自呼叫 setState
 * - 另外用一個 isResearching boolean 和 phase 手動同步
 * - 「把執行中的任務標成失敗、判斷有沒有可用的部分結果」這段邏輯
 *   在 error 事件、網路錯誤、串流提前結束三個地方各寫一次
 *
 * 改善後：
 * - 所有轉換都是 (state, action) => state，不需要 React 就能測試
 * - isResearching 由 phase 推導（selectIsResearching），不另外存
 * - 結束類的轉換共用 finishWithFailure()
 */

export type Phase =
  | "idle"
  | "planning"
  | "executing"
  | "completed"
  | "error"
  | "interrupted";

export type TaskStatus = "pending" | "running" | "completed" | "error";

export interface ResearchTask {
  id: string;
  type: TaskType;
  objective: string;
  status: TaskStatus;
}

export interface ResearchState {
  phase: Phase;
  planTitle?: string;
  tasks: ResearchTask[];
  searchResults: Record<string, SearchResultItem[]>;
  bulletPoints: Record<string, string>;
  analyses: Record<string, string>;
  sources: SearchResultItem[];
  finalReport?: string;
  error?: string;
}

export type ResearchAction =
  | { type: "started" }
  | { type: "event"; event: ResearchEvent }
  /** 串流正常關閉，但沒有收到 complete 或 error 事件 */
  | { type: "stream_ended" }
  /** fetch 失敗、HTTP 錯誤或連線中斷 */
  | { type: "failed"; message: string }
  /** 使用者取消 */
  | { type: "cancelled" }
  | { type: "reset" };

export const initialResearchState: ResearchState = {
  phase: "idle",
  tasks: [],
  searchResults: {},
  bulletPoints: {},
  analyses: {},
  sources: [],
};

const TERMINAL: readonly Phase[] = ["completed", "error", "interrupted"];
const isTerminal = (p: Phase) => TERMINAL.includes(p);

/* ---------- selectors：由狀態推導，不另外存 ---------- */

export const selectIsResearching = (s: ResearchState) =>
  s.phase === "planning" || s.phase === "executing";

export const selectHasPartialResult = (s: ResearchState) =>
  s.tasks.some(
    (t) =>
      Boolean(s.bulletPoints[t.id]) ||
      Boolean(s.analyses[t.id]) ||
      (s.searchResults[t.id]?.length ?? 0) > 0,
  );

export const selectProgress = (s: ResearchState) => ({
  done: s.tasks.filter((t) => t.status === "completed").length,
  total: s.tasks.length,
  running: s.tasks.find((t) => t.status === "running"),
});

/* ---------- helpers ---------- */

const setTaskStatus = (
  tasks: ResearchTask[],
  taskId: string,
  status: TaskStatus,
): ResearchTask[] => tasks.map((t) => (t.id === taskId ? { ...t, status } : t));

/** 失敗收尾：執行中的任務標成 error；有部分結果就是 interrupted，沒有就是 error */
function finishWithFailure(state: ResearchState, message: string): ResearchState {
  const tasks = state.tasks.map((t) =>
    t.status === "running" ? { ...t, status: "error" as const } : t,
  );
  const next = { ...state, tasks };
  return {
    ...next,
    phase: selectHasPartialResult(next) ? "interrupted" : "error",
    error: message,
  };
}

/* ---------- reducer ---------- */

export function researchReducer(
  state: ResearchState,
  action: ResearchAction,
): ResearchState {
  switch (action.type) {
    case "started":
      return { ...initialResearchState, phase: "planning" };

    case "reset":
      return initialResearchState;

    case "cancelled":
      if (!selectIsResearching(state)) return state;
      return selectHasPartialResult(state)
        ? finishWithFailure(state, "已取消研究，保留目前進度。")
        : initialResearchState;

    case "stream_ended":
      if (!selectIsResearching(state)) return state;
      return finishWithFailure(
        state,
        "研究服務提前結束連線（未收到完成事件），可以檢視目前的部分結果或重新執行。",
      );

    case "failed":
      if (!selectIsResearching(state)) return state;
      return finishWithFailure(state, action.message);

    case "event":
      // 已經結束（完成、錯誤、中斷）後才到的事件一律忽略，避免狀態被覆蓋
      if (isTerminal(state.phase) || state.phase === "idle") return state;
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: ResearchState, event: ResearchEvent): ResearchState {
  switch (event.type) {
    case "planning_start":
      return { ...state, phase: "planning", planTitle: event.title };

    case "plan_created":
      return {
        ...state,
        phase: "executing",
        planTitle: event.title,
        tasks: event.tasks.map((t) => ({ ...t, status: "pending" })),
      };

    case "task_start":
      return { ...state, tasks: setTaskStatus(state.tasks, event.taskId, "running") };

    case "search_result": {
      const known = new Set(state.sources.map((s) => s.url));
      return {
        ...state,
        searchResults: { ...state.searchResults, [event.taskId]: event.results },
        sources: [...state.sources, ...event.results.filter((r) => !known.has(r.url))],
        tasks: setTaskStatus(state.tasks, event.taskId, "completed"),
      };
    }

    case "summarize_result":
      return {
        ...state,
        bulletPoints: { ...state.bulletPoints, [event.taskId]: event.bulletPoints },
        tasks: setTaskStatus(state.tasks, event.taskId, "completed"),
      };

    case "analyze_result":
      return {
        ...state,
        analyses: { ...state.analyses, [event.taskId]: event.analysis },
        tasks: setTaskStatus(state.tasks, event.taskId, "completed"),
      };

    case "synthesize_result":
    case "task_complete":
      return { ...state, tasks: setTaskStatus(state.tasks, event.taskId, "completed") };

    case "complete":
      return { ...state, phase: "completed", finalReport: event.finalReport, error: undefined };

    case "error":
      return finishWithFailure(state, event.message);
  }
}

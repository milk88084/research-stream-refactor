/**
 * 研究串流的事件格式，以及「進入系統前」的格式驗證。
 *
 * 原本的寫法是 `data.title as string`、`data.tasks as Array<...>`，
 * 型別斷言只騙得過 TypeScript，上游格式一變就會在畫面上壞掉。
 * 這裡改成在入口驗證：不合格式的事件回傳 null，由呼叫端記錄後略過。
 */

export type TaskType = "search" | "summarize" | "analyze" | "synthesize";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

export type ResearchEvent =
  | { type: "planning_start"; title: string }
  | {
      type: "plan_created";
      title: string;
      tasks: { id: string; type: TaskType; objective: string }[];
    }
  | { type: "task_start"; taskId: string }
  | { type: "search_result"; taskId: string; results: SearchResultItem[] }
  | { type: "summarize_result"; taskId: string; bulletPoints: string }
  | { type: "analyze_result"; taskId: string; analysis: string }
  | { type: "synthesize_result"; taskId: string }
  | { type: "task_complete"; taskId: string }
  | { type: "complete"; finalReport: string }
  | { type: "error"; message: string };

const TASK_TYPES: readonly string[] = ["search", "summarize", "analyze", "synthesize"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";

/** 上游格式：{ type: string, data: { ...snake_case 欄位 } } */
export function parseResearchEvent(raw: unknown): ResearchEvent | null {
  if (!isObject(raw) || !isString(raw.type)) return null;
  const data = isObject(raw.data) ? raw.data : {};
  const taskId = data.task_id;

  switch (raw.type) {
    case "planning_start":
      return isString(data.title) ? { type: "planning_start", title: data.title } : null;

    case "plan_created": {
      if (!isString(data.title) || !Array.isArray(data.tasks)) return null;
      const tasks = data.tasks.filter(
        (t): t is { id: string; type: TaskType; objective: string } =>
          isObject(t) &&
          isString(t.id) &&
          isString(t.type) &&
          TASK_TYPES.includes(t.type) &&
          isString(t.objective),
      );
      // 任何一個任務格式錯誤，就視為整個計畫無效，避免顯示殘缺的任務清單
      if (tasks.length !== data.tasks.length) return null;
      return { type: "plan_created", title: data.title, tasks };
    }

    case "task_start":
    case "synthesize_result":
    case "task_complete":
      return isString(taskId) ? { type: raw.type, taskId } : null;

    case "search_result": {
      if (!isString(taskId) || !Array.isArray(data.results)) return null;
      const results = data.results.filter(
        (r): r is SearchResultItem => isObject(r) && isString(r.title) && isString(r.url),
      );
      return { type: "search_result", taskId, results };
    }

    case "summarize_result":
      return isString(taskId) && isString(data.bullet_points)
        ? { type: "summarize_result", taskId, bulletPoints: data.bullet_points }
        : null;

    case "analyze_result":
      return isString(taskId) && isString(data.analysis)
        ? { type: "analyze_result", taskId, analysis: data.analysis }
        : null;

    case "complete":
      return isString(data.final_report)
        ? { type: "complete", finalReport: data.final_report }
        : null;

    case "error":
      return {
        type: "error",
        message: isString(data.message) ? data.message : "研究服務回傳錯誤",
      };

    default:
      return null;
  }
}

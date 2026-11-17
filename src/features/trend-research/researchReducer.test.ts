import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "./events";
import {
  initialResearchState,
  researchReducer,
  selectIsResearching,
  type ResearchAction,
  type ResearchState,
} from "./researchReducer";

const e = (event: ResearchEvent): ResearchAction => ({ type: "event", event });
const run = (actions: ResearchAction[], from: ResearchState = initialResearchState) =>
  actions.reduce(researchReducer, from);

const PLAN = e({
  type: "plan_created",
  title: "計畫",
  tasks: [
    { id: "t1", type: "search", objective: "搜尋" },
    { id: "t2", type: "summarize", objective: "整理" },
  ],
});

describe("researchReducer", () => {
  it("正常流程：planning → executing → completed", () => {
    const s = run([
      { type: "started" },
      e({ type: "planning_start", title: "計畫" }),
      PLAN,
      e({ type: "task_start", taskId: "t1" }),
      e({ type: "search_result", taskId: "t1", results: [{ title: "A", url: "https://a" }] }),
      e({ type: "task_start", taskId: "t2" }),
      e({ type: "summarize_result", taskId: "t2", bulletPoints: "- 重點" }),
      e({ type: "complete", finalReport: "# 報告" }),
    ]);
    expect(s.phase).toBe("completed");
    expect(s.finalReport).toBe("# 報告");
    expect(s.tasks.map((t) => t.status)).toEqual(["completed", "completed"]);
    expect(selectIsResearching(s)).toBe(false);
  });

  it("isResearching 由 phase 推導，不會和 phase 不一致", () => {
    expect(selectIsResearching(run([{ type: "started" }]))).toBe(true);
    expect(selectIsResearching(run([{ type: "started" }, PLAN]))).toBe(true);
    expect(selectIsResearching(initialResearchState)).toBe(false);
  });

  it("來源依 url 去重", () => {
    const s = run([
      { type: "started" },
      PLAN,
      e({ type: "search_result", taskId: "t1", results: [{ title: "A", url: "https://a" }] }),
      e({ type: "search_result", taskId: "t2", results: [{ title: "A2", url: "https://a" }] }),
    ]);
    expect(s.sources).toHaveLength(1);
  });

  describe("失敗收尾（error 事件、連線失敗、提前結束共用同一套規則）", () => {
    const withPartial = run([
      { type: "started" },
      PLAN,
      e({ type: "search_result", taskId: "t1", results: [{ title: "A", url: "https://a" }] }),
      e({ type: "task_start", taskId: "t2" }),
    ]);
    const noPartial = run([{ type: "started" }, PLAN, e({ type: "task_start", taskId: "t1" })]);

    it.each<[string, ResearchAction]>([
      ["error 事件", e({ type: "error", message: "逾時" })],
      ["連線失敗", { type: "failed", message: "斷線" }],
      ["串流提前結束", { type: "stream_ended" }],
    ])("%s：有部分結果 → interrupted，執行中任務標成 error", (_, action) => {
      const s = researchReducer(withPartial, action);
      expect(s.phase).toBe("interrupted");
      expect(s.tasks.find((t) => t.id === "t2")?.status).toBe("error");
      expect(s.error).toBeTruthy();
    });

    it.each<[string, ResearchAction]>([
      ["error 事件", e({ type: "error", message: "逾時" })],
      ["連線失敗", { type: "failed", message: "斷線" }],
      ["串流提前結束", { type: "stream_ended" }],
    ])("%s：沒有部分結果 → error", (_, action) => {
      expect(researchReducer(noPartial, action).phase).toBe("error");
    });
  });

  it("完成之後才到的事件被忽略，不會把狀態蓋掉", () => {
    const done = run([{ type: "started" }, PLAN, e({ type: "complete", finalReport: "# 報告" })]);
    const after = run(
      [e({ type: "error", message: "晚到的錯誤" }), { type: "stream_ended" }, { type: "failed", message: "x" }],
      done,
    );
    expect(after).toBe(done);
  });

  it("idle 時收到的事件被忽略（例如已取消的請求殘留的事件）", () => {
    expect(run([PLAN])).toBe(initialResearchState);
  });

  it("取消：沒有部分結果回到 idle，有部分結果保留為 interrupted", () => {
    expect(run([{ type: "started" }, PLAN, { type: "cancelled" }]).phase).toBe("idle");
    expect(
      run([
        { type: "started" },
        PLAN,
        e({ type: "summarize_result", taskId: "t2", bulletPoints: "- 重點" }),
        { type: "cancelled" },
      ]).phase,
    ).toBe("interrupted");
  });

  it("重新開始會清掉上一次的結果", () => {
    const done = run([{ type: "started" }, PLAN, e({ type: "complete", finalReport: "# 舊" })]);
    const restarted = researchReducer(done, { type: "started" });
    expect(restarted).toEqual({ ...initialResearchState, phase: "planning" });
  });
});

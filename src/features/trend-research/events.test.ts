import { describe, expect, it } from "vitest";
import { parseResearchEvent } from "./events";

describe("parseResearchEvent", () => {
  it("把上游 snake_case 格式轉成內部事件", () => {
    expect(
      parseResearchEvent({
        type: "summarize_result",
        data: { task_id: "t2", bullet_points: "- 重點" },
      }),
    ).toEqual({ type: "summarize_result", taskId: "t2", bulletPoints: "- 重點" });
  });

  it("plan_created 任一任務格式錯誤就整筆無效", () => {
    expect(
      parseResearchEvent({
        type: "plan_created",
        data: {
          title: "計畫",
          tasks: [
            { id: "t1", type: "search", objective: "搜尋" },
            { id: "t2", type: "unknown_type", objective: "?" },
          ],
        },
      }),
    ).toBeNull();
  });

  it("欄位型別錯誤回傳 null（原本的 as string 會讓它直接流進畫面）", () => {
    expect(parseResearchEvent({ type: "planning_start", data: { title: 123 } })).toBeNull();
    expect(parseResearchEvent({ type: "complete", data: {} })).toBeNull();
  });

  it("未知事件類型與非物件輸入回傳 null", () => {
    expect(parseResearchEvent({ type: "foo", data: {} })).toBeNull();
    expect(parseResearchEvent("not an object")).toBeNull();
    expect(parseResearchEvent(null)).toBeNull();
  });

  it("搜尋結果中格式錯誤的項目會被濾掉", () => {
    expect(
      parseResearchEvent({
        type: "search_result",
        data: { task_id: "t1", results: [{ title: "A", url: "https://a" }, { title: "缺 url" }] },
      }),
    ).toEqual({ type: "search_result", taskId: "t1", results: [{ title: "A", url: "https://a" }] });
  });

  it("error 事件沒有 message 時給預設訊息", () => {
    expect(parseResearchEvent({ type: "error", data: {} })).toEqual({
      type: "error",
      message: "研究服務回傳錯誤",
    });
  });
});

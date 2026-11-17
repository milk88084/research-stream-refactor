"use client";

import { useState } from "react";
import { useTrendResearch } from "./useTrendResearch";
import { selectProgress, type Phase } from "./researchReducer";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "尚未開始",
  planning: "正在規劃研究結構…",
  executing: "執行研究任務中…",
  completed: "研究完成",
  error: "研究發生錯誤",
  interrupted: "研究未跑完，已保留目前進度",
};

const TASK_LABEL = { search: "搜尋", summarize: "整理", analyze: "分析", synthesize: "彙整" } as const;
const STATUS_LABEL = { pending: "等待中", running: "執行中", completed: "完成", error: "失敗" } as const;

/** 只負責畫面：所有流程與狀態都來自 useTrendResearch */
export function TrendResearchPanel({ endpoint }: { endpoint: string }) {
  const { state, isResearching, start, cancel, reset } = useTrendResearch({ endpoint });
  const [title, setTitle] = useState("充電樁市場");
  const progress = selectProgress(state);

  return (
    <>
      <div className="card">
        <label htmlFor="title">研究題目</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row">
          <button
            className="primary"
            disabled={isResearching || !title.trim()}
            onClick={() => start({ title, content: "", researchDirection: "" })}
          >
            {state.phase === "idle" ? "開始研究" : "重新執行"}
          </button>
          <button disabled={!isResearching} onClick={cancel}>取消</button>
          <button disabled={isResearching || state.phase === "idle"} onClick={reset}>清除</button>
        </div>
      </div>

      {state.phase !== "idle" && (
        <div className="card" aria-live="polite">
          <div className={`status ${state.phase}`}>
            {PHASE_LABEL[state.phase]}
            {state.phase === "executing" && ` (${progress.done}/${progress.total})`}
          </div>
          {state.error && <p className="note">{state.error}</p>}

          {state.tasks.length > 0 && (
            <ul className="tasks">
              {state.tasks.map((t) => (
                <li key={t.id}>
                  <span className={`badge ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  <span>{TASK_LABEL[t.type]}：{t.objective}</span>
                </li>
              ))}
            </ul>
          )}

          {state.finalReport && <pre>{state.finalReport}</pre>}
          {!state.finalReport && state.phase === "interrupted" && (
            <pre>
              {state.tasks
                .map((t) => state.bulletPoints[t.id] ?? state.analyses[t.id])
                .filter(Boolean)
                .join("\n\n") || "（已取得搜尋結果，尚無文字摘要）"}
            </pre>
          )}
          {state.sources.length > 0 && (
            <p className="note">資料來源 {state.sources.length} 筆</p>
          )}
        </div>
      )}
    </>
  );
}

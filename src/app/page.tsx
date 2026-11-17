"use client";

import { useState } from "react";
import { TrendResearchPanel } from "@/features/trend-research/TrendResearchPanel";

const SCENARIOS = [
  { value: "normal", label: "正常完成" },
  { value: "disconnect", label: "中途斷線（沒有完成事件）" },
  { value: "malformed", label: "夾雜格式錯誤的事件" },
  { value: "error", label: "服務回傳 error 事件" },
  { value: "http500", label: "HTTP 500" },
];

export default function Page() {
  const [scenario, setScenario] = useState("normal");

  return (
    <main>
      <h1>研究串流重構 Prototype</h1>
      <p className="sub">
        parseSSEStream（解析）→ parseResearchEvent（驗證）→ researchReducer（狀態）→ useTrendResearch（流程）→ 畫面
      </p>

      <div className="card">
        <label htmlFor="scenario">模擬情境</label>
        <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {SCENARIOS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <p className="note">切換情境會重新掛載面板，進行中的請求會在卸載時自動中止。</p>
      </div>

      <TrendResearchPanel key={scenario} endpoint={`/api/mock-research?scenario=${scenario}`} />
    </main>
  );
}

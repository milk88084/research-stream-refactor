# 研究串流重構 Prototype

把一個 1,500 行頁面元件裡的「AI 研究串流」流程拆成四層：解析、驗證、狀態、流程。每一層都可以單獨測試。

> 這是脫敏後的重現版本，沒有使用原專案的程式碼、API 位址或資料。事件格式比照原服務，研究內容由 mock API 產生。

## 執行

```bash
npm install
npm run dev        # http://localhost:3000 ，可切換 5 種模擬情境
npm test           # Vitest，33 個測試
npm run typecheck
npm run build
```

## 結構

```
src/
├─ lib/sse/parseSSEStream.ts             位元組 → SSE 事件字串（不認識業務格式，可共用）
├─ features/trend-research/
│  ├─ events.ts                          上游事件的型別與入口驗證（取代 `as string` 斷言）
│  ├─ researchReducer.ts                 所有狀態轉換（純函式）＋ selectors
│  ├─ useTrendResearch.ts                發請求、讀串流、取消、錯誤處理
│  └─ TrendResearchPanel.tsx             只負責畫面
└─ app/api/mock-research/route.ts        模擬 SSE 服務（輸出會被切成不規則的位元組片段）
```

資料流：`fetch` → `parseSSEStream` → `JSON.parse` → `parseResearchEvent` → `dispatch` → `researchReducer` → 畫面

## 模擬情境

| scenario | 行為 | 預期結果 |
|---|---|---|
| `normal` | 正常跑完 | `completed` |
| `disconnect` | 跑到一半關閉連線，沒有 complete | `interrupted`，保留已完成的任務與摘要 |
| `malformed` | 夾雜壞 JSON、欄位型別錯誤、未知事件 | 錯誤事件被略過並回報，流程照常 `completed` |
| `error` | 中途送出 error 事件 | 有部分結果 → `interrupted` |
| `http500` | 直接回 500 | `error`，訊息含狀態碼 |

## 和改善前的對照

| 改善前 | 改善後 |
|---|---|
| 串流解析寫在頁面元件裡，專案內有 3 份類似的實作 | `parseSSEStream` 一份，有測試 |
| `data.title as string` 直接轉型 | `parseResearchEvent` 在入口驗證，不合格的事件記錄後略過 |
| 元件內的大 switch，每個 case 各自 `setState` | `researchReducer` 純函式，不需要 React 就能測試 |
| `isResearching` 與 `phase` 兩份狀態手動同步 | `selectIsResearching(state)` 由 `phase` 推導 |
| 「標記失敗任務、判斷部分結果」在 3 個地方各寫一次 | `finishWithFailure()` 共用 |
| 結束後才到的事件可能蓋掉狀態 | 進入結束狀態後忽略後續事件 |
| 沒有測試框架 | Vitest：解析器、驗證、reducer、hook，共 33 個測試 |

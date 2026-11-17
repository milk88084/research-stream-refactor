/**
 * 模擬研究服務的 SSE 串流（脫敏版，事件格式比照實際服務）。
 *
 * ?scenario=
 *   normal      正常跑完
 *   disconnect  跑到一半連線關閉，沒有 complete 事件
 *   malformed   中間夾雜壞掉的 JSON 與缺欄位的事件，仍會正常完成
 *   error       中途送出 error 事件
 *   http500     直接回 HTTP 500
 *
 * 為了驗證解析器，輸出會被切成不規則大小的位元組片段，
 * 片段邊界可能落在一行中間，甚至落在中文字的位元組中間。
 */

export const dynamic = "force-dynamic";

type Scenario = "normal" | "disconnect" | "malformed" | "error" | "http500";

const ev = (type: string, data: Record<string, unknown>) =>
  `data: ${JSON.stringify({ type, data })}\n\n`;

function buildScript(scenario: Scenario, title: string): string[] {
  const tasks = [
    { id: "t1", type: "search", objective: `搜尋「${title}」的近期資料` },
    { id: "t2", type: "summarize", objective: "整理重點" },
    { id: "t3", type: "analyze", objective: "分析趨勢與影響" },
    { id: "t4", type: "synthesize", objective: "彙整成報告" },
  ];

  const head = [
    ev("planning_start", { title: `${title} 研究計畫` }),
    ": heartbeat\n\n",
    ev("plan_created", { title: `${title} 研究計畫`, tasks }),
    ev("task_start", { task_id: "t1" }),
    ev("search_result", {
      task_id: "t1",
      results: [
        { title: "產業報告 A", url: "https://example.com/a" },
        { title: "新聞 B", url: "https://example.com/b" },
      ],
    }),
    ev("task_start", { task_id: "t2" }),
    ev("summarize_result", { task_id: "t2", bullet_points: "- 重點一\n- 重點二" }),
  ];

  const tail = [
    ev("task_start", { task_id: "t3" }),
    ev("analyze_result", { task_id: "t3", analysis: "需求持續成長，但供應端仍有瓶頸。" }),
    ": heartbeat\n\n",
    ev("task_start", { task_id: "t4" }),
    ev("synthesize_result", { task_id: "t4" }),
    ev("complete", { final_report: `# ${title}\n\n## 摘要\n需求持續成長，但供應端仍有瓶頸。` }),
  ];

  switch (scenario) {
    case "disconnect":
      return [...head, ev("task_start", { task_id: "t3" })]; // 沒有 complete 就結束
    case "malformed":
      return [
        ...head,
        "data: {這不是 JSON\n\n",
        ev("plan_created", { title: 123 }), // 欄位型別錯誤
        ev("unknown_event", { foo: "bar" }),
        ...tail,
      ];
    case "error":
      return [
        ...head,
        ev("task_start", { task_id: "t3" }),
        ev("error", { message: "分析服務逾時" }),
      ];
    default:
      return [...head, ...tail];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const url = new URL(req.url);
  const scenario = (url.searchParams.get("scenario") ?? "normal") as Scenario;
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = body.title?.trim() || "充電樁市場";

  if (scenario === "http500") {
    return new Response("upstream unavailable", { status: 500 });
  }

  const encoder = new TextEncoder();
  const script = buildScript(scenario, title);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of script) {
        if (req.signal.aborted) break;
        await sleep(450);
        const bytes = encoder.encode(piece);
        // 切成 1～17 位元組的不規則片段
        for (let i = 0; i < bytes.length; ) {
          const size = 1 + Math.floor(Math.random() * 17);
          controller.enqueue(bytes.slice(i, i + size));
          i += size;
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

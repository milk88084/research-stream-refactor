/**
 * 把 fetch 回傳的 ReadableStream 解析成一個個 SSE 事件的 data 字串。
 *
 * 只負責「位元組 → 文字 → SSE 事件」，不認識任何業務事件格式，
 * 所以可以被所有串流功能共用，也可以單獨測試。
 *
 * 處理的情況：
 * - 一行被切在兩個 chunk 之間（buffer 保留未完成的行）
 * - 中文等多位元組字元被切在兩個 chunk 之間（TextDecoder stream 模式）
 * - `: heartbeat` 這類註解行與空行
 * - CRLF 換行
 * - 一個事件有多行 data（依規格用 \n 串接）
 * - 串流結束時最後一個事件沒有以空行收尾
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const flush = function* () {
    if (dataLines.length > 0) {
      yield dataLines.join("\n");
      dataLines = [];
    }
  };

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          // 空行 = 一個事件結束
          yield* flush();
        } else if (line.startsWith(":")) {
          // 註解行（例如 heartbeat），忽略
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        // event: / id: / retry: 目前用不到，忽略
      }
    }

    // 串流結束：處理剩下沒有換行結尾的內容
    buffer += decoder.decode();
    if (buffer.startsWith("data:")) {
      dataLines.push(buffer.slice(5).replace(/^ /, ""));
    }
    yield* flush();
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

import { describe, expect, it } from "vitest";
import { parseSSEStream } from "./parseSSEStream";

/** 把字串切成指定大小的位元組片段，模擬網路分段 */
function streamFrom(text: string, chunkSize = Infinity): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const out: string[] = [];
  for await (const d of parseSSEStream(stream, signal)) out.push(d);
  return out;
}

describe("parseSSEStream", () => {
  it("解析多個事件", async () => {
    expect(await collect(streamFrom('data: {"a":1}\n\ndata: {"b":2}\n\n'))).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it("一行被切在兩個 chunk 之間仍能正確組回", async () => {
    const text = 'data: {"type":"plan_created","n":12345}\n\n';
    expect(await collect(streamFrom(text, 3))).toEqual(['{"type":"plan_created","n":12345}']);
  });

  it("中文字的位元組被切開也不會變成亂碼", async () => {
    // 每個中文字 3 bytes，chunk 大小 1 會把每個字切成三段
    expect(await collect(streamFrom("data: 充電樁市場\n\n", 1))).toEqual(["充電樁市場"]);
  });

  it("忽略 heartbeat 註解與多餘空行", async () => {
    const text = ": heartbeat\n\n\n\ndata: x\n\n: heartbeat\n\n";
    expect(await collect(streamFrom(text))).toEqual(["x"]);
  });

  it("支援 CRLF 換行", async () => {
    expect(await collect(streamFrom("data: x\r\n\r\ndata: y\r\n\r\n"))).toEqual(["x", "y"]);
  });

  it("同一事件的多行 data 用換行串接", async () => {
    expect(await collect(streamFrom("data: line1\ndata: line2\n\n"))).toEqual(["line1\nline2"]);
  });

  it("串流結束時最後一個事件沒有空行結尾也不會遺失", async () => {
    expect(await collect(streamFrom("data: a\n\ndata: last"))).toEqual(["a", "last"]);
  });

  it("signal 已中止時不再產出事件", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await collect(streamFrom("data: a\n\n"), controller.signal)).toEqual([]);
  });
});

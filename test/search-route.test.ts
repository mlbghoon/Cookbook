import { describe, it, expect, afterEach, vi } from "vitest";
import { POST } from "@/app/api/search/route";

function req(body: unknown) {
  return new Request("http://localhost/api/search", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

// NDJSON 스트림을 읽어 이벤트 배열로
async function readEvents(res: Response): Promise<any[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// Gemini SSE 스트림 흉내 — fullText 를 조각내 data: 이벤트로 흘려보낸다
function sseBody(fullText: string, chunks = 2) {
  const enc = new TextEncoder();
  const size = Math.ceil(fullText.length / chunks);
  const pieces: string[] = [];
  for (let i = 0; i < fullText.length; i += size)
    pieces.push(fullText.slice(i, i + size));
  return new ReadableStream({
    start(c) {
      for (const p of pieces) {
        const evt = `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text: p }] } }],
        })}\n\n`;
        c.enqueue(enc.encode(evt));
      }
      c.close();
    },
  });
}

const origKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (origKey) process.env.GEMINI_API_KEY = origKey;
  else delete process.env.GEMINI_API_KEY;
  vi.restoreAllMocks();
});

describe("api/search (NDJSON 스트리밍)", () => {
  it("핵심#1: 키 없으면 샘플 레시피 이벤트 + done sample", async () => {
    delete process.env.GEMINI_API_KEY;
    const events = await readEvents(await POST(req({ query: "김치찌개" })));
    const recipes = events.filter((e) => e.type === "recipe");
    const done = events.find((e) => e.type === "done");
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes[0].source).toBe("sample");
    expect(recipes[0].recipe.title).toContain("김치");
    expect(done.source).toBe("sample");
  });

  it("빈 검색어는 recipe 이벤트 없이 done + 안내", async () => {
    delete process.env.GEMINI_API_KEY;
    const events = await readEvents(await POST(req({ query: "" })));
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(0);
    expect(events.at(-1).error).toBeTruthy();
  });

  it("키 있고 Gemini 스트림 정상이면 recipe source=gemini", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const full = '[{"title":"테스트요리","steps":["섞는다"],"source":"셰프"}]';
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, body: sseBody(full) }) as any;
    const events = await readEvents(await POST(req({ query: "아무거나" })));
    const recipes = events.filter((e) => e.type === "recipe");
    expect(recipes).toHaveLength(1);
    expect(recipes[0].source).toBe("gemini");
    expect(recipes[0].recipe.title).toBe("테스트요리");
    expect(events.at(-1)).toMatchObject({ type: "done", source: "gemini" });
  });

  it("빠른 AI가 비면 그라운딩으로 폴백 → source=grounded", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const empty = "죄송, JSON 없음"; // 파싱 결과 0 → 폴백 유발
    const full = '[{"title":"검증요리","steps":["끓인다"],"source":"셰프"}]';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, body: sseBody(empty) }) // 빠른 AI
      .mockResolvedValueOnce({ ok: true, status: 200, body: sseBody(full) }) as any; // 그라운딩
    const events = await readEvents(await POST(req({ query: "김치찌개" })));
    const recipes = events.filter((e) => e.type === "recipe");
    expect(recipes).toHaveLength(1);
    expect(recipes[0].source).toBe("grounded");
    expect(events.at(-1)).toMatchObject({ type: "done", source: "grounded" });
  });

  it("Gemini 실패면 샘플로 폴백(done sample)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } }) as any;
    const events = await readEvents(await POST(req({ query: "김치찌개" })));
    expect(events.filter((e) => e.type === "recipe").length).toBeGreaterThan(0);
    expect(events.at(-1).source).toBe("sample");
  });

  it("429면 retryAfter + 대기 안내(초기 검색은 샘플 폴백)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (k: string) => (k === "retry-after" ? "7" : null) },
    }) as any;
    const events = await readEvents(await POST(req({ query: "김치찌개" })));
    const done = events.at(-1);
    expect(done.retryAfter).toBe(7);
    expect(done.error).toContain("7초");
  });

  it("더보기(exclude) 중 오류는 '더 없음' 아님 — recipe 없이 안내", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } }) as any;
    const events = await readEvents(
      await POST(req({ query: "김치찌개", exclude: ["백종원 김치찌개"] }))
    );
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "done", source: "gemini" });
    expect(events.at(-1).error).toBeTruthy();
  });
});

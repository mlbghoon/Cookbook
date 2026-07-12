import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecipeSearch } from "@/lib/useRecipeSearch";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// NDJSON 스트림 응답 흉내 (delay 후 이벤트들을 흘려보냄)
function ndjson(events: unknown[], delayMs: number) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(c) {
      await sleep(delayMs);
      for (const e of events) c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      c.close();
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("useRecipeSearch 스트리밍 + 레이스 방지 (이슈 6A)", () => {
  it("핵심#3: 늦게 도착한 이전 검색은 무시(stale guard)", async () => {
    let call = 0;
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.mode === "resolve") {
        return { ok: true, json: async () => ({ imageUrl: null }) } as any;
      }
      const idx = call++;
      const recipe =
        idx === 0
          ? { id: "A", title: "느린-옛결과", ingredients: [], steps: ["a"] }
          : { id: "B", title: "빠른-새결과", ingredients: [], steps: ["b"] };
      const events = [
        { type: "recipe", recipe, source: "gemini" },
        { type: "done", source: "gemini" },
      ];
      return { ok: true, body: ndjson(events, idx === 0 ? 60 : 10) } as any;
    }) as any;

    const { result } = renderHook(() => useRecipeSearch());

    await act(async () => {
      result.current.search(); // req #0 (느림, A)
      result.current.search(); // req #1 (빠름, B)
      await sleep(140);
    });

    expect(result.current.results.map((r) => r.id)).toEqual(["B"]);
    expect(result.current.status).toBe("done");
    expect(result.current.source).toBe("gemini");
  });

  it("결과가 스트리밍되며 하나씩 쌓인다", async () => {
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.mode === "resolve")
        return { ok: true, json: async () => ({ imageUrl: null }) } as any;
      const events = [
        { type: "recipe", recipe: { id: "1", title: "하나", ingredients: [], steps: ["a"] }, source: "gemini" },
        { type: "recipe", recipe: { id: "2", title: "둘", ingredients: [], steps: ["b"] }, source: "gemini" },
        { type: "done", source: "gemini" },
      ];
      return { ok: true, body: ndjson(events, 5) } as any;
    }) as any;

    const { result } = renderHook(() => useRecipeSearch());
    await act(async () => {
      result.current.search();
      await sleep(60);
    });
    expect(result.current.results.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("429(retryAfter)면 쿨다운이 설정된다", async () => {
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.mode === "resolve")
        return { ok: true, json: async () => ({ imageUrl: null }) } as any;
      return {
        ok: true,
        body: ndjson(
          [
            { type: "recipe", recipe: { id: "s", title: "기본", ingredients: [], steps: ["x"] }, source: "sample" },
            { type: "done", source: "sample", error: "5초 후 다시", retryAfter: 5 },
          ],
          5
        ),
      } as any;
    }) as any;

    const { result } = renderHook(() => useRecipeSearch());
    await act(async () => {
      result.current.search();
      await sleep(40);
    });
    expect(result.current.cooldownSec).toBeGreaterThan(0);
    expect(result.current.source).toBe("sample");
  });

  it("더보기: 새 결과를 이어붙이고, 더 없으면 exhausted", async () => {
    let call = 0;
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.mode === "resolve")
        return { ok: true, json: async () => ({ imageUrl: null }) } as any;
      call++;
      const R = (id: string) => ({
        type: "recipe",
        recipe: { id, title: id, ingredients: [], steps: ["x"] },
        source: "gemini",
      });
      const done = { type: "done", source: "gemini" };
      if (call === 1) return { ok: true, body: ndjson([R("1"), R("2"), done], 5) } as any;
      if (call === 2) return { ok: true, body: ndjson([R("3"), done], 5) } as any;
      return { ok: true, body: ndjson([done], 5) } as any; // 더 없음
    }) as any;

    const { result } = renderHook(() => useRecipeSearch());
    await act(async () => {
      result.current.search();
      await sleep(40);
    });
    expect(result.current.results.map((r) => r.id)).toEqual(["1", "2"]);

    await act(async () => {
      result.current.loadMore();
      await sleep(40);
    });
    expect(result.current.results.map((r) => r.id)).toEqual(["1", "2", "3"]);

    await act(async () => {
      result.current.loadMore();
      await sleep(40);
    });
    expect(result.current.exhausted).toBe(true);
  });

  it("HTTP 오류면 empty가 아니라 error 상태", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, headers: { get: () => null } }) as any) as any;

    const { result } = renderHook(() => useRecipeSearch());
    await act(async () => {
      result.current.search();
      await sleep(40);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();
    expect(result.current.results).toEqual([]);
  });

  it("더보기 실패 시 기존 결과 유지 + error 메시지", async () => {
    let call = 0;
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.mode === "resolve")
        return { ok: true, json: async () => ({ imageUrl: null }) } as any;
      call++;
      if (call === 1) {
        return {
          ok: true,
          body: ndjson(
            [
              {
                type: "recipe",
                recipe: { id: "1", title: "하나", ingredients: [], steps: ["a"] },
                source: "gemini",
              },
              { type: "done", source: "gemini" },
            ],
            5
          ),
        } as any;
      }
      return { ok: false, status: 500, headers: { get: () => null } } as any;
    }) as any;

    const { result } = renderHook(() => useRecipeSearch());
    await act(async () => {
      result.current.search();
      await sleep(40);
    });
    expect(result.current.results.map((r) => r.id)).toEqual(["1"]);

    await act(async () => {
      result.current.loadMore();
      await sleep(40);
    });
    expect(result.current.results.map((r) => r.id)).toEqual(["1"]);
    expect(result.current.error).toBeTruthy();
  });

  it("재료 추가/삭제 (중복 무시)", () => {
    const { result } = renderHook(() => useRecipeSearch());
    act(() => {
      result.current.addIngredient("마늘");
      result.current.addIngredient("마늘");
      result.current.addIngredient("양파");
    });
    expect(result.current.ingredients).toEqual(["마늘", "양파"]);
    act(() => result.current.removeIngredient("마늘"));
    expect(result.current.ingredients).toEqual(["양파"]);
  });
});

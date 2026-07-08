import { NextRequest } from "next/server";
import { hasGeminiKey, streamRecipesWithGemini } from "@/lib/gemini.server";
import { matchSamples } from "@/lib/sampleRecipes";
import type { Recipe, RecipeSource } from "@/lib/types";

// 그라운딩 검색은 느릴 수 있어 서버리스 실행시간을 늘린다(Vercel).
export const maxDuration = 60;

// NDJSON 스트리밍 — 레시피가 준비되는 대로 한 줄씩 흘려보낸다.
//  {"type":"recipe","recipe":{...},"source":"gemini"|"grounded"|"sample"}
//  {"type":"done","source":...,"error"?:...,"retryAfter"?:sec}
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as {
    query?: unknown;
    ingredients?: unknown;
    exclude?: unknown;
  };
  const query = typeof b.query === "string" ? b.query : "";
  const ingredients = Array.isArray(b.ingredients)
    ? b.ingredients.filter((x): x is string => typeof x === "string")
    : [];
  const exclude = Array.isArray(b.exclude)
    ? b.exclude.filter((x): x is string => typeof x === "string")
    : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const emit = (recipes: Recipe[], source: RecipeSource) => {
        for (const r of recipes) send({ type: "recipe", recipe: r, source });
      };

      // 빈 입력
      if (!query.trim() && ingredients.length === 0) {
        send({ type: "done", source: "sample", error: "무엇을 만들고 싶은지 알려줘요." });
        controller.close();
        return;
      }

      // 키 없음 → 기본(샘플) 레시피
      if (!hasGeminiKey()) {
        emit(matchSamples(query, ingredients, exclude), "sample");
        send({ type: "done", source: "sample" });
        controller.close();
        return;
      }

      // 레이트리밋 → 쿨다운 안내 + 샘플 폴백(단, 더보기는 버튼 유지)
      const handleRateLimit = (waitSec: number) => {
        const msg = `AI 사용량이 잠깐 초과됐어요. ${waitSec}초 후 다시 시도해줘.`;
        if (exclude.length > 0) {
          send({ type: "done", source: "gemini", error: msg, retryAfter: waitSec });
        } else {
          emit(matchSamples(query, ingredients), "sample");
          send({
            type: "done",
            source: "sample",
            error: `${msg} 우선 기본 레시피를 보여줘요.`,
            retryAfter: waitSec,
          });
        }
        controller.close();
      };

      // ── 검증된 레시피: 그라운딩(구글 검색)으로만 (~15s) ──
      // 실제 출처가 있는 레시피만 신뢰 → 그라운딩 결과만 사용.
      let count = 0;
      const grounded = await streamRecipesWithGemini(
        query,
        ingredients,
        { exclude },
        (r) => {
          count++;
          send({ type: "recipe", recipe: r, source: "grounded" });
        },
        true
      );
      if (count > 0) {
        send({ type: "done", source: "grounded" });
        controller.close();
        return;
      }
      if (!grounded.ok && grounded.retryAfterSec !== undefined) {
        handleRateLimit(grounded.retryAfterSec);
        return;
      }

      // 검증된 결과 0 → 우리가 큐레이션한 기본(샘플) 레시피로 폴백
      if (exclude.length > 0) {
        // 더보기: 오류면 '더 없음' 아님(버튼 유지), 진짜 빈 경우만 종료
        send(
          !grounded.ok
            ? {
                type: "done",
                source: "grounded",
                error: "지금은 더 못 불러왔어요. 잠시 후 다시 눌러주세요.",
              }
            : { type: "done", source: "grounded" }
        );
      } else {
        emit(matchSamples(query, ingredients), "sample");
        send({
          type: "done",
          source: "sample",
          error: "검증된 레시피를 못 찾아서 비슷한 기본 레시피를 보여줘요.",
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

import "server-only";
// Gemini 네트워크 호출만 담당 (서버 전용). 순수 로직은 lib/prompt.ts.

import type { Recipe } from "./types";
import {
  assemblePrompt,
  completeJsonObjects,
  normalizeRecipe,
  type PromptOptions,
} from "./prompt";

const MODEL = "gemini-2.5-flash";
const STREAM_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent`;

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface StreamResult {
  ok: boolean; // false = 오류(타임아웃/429/전송실패)
  retryAfterSec?: number; // 429 일 때 재시도까지 대기 초
}

// 429 응답에서 재시도 대기시간 추출 (헤더 또는 RetryInfo)
async function parseRetryAfter(res: Response): Promise<number | undefined> {
  const h = res.headers.get("retry-after");
  if (h && !Number.isNaN(Number(h))) return Math.ceil(Number(h));
  try {
    const j = (await res.json()) as any;
    const details = j?.error?.details ?? [];
    for (const d of details) {
      if (typeof d?.retryDelay === "string") {
        const m = d.retryDelay.match(/([\d.]+)\s*s/);
        if (m) return Math.ceil(Number(m[1]));
      }
    }
  } catch {
    /* 무시 */
  }
  return undefined;
}

// Gemini 스트리밍 검색 — 완성된 레시피가 나올 때마다 onRecipe 로 흘려보낸다.
//  grounding=false → 빠름(~4s, 모델 지식). true → 구글 검색 그라운딩(~15s, 검증된 출처).
export async function streamRecipesWithGemini(
  query: string,
  ingredients: string[],
  opts: PromptOptions,
  onRecipe: (r: Recipe) => void,
  grounding = true
): Promise<StreamResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false };

  const prompt = assemblePrompt(query, ingredients, opts);

  let res: Response;
  try {
    // 키는 쿼리가 아니라 헤더로 — 프록시/CDN 액세스 로그 유출 방지
    res = await fetch(`${STREAM_ENDPOINT}?alt=sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(grounding ? { tools: [{ google_search: {} }] } : {}),
        // 사고 예산 0 — 응답 지연을 크게 줄인다(품질 유지)
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
      // 그라운딩은 느려서 여유, 빠른 모드는 짧게
      signal: AbortSignal.timeout(grounding ? 45000 : 20000),
    });
  } catch {
    return { ok: false }; // 타임아웃/네트워크
  }

  if (!res.ok || !res.body) {
    const retryAfterSec =
      res.status === 429 ? await parseRetryAfter(res) : undefined;
    return { ok: false, retryAfterSec };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuf = "";
  let full = "";
  let emitted = 0;

  const flush = () => {
    const objs = completeJsonObjects(full);
    for (let i = emitted; i < objs.length; i++) {
      try {
        const r = normalizeRecipe(JSON.parse(objs[i]));
        if (r) onRecipe(r);
      } catch {
        /* 개별 객체 파싱 실패 스킵 */
      }
    }
    emitted = objs.length;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = sseBuf.indexOf("\n")) >= 0) {
        const line = sseBuf.slice(0, nl).trim();
        sseBuf = sseBuf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as any;
          const parts = j?.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) if (p?.text) full += p.text;
          flush();
        } catch {
          /* 부분 SSE 라인 무시 */
        }
      }
    }
    flush();
  } catch {
    // 스트림 중단 — 이미 보낸 레시피는 유지, ok=true (부분 성공)
  }

  return { ok: true };
}

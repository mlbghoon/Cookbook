// 순수 로직 — 서버/클라 어디서나 import 가능, 네트워크·brower API 의존 없음.
// (Gemini/네이버 네트워크 호출은 *.server.ts 로 분리 — 이슈 8A)

import type { Ingredient, Recipe } from "./types";

// ─────────────────────────────────────────────────────────────
// recipeId — hash(title + "|" + source). source 없으면 title+summary 폴백.
// 진짜 중복만 dedup, 셰프별로는 분리 (이슈 3A).
// ─────────────────────────────────────────────────────────────
export function recipeId(title: string, source?: string, summary?: string): string {
  const key = `${(title || "").trim()}|${(source || summary || "").trim()}`;
  // FNV-1a 32-bit — 결정적, 충돌 낮음, 의존성 0
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ─────────────────────────────────────────────────────────────
// assemblePrompt — 검색어 앞뒤로 가드레일을 붙여 "검증된 맛있는 레시피만" 유도.
// ─────────────────────────────────────────────────────────────
export interface PromptOptions {
  count?: number; // 요청 레시피 수 (기본 3)
  exclude?: string[]; // 이미 본 레시피 제목 (더보기 시 제외)
}

export function assemblePrompt(
  query: string,
  ingredients: string[] = [],
  opts: PromptOptions = {}
): string {
  const cleanQuery = (query || "").trim();
  const cleanIngredients = ingredients.map((s) => s.trim()).filter(Boolean);
  const count = opts.count ?? 3;
  const exclude = (opts.exclude ?? []).map((s) => s.trim()).filter(Boolean);

  const rules = [
    "너는 검증된 레시피만 큐레이션하는 요리 전문가야.",
    "요리책, 유명 셰프(백종원, 이연복, 고든 램지 등), 신뢰도 높은 요리 사이트에",
    "실제로 실린, 검증된 맛있는 레시피만 추천해.",
    "지어내지 말고, 확실하지 않은 레시피는 제외해.",
  ].join(" ");

  const ingredientLine = cleanIngredients.length
    ? `\n\n집에 있는 재료(가능한 한 활용): ${cleanIngredients.join(", ")}`
    : "";

  const excludeLine = exclude.length
    ? `\n\n아래 레시피는 이미 봤으니 반드시 제외하고, 서로 다른 새로운 레시피를 추천해: ${exclude.join(
        ", "
      )}`
    : "";

  const format = [
    "\n\n다음 규칙을 반드시 지켜:",
    "- 오직 JSON 배열로만 답해. 코드펜스나 설명 문장은 넣지 마.",
    "- 각 항목 스키마: {\"title\": string, \"summary\": string, \"servings\": string,",
    '  "time": string, "difficulty": "쉬움|보통|어려움",',
    '  "ingredients": [{"name": string, "amount": string}],',
    '  "steps": [string], "tips": [string], "source": string, "sourceUrl": string}',
    "- source 에는 참고한 요리책 또는 셰프명을 명시해.",
    "- 참고한 웹페이지가 있으면 sourceUrl 에 그 URL 을 넣어.",
    `- ${count}개 이내의 레시피만.`,
  ].join("\n");

  return `${rules}\n\n요청: ${cleanQuery}${ingredientLine}${excludeLine}${format}`;
}

// ─────────────────────────────────────────────────────────────
// extractJson — 모델이 코드펜스/설명을 섞어 내도 JSON 배열을 방어적으로 추출.
// 실패 시 null.
// ─────────────────────────────────────────────────────────────
export function extractJson(text: string): unknown[] | null {
  if (!text) return null;

  // 1) ```json ... ``` 또는 ``` ... ``` 코드펜스 우선
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fence) candidates.push(fence[1]);

  // 2) 첫 '[' ~ 마지막 ']' 슬라이스
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  // 3) 원문 그대로
  candidates.push(text);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.trim());
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// completeJsonObjects — 스트리밍 중 누적 텍스트에서 "완성된" 최상위 객체들만 추출.
// 배열이 아직 안 닫혔어도, 닫힌 { ... } 는 하나씩 뽑아낸다(문자열/이스케이프 인지).
// ─────────────────────────────────────────────────────────────
export function completeJsonObjects(text: string): string[] {
  const start = text.indexOf("[");
  if (start === -1) return [];
  const objs: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        objs.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return objs;
}

// ─────────────────────────────────────────────────────────────
// 필드 강제 변환 헬퍼
// ─────────────────────────────────────────────────────────────
function toStr(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t || undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function toStepArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => toStr(x)).filter((s): s is string => !!s);
  }
  const s = toStr(v);
  if (!s) return [];
  // 문단/번호 매김을 줄 단위로 분해
  return s
    .split(/\r?\n|(?:\s*\d+[.)]\s*)/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toIngredients(v: unknown): Ingredient[] {
  if (!Array.isArray(v)) {
    // 문자열이면 콤마/줄바꿈 분해
    const s = toStr(v);
    if (!s) return [];
    return s
      .split(/\r?\n|,/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }
  const out: Ingredient[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) out.push({ name });
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = toStr(o.name) ?? toStr(o.ingredient) ?? toStr(o.item);
      const amount = toStr(o.amount) ?? toStr(o.quantity) ?? toStr(o.qty);
      if (name) out.push(amount ? { name, amount } : { name });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// normalizeRecipe — 불량 항목은 drop(null). title/steps 없으면 무효 (이슈 7A).
// ─────────────────────────────────────────────────────────────
export function normalizeRecipe(raw: unknown): Recipe | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const title = toStr(o.title) ?? toStr(o.name);
  if (!title) return null;

  const steps = toStepArray(o.steps ?? o.instructions ?? o.directions);
  if (steps.length === 0) return null;

  const source = toStr(o.source) ?? toStr(o.chef) ?? toStr(o.book);
  const summary = toStr(o.summary) ?? toStr(o.description);

  return {
    id: recipeId(title, source, summary),
    title,
    summary,
    servings: toStr(o.servings) ?? toStr(o.serving),
    time: toStr(o.time) ?? toStr(o.cookTime) ?? toStr(o.duration),
    difficulty: toStr(o.difficulty),
    ingredients: toIngredients(o.ingredients),
    steps,
    tips: Array.isArray(o.tips)
      ? o.tips.map((t) => toStr(t)).filter((s): s is string => !!s)
      : undefined,
    source,
    sourceUrl: toStr(o.sourceUrl) ?? toStr(o.url),
    // imageUrl 은 검색 단계에서 비움 — api/photo 가 채움
  };
}

export function normalizeRecipes(rawArray: unknown[]): Recipe[] {
  return rawArray
    .map((r) => normalizeRecipe(r))
    .filter((r): r is Recipe => r !== null);
}

// ─────────────────────────────────────────────────────────────
// sourceHost — 출처 URL 을 사람이 읽기 좋은 라벨로. 그라운딩 리다이렉트는 친절 라벨.
// 파싱 실패 시 null.
// ─────────────────────────────────────────────────────────────
export function sourceHost(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (
      u.hostname.includes("vertexaisearch") ||
      u.pathname.includes("grounding-api-redirect")
    ) {
      return "구글 검색 원문";
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 그라운딩 리다이렉트(opaque) URL 인지 — 그러면 원본 URL 을 그대로 노출하지 않는다.
export function isRedirectUrl(url?: string): boolean {
  return sourceHost(url) === "구글 검색 원문";
}

// ─────────────────────────────────────────────────────────────
// parseOgImage — HTML 에서 og:image / twitter:image 추출 (순수).
// 상대경로면 baseUrl 로 절대화. 실패 시 null.
// ─────────────────────────────────────────────────────────────
export function parseOgImage(html: string, baseUrl?: string): string | null {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const url = m[1].trim();
      if (!url) continue;
      try {
        return baseUrl ? new URL(url, baseUrl).toString() : url;
      } catch {
        return url;
      }
    }
  }
  return null;
}

// 지아의 쿡북 — 공용 타입

export interface Ingredient {
  name: string;
  amount?: string; // "500g", "2큰술" 등 계량
}

export interface Recipe {
  id: string; // recipeId(title, source) — 안정적 해시 (lib/prompt.ts)
  title: string;
  summary?: string; // 한 줄 소개
  servings?: string; // "2인분"
  time?: string; // "약 30분"
  difficulty?: string; // "쉬움" | "보통" | "어려움"
  ingredients: Ingredient[];
  steps: string[];
  tips?: string[];
  source?: string; // 요리책/셰프명
  sourceUrl?: string; // 그라운딩 출처 URL (og:image·근거용)
  imageUrl?: string; // 실제 사진 URL (api/photo 가 채움)
}

export interface SavedRecipe extends Recipe {
  savedAt: number;
  rating?: number; // 1~5 맛 평가
  note?: string; // 개인 메모
  // 이미지 blob 은 IndexedDB "images" 스토어에 recipe.id 로 별도 저장(오프라인용)
}

// 결과 출처: gemini(빠른 AI) · grounded(구글 검색 검증) · sample(내장 기본)
export type RecipeSource = "gemini" | "grounded" | "sample";

// NDJSON 스트림 이벤트 (api/search)
export type SearchEvent =
  | { type: "recipe"; recipe: Recipe; source: RecipeSource }
  | { type: "done"; source: RecipeSource; error?: string; retryAfter?: number };

// api/photo (resolve 모드) 응답
export interface PhotoResolveResponse {
  imageUrl: string | null;
}

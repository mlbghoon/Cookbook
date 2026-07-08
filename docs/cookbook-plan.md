# 지아의 쿡북 — 기획/설계 요약

> 실제 동작 기준은 [`../README.md`](../README.md). 이 문서는 **왜 이렇게 만들었나**를 남긴다.

## 문제

요리할 때마다 검색 엔진을 헤매고, 좋은 레시피를 찾아도 다음에 또 찾아야 한다. 링크만 저장하면
사이트가 바뀌거나 광고에 묻힌다. → **검증된 레시피만 골라, 사진과 함께 앱에 저장해 두고,
오프라인에서도 다시 보자.**

## 핵심 가치 3가지

1. **품질 필터** — 검색어 앞뒤에 프롬프트 가드레일(요리책·유명 셰프·신뢰 출처, 지어내기 금지)을
   붙여 검증된 레시피만 유도. 집 재료를 넣어 검색 가능.
2. **앱 안에서 완결** — 링크가 아니라 실제 사진 + 재료 + 조리 단계를 바로 표시.
3. **저장 = API 절약 + 오프라인** — 즐겨찾기하면 사진(blob)까지 기기에 저장 → 재검색·재호출 0.

## 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 플랫폼 | Next.js 14 App Router + TS, 폰 프레임 다크 모바일 웹앱, PWA, Vercel (Aremi와 동일) |
| AI | Google Gemini (`gemini-2.5-flash`) + 구글 검색 그라운딩 |
| 사진 | 그라운딩 출처 og:image 우선 → 네이버 이미지검색 폴백 (실제 사진만, AI 생성 X) |
| 저장/오프라인 | IndexedDB(레시피 + 사진 blob) + 서비스 워커(앱 셸 캐시) |
| 사용자 | 지아님 단독, 로그인 없음 |

## 설계 리뷰에서 정한 것 (plan-review 반영)

- **커스텀 훅 분리** — `useSavedRecipes`(IndexedDB + objectURL 수명주기 중앙관리),
  `useRecipeSearch`(AbortController + stale 가드). page.tsx는 조립만.
- **SSR 안전** — IndexedDB/`createObjectURL`/`navigator`는 `useEffect` 안에서만, lazy-init.
- **레시피 id** — `hash(title + "|" + source)` → 셰프별 분리, 진짜 중복만 dedup.
- **사진 오프라인 보장** — 서버 프록시(`api/photo` download 모드)로 바이트를 받아 CORS 없이
  blob 저장. resolve 결과는 서버 LRU 캐시.
- **서버/클라 경계** — 순수 로직 `lib/prompt.ts`(테스트 대상) vs `*.server.ts`(`import "server-only"`).
- **Gemini 출력 검증** — 그라운딩은 responseSchema 병행 불가 → 프롬프트로 JSON 유도 후
  `extractJson` + `normalizeRecipe`(불량 drop, 필드 강제 변환).
- **UI 상태 매트릭스** — 검색 idle/로딩/에러/빈, 사진 스켈레톤/폴백, 저장 빈, 오프라인 배너.
- **서비스 워커** — 버전닝, 앱 셸 precache, `/api/*` network-only(비캐시).
- **테스트** — Vitest + RTL + fake-indexeddb. 순수 lib·훅·라우트·컴포넌트 + 핵심 4개
  (키없음→샘플, blob 저장/열람, stale 무시, normalize drop).

## 정직한 한계

- 사진은 "그 레시피 글의 실제 사진"이거나 폴백 시 "그 요리 종류의 실제 사진". 큐레이션된
  레시피 DB 없이 무료 범위에선 여기까지. 상세에 출처 항상 표기.
- 저장은 기기 로컬(IndexedDB) — 기기 바꾸면 백업 내보내기/가져오기로 이전(추후 UI).

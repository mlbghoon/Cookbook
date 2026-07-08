# 지아의 쿡북 🍽️

검증된 **맛있는 레시피만** AI로 골라, **사진 + 전체 레시피를 앱 안에서 바로** 보여주는
개인용 레시피 앱. 마음에 든 레시피는 **즐겨찾기 + 맛 평가**로 저장해, 다음엔 검색 없이
**오프라인에서도** 다시 본다. 저장분은 API를 다시 호출하지 않아 사용량도 아낀다.

> 지아님 혼자 쓰는 앱 — 로그인·서버 DB 없음. 모든 데이터는 기기(IndexedDB)에 저장.

## 지금 되는 것

- **검증된 레시피 검색** — 검색어 앞뒤에 프롬프트 가드레일을 붙여, 요리책·유명 셰프·신뢰도
  높은 출처의 레시피만 나오도록 유도한다. (Gemini + 구글 검색 그라운딩)
- **집 재료 검색** — 집에 있는 재료를 칩으로 추가하면 그 재료를 활용한 레시피를 찾는다.
- **앱 안에서 완결** — 링크가 아니라 실제 요리 사진 + 재료 + 조리 단계가 앱에 바로 표시된다.
- **즐겨찾기 + 맛 평가 + 메모** — 별점(1~5)과 메모를 남기고, 저장 탭에서 다시 본다.
- **오프라인** — 저장한 레시피는 사진(blob)까지 기기에 저장돼, 비행기 모드에서도 열린다.
- **키 없이도 동작** — API 키가 없으면 내장 샘플 레시피로 검색까지 된다. 키를 넣으면
  진짜 AI 검색 + 실제 사진으로 자동 전환된다.

## 화면

- **검색 탭** — 검색바 + 집 재료 칩 + 결과 카드(사진·제목·출처·시간).
- **저장 탭** — 즐겨찾기한 레시피(오프라인).
- 카드를 누르면 **상세**(히어로 사진·재료·조리순서·팁·출처·별점·메모)가 오버레이로 열린다.
- 전체가 **폰 프레임** 안의 다크(웜 앰버) 테마 모바일 앱 형태. PWA로 홈화면 설치 가능.

## 실행

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 유닛/컴포넌트 테스트 (Vitest)
npm run build          # 프로덕션 빌드
```

키가 없어도 동작한다 (검색은 내장 샘플 레시피). 실제 AI 검색·사진은 아래 키가 필요하다 →
[`docs/GET-KEYS.md`](docs/GET-KEYS.md).

## 필요한 키 (`.env.local`)

| 키                                  | 용도                                   | 공개/비밀        |
| ----------------------------------- | -------------------------------------- | ---------------- |
| `GEMINI_API_KEY`                    | 레시피 검색 (Gemini + 구글 검색 그라운딩) | 비밀 (서버 전용) |
| `NAVER_CLIENT_ID` / `_SECRET` (선택) | 사진 폴백(출처에 og:image 없을 때)      | 비밀 (서버 전용) |

`.env.local.example` 을 복사해서 채운다: `cp .env.local.example .env.local`

## 사진에 대한 정직한 설명

"실제 요리 사진만" 보여준다. 방식은 **그라운딩 출처 페이지의 대표 이미지(og:image) 우선 →
없으면 네이버 이미지 검색 폴백**. 그래서 사진은 "AI가 참고한 그 레시피 글의 실제 사진"이거나,
폴백이면 "그 요리 종류의 실제 사진"이다. 무료·비큐레이션 범위에서의 최선이며, 상세 화면 하단에
**출처를 항상 표기**한다. (AI 생성 이미지는 쓰지 않는다.)

## 기술

Next.js 14 (App Router, TypeScript) · 서버 API 라우트로 비밀 키 은닉(키 없으면 200 + 샘플 폴백) ·
IndexedDB 저장(레시피 + 사진 blob) · 서비스 워커로 앱 셸 오프라인 캐시(`/api/*`는 비캐시) ·
Vitest + RTL 테스트 · Vercel 배포.

## 구조

```
app/
  layout.tsx        # 폰 프레임 + PWA 메타 + 서비스워커 등록
  page.tsx          # 검색/저장 탭, 상태
  globals.css       # 다크 + 웜(앰버) 테마
  manifest.ts       # PWA
  api/
    search/route.ts # Gemini 그라운딩 (키 없으면 샘플)
    photo/route.ts  # og:image 해석 → 네이버 폴백 / 이미지 바이트 프록시
components/          # BottomNav · SearchBar · IngredientChips · RecipeCard · RecipeDetail · RatingStars · SavedList · RegisterSW
lib/
  types.ts          # 공용 타입
  prompt.ts         # 순수: 프롬프트 가드레일 · JSON 추출 · normalizeRecipe · og:image 파서 · recipeId
  gemini.server.ts  # 서버 전용: Gemini 호출
  photo.server.ts   # 서버 전용: og:image·네이버·바이트 프록시 (+ LRU 캐시)
  store.ts          # IndexedDB (레시피 + 사진 blob)
  sampleRecipes.ts  # 키 없이 동작하는 샘플
  useSavedRecipes.ts / useRecipeSearch.ts  # 커스텀 훅
public/  sw.js · icon.svg
test/    Vitest (순수 lib · 훅 · 라우트 · 컴포넌트)
docs/    cookbook-plan.md · GET-KEYS.md
```

## 로드맵(추후)

- 저장 사진 리사이즈(IndexedDB 용량 최적화)
- 백업 내보내기/가져오기 UI (`recipeStore.exportAll/importAll` 이미 구현)
- 클라우드 동기화(여러 기기) — 현재는 기기 로컬 전용

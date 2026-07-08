# 지아의 쿡북 — 진행 상황 & 다음 할 일

> 나중에 이어서 작업하려고 남기는 핸드오프 노트. 마지막 업데이트: 2026-07-08
> 코드 구조/기획은 [`README.md`](README.md) · [`docs/`](docs/) 참고.

## 지금 상태 (한 줄)

MVP 동작함. `main` 커밋 `3f46b3b` 로 GitHub(`mlbghoon/Cookbook`)에 푸시 완료. **61개 테스트 통과, 빌드 클린.** 아직 배포는 안 함.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000  (키 없으면 샘플 레시피로 동작)
npm test         # Vitest 61개
npm run build
```

- `.env.local` 에 `GEMINI_API_KEY` 넣으면 진짜 AI 검색으로 자동 전환 (로컬엔 이미 넣어둠, git 에는 안 올라감).
- 발급법: [`docs/GET-KEYS.md`](docs/GET-KEYS.md)

## 완료된 것 ✅

- **검색 (티어드, NDJSON 스트리밍)**: 빠른 Gemini(🤖 AI, ~4s) → 실패/빈결과면 그라운딩(🔍 구글 검색, ~15s) → 최후 내장 샘플(📚). 결과마다 **출처 배지** 표시.
- **프롬프트 가드레일**: 요리책·유명 셰프 등 검증된 출처 유도. **집 재료 칩** 검색.
- **레시피 상세**: 사진 + 재료 + 조리순서 + 팁 + 출처 (링크 아님, 앱 안에서 완결).
- **즐겨찾기 + 별점(1~5) + 메모** → IndexedDB 저장.
- **오프라인**: 저장 레시피는 사진(blob)까지 기기에 저장, 서비스워커 앱셸 캐시로 오프라인 열람.
- **실제 사진**: 출처 페이지 og:image → 네이버 이미지검색 폴백, 서버 프록시로 CORS 없이 blob 저장.
- **레이트리밋 UX**: 429 시 retry-after 파싱 → "N초 후" 카운트다운 + 검색/더보기 비활성.
- **+ 더보기**: 이미 본 레시피 제외하고 이어서 로드.
- **보안/품질 (코드리뷰 반영)**: SSRF 방어(사설·메타데이터 IP 차단), 응답 크기 상한(HTML 1MB/이미지 5MB), 스트림 부분결과 보존, `React.memo` 안정화.
- **PWA**: 홈화면 설치, 폰프레임 다크(앰버) 테마.

## 알아둘 것 / 함정 ⚠️

- **그라운딩은 ~15초** 걸림. 검색(웹 그라운딩)을 앞에서 다 하고 한번에 뱉어서 **스트리밍으로도 단축 불가**. 그래서 "빠른 AI 먼저 → 그라운딩 폴백" 구조로 감. (thinking budget=0 로 이미 단축한 상태)
- **빠른 모드는 사진이 부실할 수 있음**: sourceUrl 이 없으면 og:image 못 뽑음 → 네이버 키 없으면 플레이스홀더. 사진 품질 원하면 **네이버 검색 API 키 추가 권장**.
- **무료 등급 rate limit** (~분당 10회): 빠르게 연속 검색하면 429. 앱이 쿨다운으로 안내하지만, 많이 쓰려면 AI Studio 결제 등록.
- **서비스워커는 프로덕션 빌드에서만** 등록됨 (`npm run build && npm start`). `npm run dev` 에선 오프라인 캐시 안 됨.
- 저장은 **기기 로컬(IndexedDB)** 전용. 기기 바꾸면 데이터 안 넘어감.

## 다음 할 일 📌

우선순위 순:

- [ ] **Vercel 배포** — 프로젝트 Settings → Environment Variables 에 `GEMINI_API_KEY`(+선택 `NAVER_*`) 등록. `docs/` 에 배포 가이드 아직 없음 → 필요시 추가.
- [ ] **⭐ 내일 할 것 — 네이버 키로 사진 강화** → 상세 실행 계획: [`docs/next-naver-photos.md`](docs/next-naver-photos.md) (키 발급 + `dishKeyword` 검색어 정제 + 테스트).
- [ ] **저장 사진 리사이즈** — 원본 blob 그대로 저장 중. 많아지면 IndexedDB 용량 부담 → 저장 전 축소.
- [ ] **백업 내보내기/가져오기 UI** — `recipeStore.exportAll()/importAll()` 는 이미 구현됨, 화면만 없음. 기기 이전용.
- [ ] **page.tsx 통합 테스트** — 소스 배지 전환, 오프라인 배너, 탭 전환 등 (현재 훅/라우트/컴포넌트 단위 테스트만).
- [ ] (선택) **"정확한 출처로 검증" 버튼** — 빠른 결과에서 수동으로 그라운딩 재검색 트리거.
- [ ] (미래) **클라우드 동기화** — 여러 기기 쓰려면 백엔드(Supabase 등). 현재 단일 사용자·로컬 전용 설계.

## 코드 지도

```
app/api/search  → 티어드 검색(스트리밍). app/api/photo → og:image 해석 + 이미지 프록시
lib/prompt.ts   → 순수 로직(프롬프트·JSON파싱·normalize·recipeId·og파서) ★테스트 핵심
lib/*.server.ts → Gemini/사진 네트워크(서버 전용). lib/store.ts → IndexedDB
lib/use*.ts     → useRecipeSearch(스트림·레이스·쿨다운) / useSavedRecipes(objectURL 수명주기)
components/      → UI. public/sw.js → 오프라인 서비스워커
```

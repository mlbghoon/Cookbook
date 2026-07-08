# 다음 작업: 네이버 키로 사진 강화

> 작성 2026-07-08 · 내일(2026-07-09) 이어서. 관련: [`GET-KEYS.md`](GET-KEYS.md) · 코드 `lib/photo.server.ts`

## 목표 (왜)

레시피 사진이 안 뜨고 🍽️ 플레이스홀더로 남는 경우를 줄인다.

지금 사진 확보 순서 (`resolvePhoto()` in `lib/photo.server.ts`):
```
1) sourceUrl 있으면 → 그 페이지 og:image 스크랩
2) 실패하면        → 네이버 이미지검색 (★ 키 없으면 스킵됨 → 지금 이 상태)
3) 둘 다 안 되면   → null → 🍽️
```
검증 전용(그라운딩)으로 바꿔서 이제 대부분 실제 sourceUrl이 있지만, **출처 페이지에 og:image가 없거나** 스크랩 실패하면 여전히 빈다. 네이버 폴백(2번)을 켜면 요리명으로 실제 사진을 채울 수 있다. `naverImage()` 코드는 **이미 구현돼 있고 키만 없다.**

## 0단계 — 키 발급 (사람이 해야 함, 5분)

1. https://developers.naver.com/apps/#/register (네이버 로그인)
2. 애플리케이션 등록 → **사용 API = 검색** 선택
3. 발급된 **Client ID / Client Secret** 을 `.env.local` 에:
   ```
   NAVER_CLIENT_ID=...
   NAVER_CLIENT_SECRET=...
   ```
4. `npm run dev` 재시작 → 이것만으로 폴백이 켜진다 (아래 코드 개선 전에도 동작 확인 가능).

## 1단계 — 검색어 정제 (핵심 개선)

**문제**: 지금 네이버 검색어가 `title + " 요리"` 인데, 제목에 셰프/수식어가 붙어 매칭을 방해한다.
- "백종원 스타일 맑은 소고기 감자국" → 검색어로 부적합
- 원하는 검색어: **"소고기 감자국"** (핵심 요리명)

**할 일**: `lib/prompt.ts` 에 순수 함수 `dishKeyword(title)` 추가 (테스트 대상).
- 앞쪽 셰프/수식어 제거: `"○○ 스타일"`, `"○○의"`, `"○○표"`, 유명 셰프명(백종원·이연복·정호영·고든 램지 등), 채널명
- 괄호 내용 제거: `"(업그레이드 버전)"`, `"(간단)"` 등
- 여러 단어면 뒤쪽(핵심 요리명)을 우선
- 결과가 비면 원본 title 그대로 반환(안전)
- 예: `dishKeyword("백종원 스타일 맑은 소고기 감자국")` → `"맑은 소고기 감자국"` 또는 `"소고기 감자국"`

그다음 `lib/photo.server.ts` `naverImage()` 에서 `title` 대신 `dishKeyword(title)` 사용.

## 2단계 — 테스트

- `test/prompt.test.ts` 에 `dishKeyword` 케이스 추가 (셰프 접두어 제거, 괄호 제거, 폴백).
- (선택) `naverImage` 는 `fetch` 목으로 첫 결과 link 반환 확인 — 네이버 응답 형태 `{ items: [{ link }] }`.

## 3단계 — 검증 (수동)

1. `.env.local` 에 네이버 키 넣고 `npm run dev`.
2. 검색 → 그라운딩 결과 중 사진 없던 카드가 채워지는지 확인.
3. 네트워크 탭에서 `/api/photo` (resolve) 응답 `imageUrl` 이 네이버 이미지 URL 인지 확인.
4. 즐겨찾기 → 저장 목록/오프라인에서도 그 사진 뜨는지 (blob 저장 경로).

## 4단계 — 배포 반영 (나중에)

Vercel 배포한다면 Settings → Environment Variables 에 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 도 등록.

## 만질 파일

- `lib/prompt.ts` — `dishKeyword()` 신규 (순수·테스트)
- `lib/photo.server.ts` — `naverImage()` 가 `dishKeyword(title)` 사용
- `test/prompt.test.ts` — `dishKeyword` 테스트
- `.env.local` — 네이버 키 (git 제외됨)

## 참고 / 주의

- **네이버 무료 한도**: 검색 API 하루 25,000회 수준 — 개인 사용엔 충분.
- **정직한 한계**: 네이버 사진은 "그 요리 종류"의 실제 사진이지 "이 레시피의 결과물"은 아님. (그래도 실제 사진이라 요구사항 "실제 사진만" 충족)
- resolve 결과는 서버 LRU 캐시라 같은 요리 재검색 시 재호출 안 함.
- og:image(1번)가 우선이므로, 출처에 대표사진 있으면 네이버까지 안 감 (좋음).

## 예상 작업량

키 발급 5분 + 코드(`dishKeyword` + 배선 + 테스트) 30~45분.

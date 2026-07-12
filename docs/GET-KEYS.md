# 키 발급 방법

키가 **없어도** 앱은 내장 샘플 레시피로 동작한다. 진짜 AI 검색과 실제 사진을 쓰려면 아래를 채운다.
`.env.local.example` 을 복사한 뒤 값만 넣으면 된다:

```bash
cp .env.local.example .env.local
```

---

## 1) `GEMINI_API_KEY` — 레시피 검색 (필수, 진짜 검색을 원할 때)

Google Gemini. 무료 한도가 넉넉하고(무료 등급 분당 요청 제한 내) 한국어에 강하다.

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. **Create API key** 클릭 → 생성된 키 복사
3. `.env.local` 에 붙여넣기:
   ```
   GEMINI_API_KEY=여기에_키
   ```
4. 개발 서버 재시작 (`npm run dev`)

> 이 앱은 `gemini-2.5-flash` 모델을 **구글 검색 그라운딩**과 함께 호출해, 요리책·유명 셰프 등
> 검증된 출처의 레시피를 유도한다. 키는 **서버 라우트에서만** 사용되어 브라우저에 노출되지 않는다.

---

## 2) `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 사진 폴백 (선택)

레시피 사진은 먼저 **그라운딩 출처 페이지의 대표 이미지(og:image)** 를 가져온다.
그 페이지에 대표 이미지가 없을 때만, 요리명으로 **네이버 이미지 검색** 폴백을 쓴다.
→ 없어도 앱은 동작한다(사진 자리는 플레이스홀더로 대체).

1. https://developers.naver.com/apps/#/register 접속 (네이버 로그인)
2. 애플리케이션 등록 → **사용 API** 에서 **검색** 선택
3. 발급된 **Client ID / Client Secret** 을 `.env.local` 에:
   ```
   NAVER_CLIENT_ID=여기에_아이디
   NAVER_CLIENT_SECRET=여기에_시크릿
   ```
4. 개발 서버 재시작

---

## 보안 메모

- 모든 키는 **서버 전용**(`process.env`)이라 클라이언트 번들에 포함되지 않는다.
  (예외: `NEXT_PUBLIC_COOKBOOK_API_SECRET` — API 보호용으로만, Gemini/네이버 키와 다름)
- `.env.local` 은 `.gitignore` 에 포함되어 커밋되지 않는다.
- Vercel 배포 시에는 프로젝트 **Settings → Environment Variables** 에 동일 키를 등록한다.

---

## 3) `COOKBOOK_API_SECRET` (+ `NEXT_PUBLIC_…`) — API 보호 (공개 배포 시 권장)

`/api/search`, `/api/photo` 가 인터넷에 열려 Gemini 할당량을 소모하지 않게 막는다.

1. 랜덤 문자열 생성 (예: `openssl rand -hex 24`)
2. `.env.local` (및 Vercel env)에 **같은 값**으로 둘 다 넣는다:
   ```
   COOKBOOK_API_SECRET=생성한값
   NEXT_PUBLIC_COOKBOOK_API_SECRET=생성한값
   ```
3. 서버가 `x-cookbook-secret` 헤더를 검사하고, 앱이 같은 값을 보낸다.
4. 둘 다 비우면 보호가 꺼진다(로컬·테스트 기본).
5. Vercel에 `NEXT_PUBLIC_*` 를 추가/변경한 뒤에는 **재배포**가 필요하다(빌드 시 인라인).

추가로 IP당 분당 레이트리밋도 적용된다(검색 10회 · 사진 60회). 비밀과 별개로 항상 동작한다.

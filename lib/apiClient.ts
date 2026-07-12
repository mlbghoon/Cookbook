// 클라이언트 → /api/* 공통 헤더.
// COOKBOOK_API_SECRET 이 서버에 있으면, 동일 값의 NEXT_PUBLIC_COOKBOOK_API_SECRET 을 보내야 한다.

export function apiHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.NEXT_PUBLIC_COOKBOOK_API_SECRET?.trim();
  if (secret) headers["x-cookbook-secret"] = secret;
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

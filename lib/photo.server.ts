import "server-only";
// 사진 확보 (서버 전용): 그라운딩 출처 og:image → 네이버 이미지검색 폴백 → 바이트 프록시.

import { parseOgImage } from "./prompt";

const MAX_HTML_BYTES = 1_000_000; // 1MB
const MAX_IMAGE_BYTES = 5_000_000; // 5MB

// SSRF 방어 — 클라이언트가 준 URL 을 서버가 fetch 하므로 내부/사설 주소를 차단.
export function isSafePublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal"))
    return false;
  // 루프백/사설/링크로컬 IP 리터럴 차단
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === "::1" || h.startsWith("fc00:") || h.startsWith("fe80:")) return false;
  if (h === "[::1]" || h.startsWith("[fc00:") || h.startsWith("[fe80:")) return false;
  return true;
}

// 응답 본문을 최대 maxBytes 까지만 읽는다(초과 시 null). 메모리/비용 방어.
async function readCapped(
  res: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  const cl = res.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) return null;
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* 무시 */
      }
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// ── 간단 LRU (resolve 결과 캐시 — 재검색 시 재해석 방지, 이슈 13A) ──
const LRU_MAX = 200;
const lru = new Map<string, string | null>();

function lruGet(key: string): string | null | undefined {
  if (!lru.has(key)) return undefined;
  const v = lru.get(key)!;
  lru.delete(key);
  lru.set(key, v); // 최근 사용으로 이동
  return v;
}

function lruSet(key: string, val: string | null) {
  if (lru.has(key)) lru.delete(key);
  lru.set(key, val);
  if (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value;
    if (oldest !== undefined) lru.delete(oldest);
  }
}

// 출처 페이지에서 og:image 추출
async function ogImageFrom(sourceUrl: string): Promise<string | null> {
  if (!isSafePublicHttpUrl(sourceUrl)) return null; // SSRF 방어
  try {
    const res = await fetch(sourceUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JiaCookbook/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) return null;
    const bytes = await readCapped(res, MAX_HTML_BYTES);
    if (!bytes) return null;
    const html = new TextDecoder().decode(bytes);
    return parseOgImage(html, res.url || sourceUrl);
  } catch {
    return null;
  }
}

// 네이버 이미지 검색 (키 있을 때만)
async function naverImage(title: string): Promise<string | null> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const url = `https://openapi.naver.com/v1/search/image?display=1&query=${encodeURIComponent(
      title + " 요리"
    )}`;
    const res = await fetch(url, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { link?: string }[] };
    return data.items?.[0]?.link ?? null;
  } catch {
    return null;
  }
}

// resolve 모드: 실제 사진 URL 결정
export async function resolvePhoto(
  title: string,
  sourceUrl?: string
): Promise<string | null> {
  const key = `${title}|${sourceUrl ?? ""}`;
  const cached = lruGet(key);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  if (sourceUrl) result = await ogImageFrom(sourceUrl);
  if (!result) result = await naverImage(title);

  lruSet(key, result);
  return result;
}

export interface DownloadedImage {
  buffer: ArrayBuffer;
  contentType: string;
}

// download 모드: 이미지 바이트를 서버가 받아 동일출처로 프록시 (CORS 회피, 오프라인 blob 보장)
export async function downloadImage(
  url: string
): Promise<DownloadedImage | null> {
  if (!isSafePublicHttpUrl(url)) return null; // SSRF 방어
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JiaCookbook/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const bytes = await readCapped(res, MAX_IMAGE_BYTES); // 크기 상한
    if (!bytes) return null;
    return { buffer: bytes.buffer as ArrayBuffer, contentType };
  } catch {
    return null;
  }
}

export function _clearPhotoCacheForTest() {
  lru.clear();
}

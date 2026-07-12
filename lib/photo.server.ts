import "server-only";
// 사진 확보 (서버 전용): 그라운딩 출처 og:image → 네이버 이미지검색 폴백 → 바이트 프록시.

import { parseOgImage } from "./prompt";

const MAX_HTML_BYTES = 1_000_000; // 1MB
const MAX_IMAGE_BYTES = 5_000_000; // 5MB
const MAX_REDIRECTS = 5;

// SSRF 방어 — 클라이언트가 준 URL 을 서버가 fetch 하므로 내부/사설 주소를 차단.
export function isSafePublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  // userinfo 는 파서/프록시 혼동에 쓰일 수 있어 거부
  if (u.username || u.password) return false;

  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".intranet") ||
    h === "metadata.google.internal"
  ) {
    return false;
  }

  // IPv6 (브라켓 제거된 형태)
  if (h.includes(":")) {
    if (h === "::1" || h === "0:0:0:0:0:0:0:1") return false;
    if (h.startsWith("fc") || h.startsWith("fd")) return false; // ULA
    if (h.startsWith("fe80")) return false; // link-local
    // IPv4-mapped IPv6 → 매핑된 IPv4 검사
    const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mapped) {
      const ip = parseIpv4(mapped[1]);
      return ip ? !isPrivateIpv4(ip) : false;
    }
    if (h.startsWith("::ffff:")) return false;
    return true; // 기타 글로벌 IPv6 는 허용(리다이렉트마다 재검사)
  }

  const ip = parseIpv4(h);
  if (ip) return !isPrivateIpv4(ip);

  return true;
}

/** dotted-quad 또는 단일 10진(예: 2130706433 = 127.0.0.1) → [a,b,c,d] */
function parseIpv4(host: string): [number, number, number, number] | null {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

function isPrivateIpv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  void c;
  return false;
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

/**
 * 리다이렉트를 수동으로 따라가며 매 hop URL 을 SSRF 검사한다.
 * (redirect:"follow" 는 최종이 사설 IP 여도 막기 어렵다)
 */
async function safeFetch(
  url: string,
  init: Omit<RequestInit, "redirect"> = {}
): Promise<Response | null> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isSafePublicHttpUrl(current)) return null;
    let res: Response;
    try {
      res = await fetch(current, { ...init, redirect: "manual" });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    return res;
  }
  return null;
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
    const res = await safeFetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JiaCookbook/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res || !res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) return null;
    const bytes = await readCapped(res, MAX_HTML_BYTES);
    if (!bytes) return null;
    const html = new TextDecoder().decode(bytes);
    const img = parseOgImage(html, sourceUrl);
    // og:image 자체도 공개 URL 이어야 함 (내부 메타데이터 URL 차단)
    if (img && isSafePublicHttpUrl(img)) return img;
    return null;
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
    const link = data.items?.[0]?.link ?? null;
    if (link && isSafePublicHttpUrl(link)) return link;
    return null;
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
    const res = await safeFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JiaCookbook/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res || !res.ok) return null;
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

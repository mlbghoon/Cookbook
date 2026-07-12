import "server-only";
import { NextResponse } from "next/server";

const SECRET_HEADER = "x-cookbook-secret";

// 프로세스 메모리 레이트리밋 — 서버리스 인스턴스별로 동작(완전 공유는 아님).
// 공개 배포에서 캐주얼한 남용을 줄이는 1차 방어.
type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function expectedSecret(): string | undefined {
  const s = process.env.COOKBOOK_API_SECRET?.trim();
  return s || undefined;
}

/** 비밀이 설정돼 있으면 헤더가 일치해야 통과. 미설정(로컬/테스트)이면 통과. */
export function checkApiSecret(req: Request): NextResponse | null {
  const expected = expectedSecret();
  if (!expected) return null;
  const got = req.headers.get(SECRET_HEADER)?.trim();
  if (got && got === expected) return null;
  return NextResponse.json(
    { error: "권한이 없어요. 앱에서 다시 열어 주세요." },
    { status: 401 }
  );
}

/**
 * 슬라이딩 윈도우 레이트리밋.
 * @returns 429 Response 또는 null(통과)
 */
export function checkRateLimit(
  req: Request,
  opts: { name: string; limit: number; windowMs?: number }
): NextResponse | null {
  const windowMs = opts.windowMs ?? 60_000;
  const key = `${opts.name}:${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [] };
    buckets.set(key, b);
  }
  b.timestamps = b.timestamps.filter((t) => now - t < windowMs);
  if (b.timestamps.length >= opts.limit) {
    const oldest = b.timestamps[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return NextResponse.json(
      { error: `요청이 많아요. ${retryAfter}초 후 다시 시도해 주세요.` },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }
  b.timestamps.push(now);
  return null;
}

/** 비밀 검사 → 레이트리밋 순서로 적용. 첫 거절 응답을 반환. */
export function guardApi(
  req: Request,
  rate: { name: string; limit: number; windowMs?: number }
): NextResponse | null {
  return checkApiSecret(req) ?? checkRateLimit(req, rate);
}

/** 테스트용 — 레이트리밋 버킷 비우기 */
export function _clearRateLimitForTest() {
  buckets.clear();
}

export const API_SECRET_HEADER = SECRET_HEADER;

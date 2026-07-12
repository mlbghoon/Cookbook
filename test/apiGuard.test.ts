import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as photoPOST } from "@/app/api/photo/route";
import {
  API_SECRET_HEADER,
  checkApiSecret,
  checkRateLimit,
  guardApi,
  _clearRateLimitForTest,
} from "@/lib/apiGuard.server";

function req(url: string, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
}

const origSecret = process.env.COOKBOOK_API_SECRET;
beforeEach(() => {
  _clearRateLimitForTest();
  delete process.env.COOKBOOK_API_SECRET;
});
afterEach(() => {
  if (origSecret) process.env.COOKBOOK_API_SECRET = origSecret;
  else delete process.env.COOKBOOK_API_SECRET;
  vi.restoreAllMocks();
});

describe("apiGuard", () => {
  it("비밀 미설정이면 통과", () => {
    expect(checkApiSecret(req("http://localhost/api/search"))).toBeNull();
  });

  it("비밀 설정 + 헤더 불일치면 401", () => {
    process.env.COOKBOOK_API_SECRET = "abc";
    const res = checkApiSecret(req("http://localhost/api/search"));
    expect(res?.status).toBe(401);
  });

  it("비밀 설정 + 올바른 헤더면 통과", () => {
    process.env.COOKBOOK_API_SECRET = "abc";
    expect(
      checkApiSecret(
        req("http://localhost/api/search", { [API_SECRET_HEADER]: "abc" })
      )
    ).toBeNull();
  });

  it("레이트리밋 초과 시 429 + Retry-After", () => {
    const r = req("http://localhost/api/search", {
      "x-forwarded-for": "1.2.3.4",
    });
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(r, { name: "t", limit: 3 })).toBeNull();
    }
    const blocked = checkRateLimit(r, { name: "t", limit: 3 });
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
  });

  it("photo 라우트도 비밀 없으면 401", async () => {
    process.env.COOKBOOK_API_SECRET = "abc";
    const res = await photoPOST(
      new Request("http://localhost/api/photo", {
        method: "POST",
        body: JSON.stringify({ mode: "resolve", title: "x" }),
      }) as any
    );
    expect(res.status).toBe(401);
  });

  it("guardApi 는 비밀을 레이트리밋보다 먼저 검사", () => {
    process.env.COOKBOOK_API_SECRET = "abc";
    const res = guardApi(req("http://localhost/api/search"), {
      name: "g",
      limit: 1,
    });
    expect(res?.status).toBe(401);
  });
});

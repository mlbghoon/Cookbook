import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/photo/route";
import {
  _clearPhotoCacheForTest,
  isSafePublicHttpUrl,
} from "@/lib/photo.server";
import { _clearRateLimitForTest } from "@/lib/apiGuard.server";

function req(body: unknown) {
  return new Request("http://localhost/api/photo", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

const origSecret = process.env.COOKBOOK_API_SECRET;
beforeEach(() => {
  _clearPhotoCacheForTest();
  _clearRateLimitForTest();
  delete process.env.COOKBOOK_API_SECRET;
});
afterEach(() => {
  if (origSecret) process.env.COOKBOOK_API_SECRET = origSecret;
  else delete process.env.COOKBOOK_API_SECRET;
  vi.restoreAllMocks();
});

describe("isSafePublicHttpUrl (SSRF 방어 — #1)", () => {
  it("공개 https/http 는 허용", () => {
    expect(isSafePublicHttpUrl("https://site.com/a.jpg")).toBe(true);
    expect(isSafePublicHttpUrl("http://example.org/x")).toBe(true);
  });
  it("localhost/사설/링크로컬/메타데이터는 차단", () => {
    expect(isSafePublicHttpUrl("http://localhost/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://127.0.0.1/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://10.0.0.5/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://192.168.1.1/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://172.16.0.1/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isSafePublicHttpUrl("http://foo.local/x")).toBe(false);
    expect(isSafePublicHttpUrl("http://2130706433/")).toBe(false); // 10진 127.0.0.1
    expect(isSafePublicHttpUrl("http://0.0.0.0/")).toBe(false);
    expect(isSafePublicHttpUrl("http://[::1]/")).toBe(false);
    expect(isSafePublicHttpUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
  });
  it("http/https 가 아닌 스킴·userinfo 는 차단", () => {
    expect(isSafePublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicHttpUrl("ftp://host/x")).toBe(false);
    expect(isSafePublicHttpUrl("not a url")).toBe(false);
    expect(isSafePublicHttpUrl("https://user:pass@site.com/x")).toBe(false);
  });
});

describe("api/photo", () => {
  it("resolve: 출처 페이지 og:image 추출", async () => {
    const html = `<meta property="og:image" content="https://site.com/a.jpg">`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://site.com/r",
      headers: { get: (k: string) => (k === "content-type" ? "text/html" : null) },
      arrayBuffer: async () => bytes(html),
    }) as any;
    const res = await POST(
      req({ mode: "resolve", title: "김치찌개", sourceUrl: "https://site.com/r" })
    );
    expect((await res.json()).imageUrl).toBe("https://site.com/a.jpg");
  });

  it("resolve: og:image 가 내부 주소면 null (SSRF)", async () => {
    const html = `<meta property="og:image" content="http://169.254.169.254/latest">`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === "content-type" ? "text/html" : null) },
      arrayBuffer: async () => bytes(html),
    }) as any;
    const res = await POST(
      req({ mode: "resolve", title: "x", sourceUrl: "https://site.com/r" })
    );
    expect((await res.json()).imageUrl).toBeNull();
  });

  it("resolve: 리다이렉트가 사설 IP 로 가면 fetch 중단", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: {
        get: (k: string) =>
          k === "location" ? "http://127.0.0.1/secret" : null,
      },
    }) as any;
    const res = await POST(
      req({ mode: "resolve", title: "x", sourceUrl: "https://site.com/r" })
    );
    expect((await res.json()).imageUrl).toBeNull();
    // 첫 hop 만 호출되고, 사설 location 으로는 이어가지 않음
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("resolve: 내부 주소 sourceUrl 은 fetch 안 하고 null (SSRF 차단)", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    const res = await POST(
      req({
        mode: "resolve",
        title: "x",
        sourceUrl: "http://169.254.169.254/latest/meta-data",
      })
    );
    expect((await res.json()).imageUrl).toBeNull();
    expect(spy).not.toHaveBeenCalled(); // 서버가 내부 주소를 부르지 않음
  });

  it("resolve: 출처 없고 네이버 키 없으면 null", async () => {
    const res = await POST(req({ mode: "resolve", title: "없는요리" }));
    expect((await res.json()).imageUrl).toBeNull();
  });

  it("download: 이미지 바이트를 동일출처로 스트림", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k === "content-type" ? "image/png" : null),
      },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }) as any;
    const res = await POST(req({ mode: "download", url: "https://x.com/a.png" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("download: 내부 주소는 fetch 없이 404 (SSRF 차단)", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    const res = await POST(req({ mode: "download", url: "http://127.0.0.1/x" }));
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("download: 이미지가 아니면 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as any;
    const res = await POST(req({ mode: "download", url: "https://x.com/notimg" }));
    expect(res.status).toBe(404);
  });
});

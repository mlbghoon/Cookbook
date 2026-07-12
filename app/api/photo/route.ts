import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard.server";
import { resolvePhoto, downloadImage } from "@/lib/photo.server";
import type { PhotoResolveResponse } from "@/lib/types";

// 두 모드:
//  resolve  { mode:"resolve", title, sourceUrl? } → { imageUrl: string|null }
//  download { mode:"download", url }              → 이미지 바이트 스트림(동일출처)
export async function POST(req: NextRequest) {
  // 사진 프록시/스크랩 남용 완화
  const blocked = guardApi(req, { name: "photo", limit: 60 });
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as {
    mode?: unknown;
    title?: unknown;
    sourceUrl?: unknown;
    url?: unknown;
  };

  if (b.mode === "download") {
    const url = typeof b.url === "string" ? b.url : "";
    if (!url) return NextResponse.json({ error: "url 없음" }, { status: 400 });
    const img = await downloadImage(url);
    if (!img) return NextResponse.json({ error: "이미지 실패" }, { status: 404 });
    return new NextResponse(img.buffer, {
      status: 200,
      headers: {
        "Content-Type": img.contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 기본: resolve 모드
  const title = typeof b.title === "string" ? b.title.slice(0, 200) : "";
  const sourceUrl = typeof b.sourceUrl === "string" ? b.sourceUrl : undefined;
  if (!title.trim()) {
    return NextResponse.json({ imageUrl: null } satisfies PhotoResolveResponse);
  }
  const imageUrl = await resolvePhoto(title, sourceUrl);
  return NextResponse.json({ imageUrl } satisfies PhotoResolveResponse);
}

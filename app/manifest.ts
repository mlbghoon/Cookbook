import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "지아의 쿡북",
    short_name: "쿡북",
    description: "검증된 맛있는 레시피만 골라 사진과 함께 — 즐겨찾기는 오프라인에서도.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14100c",
    theme_color: "#e8873b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

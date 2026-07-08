import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "지아의 쿡북",
  description: "검증된 맛있는 레시피만 골라 사진과 함께 — 즐겨찾기는 오프라인에서도.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "지아의 쿡북", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 핀치 줌은 열어둔다 (접근성 WCAG 1.4.4)
  themeColor: "#e8873b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="device">{children}</div>
        <RegisterSW />
        <Analytics />
      </body>
    </html>
  );
}

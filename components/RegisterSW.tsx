"use client";
// 서비스 워커 등록 — 클라이언트·프로덕션에서만 (이슈 2A).
import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패해도 앱은 동작 */
    });
  }, []);
  return null;
}

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 각 테스트 후 DOM 정리 + IndexedDB 초기화
afterEach(() => {
  cleanup();
  // fake-indexeddb 는 테스트 간 상태를 유지하므로, store 테스트에서
  // 필요 시 indexedDB.deleteDatabase("cookbook") 로 개별 초기화한다.
});

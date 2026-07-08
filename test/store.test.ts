// @vitest-environment node
// jsdom 은 fake-indexeddb 를 거친 Blob 의 메서드를 잃는다 → node 환경에서 실행
// (store.ts 의 blob 로직은 표준이라 실제 브라우저에서도 동작).
import { describe, it, expect, beforeEach } from "vitest";
import { recipeStore, _resetDbForTest } from "@/lib/store";
import type { Recipe } from "@/lib/types";

const sample: Recipe = {
  id: "abc123",
  title: "김치찌개",
  ingredients: [{ name: "김치", amount: "1/4포기" }],
  steps: ["끓인다"],
  source: "백종원",
};

beforeEach(async () => {
  _resetDbForTest();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("cookbook");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe("recipeStore", () => {
  it("저장 후 list 로 조회", async () => {
    await recipeStore.save({ ...sample, savedAt: Date.now() });
    const list = await recipeStore.list();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("김치찌개");
  });

  it("핵심#2: 이미지 blob 저장 → getImageBlob 이 blob 반환 (오프라인)", async () => {
    const blob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    await recipeStore.save({ ...sample, savedAt: Date.now() }, { imageBlob: blob });
    const got = await recipeStore.getImageBlob(sample.id);
    expect(got).not.toBeNull();
    expect(got?.type).toBe("image/jpeg");
    // 바이트가 온전히 보존되었는지 (오프라인 렌더 가능)
    expect(await got!.text()).toBe("fake-image-bytes");
  });

  it("has / remove 동작", async () => {
    await recipeStore.save({ ...sample, savedAt: Date.now() });
    expect(await recipeStore.has(sample.id)).toBe(true);
    await recipeStore.remove(sample.id);
    expect(await recipeStore.has(sample.id)).toBe(false);
    expect(await recipeStore.getImageBlob(sample.id)).toBeNull();
  });

  it("setImage: 저장 후 사진을 나중에 붙인다(백그라운드 확보)", async () => {
    await recipeStore.save({ ...sample, savedAt: Date.now() });
    expect(await recipeStore.getImageBlob(sample.id)).toBeNull();
    const blob = new Blob(["img"], { type: "image/webp" });
    await recipeStore.setImage(sample.id, "https://x/y.webp", blob);
    expect((await recipeStore.getImageBlob(sample.id))?.type).toBe("image/webp");
    expect((await recipeStore.get(sample.id))?.imageUrl).toBe("https://x/y.webp");
  });

  it("setRating / setNote 반영", async () => {
    await recipeStore.save({ ...sample, savedAt: Date.now() });
    await recipeStore.setRating(sample.id, 4);
    await recipeStore.setNote(sample.id, "맛있음");
    const rec = await recipeStore.get(sample.id);
    expect(rec?.rating).toBe(4);
    expect(rec?.note).toBe("맛있음");
  });

  it("list 는 최신 저장 순", async () => {
    await recipeStore.save({ ...sample, id: "a", savedAt: 100 });
    await recipeStore.save({ ...sample, id: "b", savedAt: 200 });
    const list = await recipeStore.list();
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("exportAll 은 이미지 dataUrl 포함", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    await recipeStore.save({ ...sample, savedAt: Date.now() }, { imageBlob: blob });
    const exported = await recipeStore.exportAll();
    expect(exported).toHaveLength(1);
    expect(exported[0].imageDataUrl).toMatch(/^data:image\/png/);
  });
});

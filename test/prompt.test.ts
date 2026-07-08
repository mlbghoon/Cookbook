import { describe, it, expect } from "vitest";
import {
  recipeId,
  assemblePrompt,
  extractJson,
  completeJsonObjects,
  normalizeRecipe,
  normalizeRecipes,
  parseOgImage,
} from "@/lib/prompt";

describe("recipeId", () => {
  it("동일 title+source 는 같은 id (재검색 dedup)", () => {
    expect(recipeId("김치찌개", "백종원")).toBe(recipeId("김치찌개", "백종원"));
  });
  it("같은 title 이라도 source 다르면 다른 id (셰프별 분리 — 이슈 3A)", () => {
    expect(recipeId("김치찌개", "백종원")).not.toBe(
      recipeId("김치찌개", "이연복")
    );
  });
  it("source 없으면 summary 로 폴백", () => {
    expect(recipeId("김치찌개", undefined, "매운맛")).toBe(
      recipeId("김치찌개", undefined, "매운맛")
    );
  });
});

describe("assemblePrompt", () => {
  it("검색어와 재료가 프롬프트에 포함된다", () => {
    const p = assemblePrompt("파스타", ["마늘", "올리브유"]);
    expect(p).toContain("파스타");
    expect(p).toContain("마늘");
    expect(p).toContain("올리브유");
  });
  it("가드레일(검증된 레시피) 문구가 항상 들어간다", () => {
    expect(assemblePrompt("김치찌개")).toContain("검증된");
    expect(assemblePrompt("김치찌개")).toContain("JSON");
  });
  it("재료가 없으면 재료 줄을 넣지 않는다", () => {
    expect(assemblePrompt("김치찌개")).not.toContain("집에 있는 재료");
  });
  it("exclude 를 주면 제외 지시가 들어간다 (더보기)", () => {
    const p = assemblePrompt("김치찌개", [], { exclude: ["백종원 김치찌개"] });
    expect(p).toContain("제외");
    expect(p).toContain("백종원 김치찌개");
  });
  it("count 로 개수 지시를 바꾼다", () => {
    expect(assemblePrompt("김치찌개", [], { count: 5 })).toContain("5개 이내");
    expect(assemblePrompt("김치찌개")).toContain("3개 이내"); // 기본 3
  });
});

describe("extractJson", () => {
  it("코드펜스로 감싼 JSON 추출", () => {
    const text = '설명\n```json\n[{"a":1}]\n```\n끝';
    expect(extractJson(text)).toEqual([{ a: 1 }]);
  });
  it("설명 문장 사이의 배열 추출", () => {
    const text = '여기 레시피예요: [{"title":"x"}] 맛있게 드세요';
    expect(extractJson(text)).toEqual([{ title: "x" }]);
  });
  it("단일 객체는 배열로 감싼다", () => {
    expect(extractJson('{"title":"x"}')).toEqual([{ title: "x" }]);
  });
  it("JSON 이 없으면 null", () => {
    expect(extractJson("죄송해요 못 찾았어요")).toBeNull();
  });
});

describe("completeJsonObjects (스트리밍)", () => {
  it("배열이 아직 안 닫혔어도 완성된 객체만 뽑는다", () => {
    const partial = '[{"title":"A","steps":["x"]},{"title":"B"';
    const objs = completeJsonObjects(partial);
    expect(objs).toHaveLength(1);
    expect(JSON.parse(objs[0])).toEqual({ title: "A", steps: ["x"] });
  });
  it("완성된 객체가 늘어나면 그만큼 반환", () => {
    const full = '[{"title":"A"},{"title":"B"}]';
    expect(completeJsonObjects(full)).toHaveLength(2);
  });
  it("문자열 안의 중괄호는 무시", () => {
    const s = '[{"title":"a{b}c","steps":["}"]}]';
    expect(completeJsonObjects(s)).toHaveLength(1);
  });
  it("배열 시작 전이면 빈 배열", () => {
    expect(completeJsonObjects("설명만 있고 아직")).toEqual([]);
  });
});

describe("normalizeRecipe (이슈 7A)", () => {
  it("title 없으면 drop", () => {
    expect(normalizeRecipe({ steps: ["a"] })).toBeNull();
  });
  it("steps 없으면 drop", () => {
    expect(normalizeRecipe({ title: "x" })).toBeNull();
  });
  it("steps 가 문단 문자열이면 배열로 강제 변환", () => {
    const r = normalizeRecipe({ title: "x", steps: "1. 볶는다\n2. 끓인다" });
    expect(r?.steps).toEqual(["볶는다", "끓인다"]);
  });
  it("ingredients 문자열 배열을 {name} 으로 변환", () => {
    const r = normalizeRecipe({
      title: "x",
      steps: ["a"],
      ingredients: ["소금 약간", "설탕 1큰술"],
    });
    expect(r?.ingredients).toEqual([
      { name: "소금 약간" },
      { name: "설탕 1큰술" },
    ]);
  });
  it("ingredients {ingredient, quantity} 별칭도 흡수", () => {
    const r = normalizeRecipe({
      title: "x",
      steps: ["a"],
      ingredients: [{ ingredient: "마늘", quantity: "5쪽" }],
    });
    expect(r?.ingredients).toEqual([{ name: "마늘", amount: "5쪽" }]);
  });
  it("정상 레시피에 안정적 id 부여", () => {
    const r = normalizeRecipe({ title: "김치찌개", steps: ["a"], source: "백종원" });
    expect(r?.id).toBe(recipeId("김치찌개", "백종원"));
  });
});

describe("normalizeRecipes", () => {
  it("불량 항목만 걸러내고 정상은 유지", () => {
    const out = normalizeRecipes([
      { title: "ok", steps: ["a"] },
      { title: "", steps: ["a"] }, // drop
      { nope: true }, // drop
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("ok");
  });
});

describe("parseOgImage", () => {
  it("og:image content 추출", () => {
    const html = `<meta property="og:image" content="https://x.com/a.jpg">`;
    expect(parseOgImage(html)).toBe("https://x.com/a.jpg");
  });
  it("twitter:image 폴백", () => {
    const html = `<meta name="twitter:image" content="https://x.com/b.jpg">`;
    expect(parseOgImage(html)).toBe("https://x.com/b.jpg");
  });
  it("상대경로는 baseUrl 로 절대화", () => {
    const html = `<meta property="og:image" content="/img/a.jpg">`;
    expect(parseOgImage(html, "https://site.com/recipe")).toBe(
      "https://site.com/img/a.jpg"
    );
  });
  it("없으면 null", () => {
    expect(parseOgImage("<html></html>")).toBeNull();
  });
});

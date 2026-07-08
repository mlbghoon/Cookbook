import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeDetail from "@/components/RecipeDetail";
import type { Recipe } from "@/lib/types";

const recipe: Recipe = {
  id: "x",
  title: "김치찌개",
  summary: "진한 국물",
  ingredients: [{ name: "김치", amount: "1/4포기" }],
  steps: ["재료를 볶는다", "물을 붓고 끓인다"],
  tips: ["설탕 한 꼬집"],
  source: "백종원",
};

const noop = () => {};

describe("RecipeDetail", () => {
  it("제목·재료·조리순서·팁을 렌더", () => {
    render(
      <RecipeDetail
        recipe={recipe}
        saved={false}
        onClose={noop}
        onToggleFav={noop}
        onRate={noop}
        onNote={noop}
      />
    );
    expect(screen.getByText("김치찌개")).toBeInTheDocument();
    expect(screen.getByText("김치")).toBeInTheDocument();
    expect(screen.getByText("1/4포기")).toBeInTheDocument();
    expect(screen.getByText("물을 붓고 끓인다")).toBeInTheDocument();
    expect(screen.getByText("설탕 한 꼬집")).toBeInTheDocument();
    expect(screen.getByText(/백종원/)).toBeInTheDocument();
  });

  it("저장 안 된 상태면 별점/메모 숨김", () => {
    render(
      <RecipeDetail
        recipe={recipe}
        saved={false}
        onClose={noop}
        onToggleFav={noop}
        onRate={noop}
        onNote={noop}
      />
    );
    expect(screen.queryByPlaceholderText(/메모/)).toBeNull();
  });

  it("저장된 상태면 별점 + 메모 표시", () => {
    render(
      <RecipeDetail
        recipe={recipe}
        saved
        rating={4}
        note=""
        onClose={noop}
        onToggleFav={noop}
        onRate={noop}
        onNote={noop}
      />
    );
    expect(screen.getByLabelText("맛 평가")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/메모/)).toBeInTheDocument();
  });

  it("즐겨찾기 버튼 클릭 시 onToggleFav", async () => {
    const onToggleFav = vi.fn();
    render(
      <RecipeDetail
        recipe={recipe}
        saved={false}
        onClose={noop}
        onToggleFav={onToggleFav}
        onRate={noop}
        onNote={noop}
      />
    );
    screen.getByText(/즐겨찾기 저장/).click();
    expect(onToggleFav).toHaveBeenCalledWith(recipe);
  });
});

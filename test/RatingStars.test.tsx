import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RatingStars from "@/components/RatingStars";

describe("RatingStars", () => {
  it("별 클릭 시 해당 점수로 onChange", async () => {
    const onChange = vi.fn();
    render(<RatingStars value={0} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("3점"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("현재 점수의 별을 다시 클릭하면 0 (해제)", async () => {
    const onChange = vi.fn();
    render(<RatingStars value={3} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("3점"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("readOnly 면 클릭 비활성", async () => {
    const onChange = vi.fn();
    render(<RatingStars value={2} onChange={onChange} readOnly />);
    await userEvent.click(screen.getByLabelText("3점"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

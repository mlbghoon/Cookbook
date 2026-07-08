"use client";

export default function RatingStars({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="stars" role="radiogroup" aria-label="맛 평가">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "on" : ""}
          aria-label={`${n}점`}
          aria-checked={n === value}
          role="radio"
          disabled={readOnly}
          onClick={() => onChange?.(n === value ? 0 : n)}
        >
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

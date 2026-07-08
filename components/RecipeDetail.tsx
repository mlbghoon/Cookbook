"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Recipe } from "@/lib/types";
import { sourceHost, isRedirectUrl } from "@/lib/prompt";
import RatingStars from "./RatingStars";

interface Props {
  recipe: Recipe;
  imageUrl?: string | null;
  saved: boolean;
  rating?: number;
  note?: string;
  onClose: () => void;
  onToggleFav: (recipe: Recipe) => void;
  onRate: (id: string, n: number) => void;
  onNote: (id: string, note: string) => void;
}

export default function RecipeDetail({
  recipe,
  imageUrl,
  saved,
  rating = 0,
  note = "",
  onClose,
  onToggleFav,
  onRate,
  onNote,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note);

  useEffect(() => setMounted(true), []);
  useEffect(() => setNoteDraft(note), [note, recipe.id]);

  // ESC 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const img = imageUrl ?? recipe.imageUrl;

  const body = (
    <div className="detail" role="dialog" aria-label={recipe.title}>
      <div className="detail-hero">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={recipe.title} />
        ) : (
          <div className="ph" aria-hidden>
            🍽️
          </div>
        )}
        <button className="detail-back" onClick={onClose} aria-label="뒤로">
          ←
        </button>
      </div>

      <div className="detail-body">
        <h2 className="detail-title">{recipe.title}</h2>
        {recipe.summary && <p className="detail-summary">{recipe.summary}</p>}

        <div className="detail-meta">
          {recipe.time && <span className="pill">⏱ {recipe.time}</span>}
          {recipe.servings && <span className="pill">🍚 {recipe.servings}</span>}
          {recipe.difficulty && (
            <span className="pill">🔥 {recipe.difficulty}</span>
          )}
        </div>

        {recipe.ingredients.length > 0 && (
          <>
            <h3 className="section-h">재료</h3>
            <ul className="ing-list">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>
                  <span>{ing.name}</span>
                  {ing.amount && <span className="amt">{ing.amount}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="section-h">조리 순서</h3>
        <ul className="step-list">
          {recipe.steps.map((step, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ul>

        {recipe.tips && recipe.tips.length > 0 && (
          <>
            <h3 className="section-h">팁</h3>
            <ul className="tip-list">
              {recipe.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </>
        )}

        {(recipe.source || recipe.sourceUrl) && (
          <div className="detail-footnote">
            <div className="fn-title">📖 이 레시피의 출처</div>
            {recipe.source && <div className="fn-source">{recipe.source}</div>}
            {recipe.sourceUrl ? (
              <>
                <a
                  className="fn-link"
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {isRedirectUrl(recipe.sourceUrl)
                    ? "구글 검색 원문 보기 ↗"
                    : `${sourceHost(recipe.sourceUrl)} 에서 원문 보기 ↗`}
                </a>
                {!isRedirectUrl(recipe.sourceUrl) && (
                  <div className="fn-url">{recipe.sourceUrl}</div>
                )}
              </>
            ) : (
              <div className="fn-note">
                AI가 추천한 레시피예요 (직접 출처 링크는 없어요).
              </div>
            )}
          </div>
        )}
      </div>

      <div className="detail-actions">
        <button
          className={saved ? "btn btn-ghost" : "btn"}
          onClick={() => onToggleFav(recipe)}
        >
          {saved ? "⭐ 저장됨 · 해제" : "☆ 즐겨찾기 저장"}
        </button>

        {saved && (
          <>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>맛 평가</span>
              <RatingStars value={rating} onChange={(n) => onRate(recipe.id, n)} />
            </div>
            <textarea
              className="note-input"
              placeholder="메모 (예: 다음엔 덜 맵게)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                if (noteDraft !== note) onNote(recipe.id, noteDraft);
              }}
            />
          </>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  const target = document.querySelector(".device");
  return target ? createPortal(body, target) : body;
}

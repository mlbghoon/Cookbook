"use client";
import { memo } from "react";
import type { Recipe } from "@/lib/types";

interface Props {
  recipe: Recipe;
  imageUrl?: string | null; // 저장 목록은 objectURL 을 넘긴다(이슈 13A: 재요청 없이 재사용)
  saved: boolean;
  onOpen: (recipe: Recipe) => void;
  onToggleFav: (recipe: Recipe) => void;
}

function RecipeCardBase({ recipe, imageUrl, saved, onOpen, onToggleFav }: Props) {
  const img = imageUrl ?? recipe.imageUrl;
  return (
    <div className="card" onClick={() => onOpen(recipe)}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="card-thumb" src={img} alt={recipe.title} loading="lazy" />
      ) : (
        <div className="card-ph" aria-hidden>
          🍽️
        </div>
      )}
      <div className="card-body">
        <p className="card-title">{recipe.title}</p>
        <div className="card-meta">
          {recipe.time && <span>⏱ {recipe.time}</span>}
          {recipe.difficulty && <span>🔥 {recipe.difficulty}</span>}
          {recipe.servings && <span>🍚 {recipe.servings}</span>}
        </div>
        {recipe.source && <div className="card-src">📖 {recipe.source}</div>}
      </div>
      <button
        className="card-fav"
        aria-label={saved ? "즐겨찾기 해제" : "즐겨찾기"}
        aria-pressed={saved}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(recipe);
        }}
      >
        {saved ? "⭐" : "☆"}
      </button>
    </div>
  );
}

export default memo(RecipeCardBase);

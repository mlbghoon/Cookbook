"use client";
import { useEffect, useState } from "react";
import RecipeCard from "./RecipeCard";
import type { Recipe, SavedRecipe } from "@/lib/types";

interface Props {
  saved: SavedRecipe[];
  imageURLOf: (id: string) => Promise<string | null>;
  onOpen: (recipe: Recipe) => void;
  onToggleFav: (recipe: Recipe) => void;
}

export default function SavedList({
  saved,
  imageURLOf,
  onOpen,
  onToggleFav,
}: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // 저장 blob → objectURL (훅이 수명주기 관리). 목록 변할 때 재해석.
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        saved.map(async (r) => [r.id, await imageURLOf(r.id)] as const)
      );
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const [id, url] of entries) if (url) map[id] = url;
      setUrls(map);
    })();
    return () => {
      alive = false;
    };
  }, [saved, imageURLOf]);

  if (saved.length === 0) {
    return (
      <div className="empty">
        <div className="big">⭐</div>
        즐겨찾기가 아직 텅 비었어요.
        <br />
        마음에 드는 레시피에 ⭐ 콕 찍어두면 여기 모여요.
      </div>
    );
  }

  return (
    <>
      {saved.map((r) => (
        <RecipeCard
          key={r.id}
          recipe={r}
          imageUrl={urls[r.id]}
          saved
          onOpen={onOpen}
          onToggleFav={onToggleFav}
        />
      ))}
    </>
  );
}

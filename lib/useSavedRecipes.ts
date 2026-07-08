"use client";
// 저장 레시피 상태 + objectURL 수명주기 중앙 관리 (이슈 14A).
// IndexedDB 접근은 마운트 후에만 (이슈 2A).

import { useCallback, useEffect, useRef, useState } from "react";
import { recipeStore } from "./store";
import type { Recipe, SavedRecipe } from "./types";

export interface SaveInput {
  rating?: number;
  note?: string;
}

export function useSavedRecipes() {
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [mounted, setMounted] = useState(false);
  const urlMap = useRef<Map<string, string>>(new Map()); // id → objectURL

  const refresh = useCallback(async () => {
    try {
      setSaved(await recipeStore.list());
    } catch {
      /* IndexedDB 사용 불가 — 빈 목록 유지 */
    }
  }, []);

  // 최초 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await recipeStore.list();
        if (alive) setSaved(list);
      } catch {
        /* 무시 */
      }
      if (alive) setMounted(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 언마운트 시 모든 objectURL 회수 (누수 방지)
  useEffect(() => {
    const map = urlMap.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const save = useCallback(
    async (recipe: Recipe, input: SaveInput = {}) => {
      // 사진 blob 확보: imageUrl 을 서버 프록시(download)로 받아 CORS 없이 저장
      let imageBlob: Blob | null = null;
      if (recipe.imageUrl) {
        try {
          const res = await fetch("/api/photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "download", url: recipe.imageUrl }),
          });
          if (res.ok) imageBlob = await res.blob();
        } catch {
          /* 사진 없이 저장 */
        }
      }
      await recipeStore.save(
        { ...recipe, savedAt: Date.now(), ...input },
        { rating: input.rating, note: input.note, imageBlob }
      );
      // 사진이 바뀌었을 수 있으니 캐시된 objectURL 회수
      const stale = urlMap.current.get(recipe.id);
      if (stale) {
        URL.revokeObjectURL(stale);
        urlMap.current.delete(recipe.id);
      }
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await recipeStore.remove(id);
      const url = urlMap.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        urlMap.current.delete(id);
      }
      await refresh();
    },
    [refresh]
  );

  const setRating = useCallback(
    async (id: string, rating: number) => {
      await recipeStore.setRating(id, rating);
      await refresh();
    },
    [refresh]
  );

  const setNote = useCallback(
    async (id: string, note: string) => {
      await recipeStore.setNote(id, note);
      await refresh();
    },
    [refresh]
  );

  const isSaved = useCallback(
    (id: string) => saved.some((r) => r.id === id),
    [saved]
  );

  // 저장된 사진 blob → objectURL (캐시). 컴포넌트는 직접 createObjectURL 하지 않는다.
  const imageURLOf = useCallback(async (id: string): Promise<string | null> => {
    const existing = urlMap.current.get(id);
    if (existing) return existing;
    const blob = await recipeStore.getImageBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlMap.current.set(id, url);
    return url;
  }, []);

  return {
    saved,
    mounted,
    save,
    remove,
    setRating,
    setNote,
    isSaved,
    imageURLOf,
    refresh,
  };
}

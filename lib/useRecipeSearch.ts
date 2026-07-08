"use client";
// 레시피 검색 상태. NDJSON 스트리밍 소비(결과가 오는 대로 표시),
// 레이스 방지(AbortController + stale 가드), 출처(source) 추적,
// 레이트리밋 쿨다운(재시도 대기).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe, RecipeSource, SearchEvent } from "./types";

export type SearchStatus = "idle" | "loading" | "done" | "empty" | "error";
export type Source = RecipeSource;

interface StreamMeta {
  source: Source | null;
  error: string | null;
  retryAfter?: number;
}

export function useRecipeSearch() {
  const [query, setQuery] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [results, setResults] = useState<Recipe[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSec, setCooldownSec] = useState(0);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<Recipe[]>([]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // 쿨다운 카운트다운
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownSec(0);
      return;
    }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSec(rem);
      if (rem === 0) setCooldownUntil(0);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const startCooldown = useCallback((sec: number) => {
    if (sec > 0) setCooldownUntil(Date.now() + sec * 1000);
  }, []);

  const addIngredient = useCallback((raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setIngredients((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }, []);

  const removeIngredient = useCallback((v: string) => {
    setIngredients((prev) => prev.filter((x) => x !== v));
  }, []);

  // 레시피별 사진을 배치로 해석해 채운다(이미 있으면 스킵).
  const resolvePhotos = useCallback((recipes: Recipe[], myId: number) => {
    recipes.forEach(async (r) => {
      if (r.imageUrl) return;
      try {
        const res = await fetch("/api/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "resolve",
            title: r.title,
            sourceUrl: r.sourceUrl,
          }),
        });
        const data = (await res.json()) as { imageUrl?: string | null };
        if (myId !== reqIdRef.current) return;
        if (data.imageUrl) {
          setResults((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, imageUrl: data.imageUrl! } : x
            )
          );
        }
      } catch {
        /* 사진 실패 → 플레이스홀더 */
      }
    });
  }, []);

  // NDJSON 스트림 소비 — recipe 이벤트마다 onRecipe 호출.
  const consume = useCallback(
    async (
      res: Response,
      myId: number,
      seen: Set<string>,
      onRecipe: (r: Recipe, src: Source) => void
    ): Promise<StreamMeta> => {
      const meta: StreamMeta = { source: null, error: null };
      const reader = res.body?.getReader();
      if (!reader) return meta;
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          if (myId !== reqIdRef.current) {
            try {
              await reader.cancel();
            } catch {
              /* 무시 */
            }
            return meta;
          }
          let msg: SearchEvent;
          try {
            msg = JSON.parse(line) as SearchEvent;
          } catch {
            continue;
          }
          if (msg.type === "recipe" && msg.recipe) {
            if (!seen.has(msg.recipe.id)) {
              seen.add(msg.recipe.id);
              onRecipe(msg.recipe, msg.source ?? "gemini");
            }
          } else if (msg.type === "done") {
            meta.source = msg.source ?? meta.source;
            meta.error = msg.error ?? null;
            meta.retryAfter = msg.retryAfter;
          }
        }
      }
      return meta;
    },
    []
  );

  const search = useCallback(async () => {
    const myId = ++reqIdRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStatus("loading");
    setError(null);
    setExhausted(false);
    setResults([]);
    setSource(null);

    const seen = new Set<string>();
    let appended = 0;

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ingredients }),
        signal: ac.signal,
      });
      const meta = await consume(res, myId, seen, (r, src) => {
        appended++;
        setSource(src);
        setResults((prev) => [...prev, r]);
        setStatus("done"); // 첫 카드가 오면 스켈레톤 → 결과
        resolvePhotos([r], myId);
      });
      if (myId !== reqIdRef.current) return;

      if (meta.source) setSource(meta.source);
      if (meta.error) setError(meta.error);
      if (meta.retryAfter) startCooldown(meta.retryAfter);
      // 0개면 항상 "empty"(빈 입력 안내도 여기서 표시). 실제 예외만 catch 에서 "error".
      setStatus(appended === 0 ? "empty" : "done");
    } catch {
      if (ac.signal.aborted || myId !== reqIdRef.current) return;
      // 이미 받은 카드가 있으면 살려둔다(스트림 중간 끊김) — #2
      if (appended > 0) {
        setStatus("done");
        setError("연결이 끊겨 일부만 불러왔어요.");
      } else {
        setStatus("error");
        setError("레시피를 불러오지 못했어요. 다시 시도해 주세요.");
      }
    }
  }, [query, ingredients, consume, resolvePhotos, startCooldown]);

  // "+ 더보기" — 이미 본 레시피를 제외하고 이어서 스트리밍.
  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || cooldownSec > 0) return;
    const myId = reqIdRef.current;
    setLoadingMore(true);
    const seen = new Set(resultsRef.current.map((r) => r.id));
    const exclude = resultsRef.current.map((r) => r.title);
    let appended = 0;
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ingredients, exclude }),
      });
      const meta = await consume(res, myId, seen, (r) => {
        appended++;
        setResults((prev) => [...prev, r]);
        resolvePhotos([r], myId);
      });
      if (myId !== reqIdRef.current) return;
      if (meta.retryAfter) startCooldown(meta.retryAfter);
      if (appended === 0) {
        if (meta.error) setError(meta.error);
        else setExhausted(true);
      } else {
        setError(null);
      }
    } catch {
      /* 조용히 무시(기존 결과 유지) */
    } finally {
      setLoadingMore(false);
    }
  }, [
    query,
    ingredients,
    loadingMore,
    exhausted,
    cooldownSec,
    consume,
    resolvePhotos,
    startCooldown,
  ]);

  return {
    query,
    setQuery,
    ingredients,
    addIngredient,
    removeIngredient,
    results,
    status,
    source,
    error,
    search,
    loadMore,
    loadingMore,
    exhausted,
    cooldownSec,
  };
}

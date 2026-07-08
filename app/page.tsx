"use client";
import { useCallback, useEffect, useState } from "react";
import BottomNav, { type Tab } from "@/components/BottomNav";
import SearchBar from "@/components/SearchBar";
import IngredientChips from "@/components/IngredientChips";
import RecipeCard from "@/components/RecipeCard";
import RecipeDetail from "@/components/RecipeDetail";
import SavedList from "@/components/SavedList";
import SearchingIndicator from "@/components/SearchingIndicator";
import { useRecipeSearch } from "@/lib/useRecipeSearch";
import { useSavedRecipes } from "@/lib/useSavedRecipes";
import type { Recipe } from "@/lib/types";

export default function Page() {
  const [tab, setTab] = useState<Tab>("search");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const s = useRecipeSearch();
  const store = useSavedRecipes();
  // 안정적인 콜백만 뽑아 쓴다 — store 객체 자체는 매 렌더 새로 생겨 memo 를 깨뜨림(#3)
  const { isSaved, save, remove, imageURLOf, setRating, setNote, saved } = store;

  // 온라인/오프라인 감지
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // 상세 이미지: 저장분이면 오프라인 blob → 아니면 상세 진입 시 사진을 그때 해석(목록에선 안 부름)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selected) {
        setSelectedImg(null);
        return;
      }
      if (isSaved(selected.id)) {
        const url = await imageURLOf(selected.id);
        if (alive) setSelectedImg(url ?? selected.imageUrl ?? null);
        return;
      }
      if (selected.imageUrl) {
        setSelectedImg(selected.imageUrl); // 샘플 등 이미 URL 있는 경우
        return;
      }
      // 상세 열 때 사진 해석 (한 건만)
      setSelectedImg(null);
      try {
        const res = await fetch("/api/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "resolve",
            title: selected.title,
            sourceUrl: selected.sourceUrl,
          }),
        });
        const data = (await res.json()) as { imageUrl?: string | null };
        if (alive) setSelectedImg(data.imageUrl ?? null);
      } catch {
        if (alive) setSelectedImg(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected, isSaved, imageURLOf]);

  const toggleFav = useCallback(
    async (recipe: Recipe) => {
      if (isSaved(recipe.id)) await remove(recipe.id);
      else await save(recipe);
    },
    [isSaved, save, remove]
  );

  const openDetail = useCallback((r: Recipe) => setSelected(r), []);

  const savedSelected = selected
    ? saved.find((x) => x.id === selected.id)
    : undefined;

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">
          지아의 쿡북<span className="dot">.</span>
        </h1>
        <p className="app-sub">검증된 레시피만, 사진과 함께</p>
      </header>

      {!online && (
        <div className="offline-banner">
          오프라인 — 저장한 레시피만 볼 수 있어요
        </div>
      )}

      {tab === "search" ? (
        <>
          <SearchBar
            value={s.query}
            onChange={s.setQuery}
            onSearch={s.search}
            loading={s.status === "loading"}
            cooldownSec={s.cooldownSec}
          />
          <IngredientChips
            ingredients={s.ingredients}
            onAdd={s.addIngredient}
            onRemove={s.removeIngredient}
          />
          <div className="scroll">
            {s.status === "loading" && (
              <>
                <SearchingIndicator />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton" />
                ))}
              </>
            )}

            {s.status === "error" && (
              <div className="empty">
                <div className="big">😢</div>
                {s.error}
                <div className="retry">
                  <button className="btn" onClick={s.search}>
                    다시 시도
                  </button>
                </div>
              </div>
            )}

            {s.status === "empty" && (
              <div className="empty">
                <div className="big">🔍</div>
                {s.error ?? "검색 결과가 없어요. 다른 재료나 요리로 검색해 보세요."}
              </div>
            )}

            {s.status === "idle" && (
              <div className="empty">
                <div className="big">🍳</div>
                먹고 싶은 요리를 검색해 보세요.
                <br />
                집에 있는 재료를 더하면 더 잘 찾아요.
              </div>
            )}

            {s.status === "done" && (
              <>
                <div className={`source-badge ${s.source ?? ""}`}>
                  {s.source === "gemini" ? (
                    <>🤖 AI 추천 레시피</>
                  ) : s.source === "grounded" ? (
                    <>🔍 구글 검색으로 검증한 레시피</>
                  ) : (
                    <>📚 기본 레시피 (AI 대신 내장 레시피)</>
                  )}
                </div>
                {s.error && (
                  <p style={{ color: "var(--gold)", fontSize: 12, margin: "0 0 8px" }}>
                    {s.error}
                  </p>
                )}
                {s.results.map((r) => (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    saved={isSaved(r.id)}
                    onOpen={openDetail}
                    onToggleFav={toggleFav}
                  />
                ))}
                {s.exhausted ? (
                  <p style={{ textAlign: "center", color: "var(--faint)", fontSize: 12, padding: "8px 0 4px" }}>
                    더 이상 레시피가 없어요
                  </p>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ width: "100%", marginTop: 4 }}
                    onClick={s.loadMore}
                    disabled={s.loadingMore || s.cooldownSec > 0}
                  >
                    {s.loadingMore
                      ? "더 찾는 중…"
                      : s.cooldownSec > 0
                        ? `${s.cooldownSec}초 후 가능`
                        : "+ 더보기"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="scroll">
          <SavedList
            saved={saved}
            imageURLOf={imageURLOf}
            onOpen={openDetail}
            onToggleFav={toggleFav}
          />
        </div>
      )}

      <BottomNav active={tab} onSelect={setTab} />

      {selected && (
        <RecipeDetail
          recipe={selected}
          imageUrl={selectedImg}
          saved={isSaved(selected.id)}
          rating={savedSelected?.rating}
          note={savedSelected?.note}
          onClose={() => setSelected(null)}
          onToggleFav={toggleFav}
          onRate={setRating}
          onNote={setNote}
        />
      )}
    </>
  );
}

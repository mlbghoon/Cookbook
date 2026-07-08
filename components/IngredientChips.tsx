"use client";
import { useState } from "react";

export default function IngredientChips({
  ingredients,
  onAdd,
  onRemove,
}: {
  ingredients: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="chips" aria-label="집에 있는 재료">
      {ingredients.map((ing) => (
        <span key={ing} className="chip">
          {ing}
          <button
            onClick={() => onRemove(ing)}
            aria-label={`${ing} 삭제`}
          >
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="chip-input"
          value={draft}
          placeholder="재료"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={commit}
        />
      ) : (
        <button
          className="chip chip-add"
          onClick={() => setAdding(true)}
        >
          + 재료
        </button>
      )}
    </div>
  );
}

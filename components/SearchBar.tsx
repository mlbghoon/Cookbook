"use client";

export default function SearchBar({
  value,
  onChange,
  onSearch,
  loading,
  cooldownSec = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  cooldownSec?: number;
}) {
  const disabled = loading || cooldownSec > 0;
  return (
    <div className="searchbar">
      <input
        type="text"
        value={value}
        placeholder="무엇을 만들까요? (예: 김치찌개)"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) onSearch();
        }}
        aria-label="레시피 검색어"
      />
      <button
        className="btn"
        onClick={onSearch}
        disabled={disabled}
        aria-busy={loading}
      >
        {loading ? "찾는 중…" : cooldownSec > 0 ? `${cooldownSec}초` : "검색"}
      </button>
    </div>
  );
}

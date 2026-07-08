"use client";

export type Tab = "search" | "saved";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "search", icon: "🔍", label: "검색" },
  { id: "saved", icon: "⭐", label: "저장" },
];

export default function BottomNav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`bn-item${active === t.id ? " on" : ""}`}
          onClick={() => onSelect(t.id)}
          aria-current={active === t.id ? "page" : undefined}
        >
          <span className="ico">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

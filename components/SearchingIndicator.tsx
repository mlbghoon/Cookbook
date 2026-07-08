"use client";
// 검증(그라운딩) 검색이 ~15초 걸리므로, 기다리는 동안 귀엽게 안내한다.
import { useEffect, useState } from "react";

const MESSAGES = [
  { emoji: "🔍", text: "믿을 만한 레시피를 찾는 중…" },
  { emoji: "📖", text: "요리책을 뒤적이는 중…" },
  { emoji: "👨‍🍳", text: "유명 셰프한테 물어보는 중…" },
  { emoji: "🥄", text: "냄비를 휘휘 젓는 중…" },
  { emoji: "😋", text: "간을 살짝 보는 중…" },
  { emoji: "✨", text: "맛있는 것만 골라오는 중…" },
  { emoji: "🍽️", text: "예쁜 접시에 담는 중…" },
];

export default function SearchingIndicator() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % MESSAGES.length), 1800);
    return () => clearInterval(id);
  }, []);
  const m = MESSAGES[i];
  return (
    <div className="searching">
      <div className="searching-pot" aria-hidden>
        🍲
      </div>
      <div className="searching-msg" key={i} aria-live="polite">
        <span className="searching-emoji">{m.emoji}</span> {m.text}
      </div>
      <div className="searching-note">
        검증된 레시피만 골라오느라 조금 걸려요 (~15초)
      </div>
    </div>
  );
}

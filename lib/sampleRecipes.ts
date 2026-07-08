// 키가 없어도 앱이 완전히 동작하도록 하는 큐레이션 샘플.
// 실제 요리 사진은 위키미디어 커먼스(자유 이용) URL 을 사용.
import type { Recipe } from "./types";
import { recipeId } from "./prompt";

interface SampleSeed extends Omit<Recipe, "id"> {
  tags: string[]; // 검색 매칭용 키워드
}

const SEEDS: SampleSeed[] = [
  {
    title: "백종원 김치찌개",
    summary: "묵은지와 돼지고기로 끓이는 진한 김치찌개.",
    servings: "2인분",
    time: "약 30분",
    difficulty: "쉬움",
    ingredients: [
      { name: "묵은지", amount: "1/4포기" },
      { name: "돼지고기 목살", amount: "200g" },
      { name: "대파", amount: "1대" },
      { name: "고춧가루", amount: "1큰술" },
      { name: "설탕", amount: "1작은술" },
      { name: "물", amount: "3컵" },
    ],
    steps: [
      "돼지고기를 먹기 좋게 썰어 냄비에 넣고 중불로 볶는다.",
      "묵은지를 넣고 함께 볶아 김치의 신맛을 날린다.",
      "고춧가루와 설탕을 넣고 물을 부어 센 불로 끓인다.",
      "끓어오르면 중불로 줄여 15분간 뭉근히 끓인다.",
      "대파를 넣고 한소끔 더 끓여 마무리한다.",
    ],
    tips: ["설탕 한 꼬집이 신김치의 균형을 잡아준다."],
    source: "백종원",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/2/2e/Kimchi_jjigae.jpg",
    tags: ["김치찌개", "김치", "돼지고기", "찌개", "한식", "국물"],
  },
  {
    title: "간장계란밥",
    summary: "5분이면 완성되는 든든한 한 그릇.",
    servings: "1인분",
    time: "약 5분",
    difficulty: "쉬움",
    ingredients: [
      { name: "밥", amount: "1공기" },
      { name: "계란", amount: "2개" },
      { name: "간장", amount: "1큰술" },
      { name: "참기름", amount: "1작은술" },
      { name: "버터", amount: "1조각" },
    ],
    steps: [
      "팬에 버터를 녹이고 계란을 반숙으로 프라이한다.",
      "따뜻한 밥에 간장과 참기름을 두른다.",
      "계란을 올리고 노른자를 터뜨려 비벼 먹는다.",
    ],
    tips: ["버터 대신 들기름을 써도 고소하다."],
    source: "집밥 기본",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/8/89/Gyeran-bap.jpg",
    tags: ["계란", "간장", "밥", "계란밥", "간단", "자취", "한식"],
  },
  {
    title: "알리오 올리오",
    summary: "마늘과 올리브유만으로 완성하는 클래식 파스타.",
    servings: "1인분",
    time: "약 15분",
    difficulty: "보통",
    ingredients: [
      { name: "스파게티", amount: "100g" },
      { name: "마늘", amount: "5쪽" },
      { name: "올리브유", amount: "4큰술" },
      { name: "페페론치노", amount: "2개" },
      { name: "파슬리", amount: "약간" },
      { name: "소금", amount: "약간" },
    ],
    steps: [
      "끓는 소금물에 스파게티를 삶는다(면수 남겨두기).",
      "팬에 올리브유와 편 썬 마늘을 약불로 볶아 향을 낸다.",
      "페페론치노를 부숴 넣는다.",
      "삶은 면과 면수 한 국자를 넣어 유화시킨다.",
      "파슬리를 뿌려 마무리한다.",
    ],
    tips: ["면수의 전분이 소스를 부드럽게 감싸준다."],
    source: "이탈리아 가정식",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Spaghetti_aglio_e_olio.jpg",
    tags: ["파스타", "스파게티", "마늘", "올리브유", "양식", "알리오"],
  },
  {
    title: "감바스 알 아히요",
    summary: "새우와 마늘을 올리브유에 자글자글 익힌 스페인 타파스.",
    servings: "2인분",
    time: "약 20분",
    difficulty: "보통",
    ingredients: [
      { name: "새우", amount: "12마리" },
      { name: "마늘", amount: "8쪽" },
      { name: "올리브유", amount: "1컵" },
      { name: "페페론치노", amount: "3개" },
      { name: "소금", amount: "약간" },
      { name: "바게트", amount: "적당량" },
    ],
    steps: [
      "새우는 껍질을 까고 소금으로 밑간한다.",
      "작은 팬에 올리브유와 편 마늘을 넣고 약불로 데운다.",
      "마늘이 노릇해지면 페페론치노와 새우를 넣는다.",
      "새우가 익으면 불을 끄고 바게트를 곁들인다.",
    ],
    tips: ["기름 온도를 낮게 유지해야 마늘이 타지 않는다."],
    source: "스페인 타파스",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/6/6a/Gambas_al_ajillo.jpg",
    tags: ["새우", "마늘", "감바스", "타파스", "양식", "안주"],
  },
  {
    title: "된장찌개",
    summary: "구수한 된장에 애호박과 두부를 넣은 기본 찌개.",
    servings: "2인분",
    time: "약 25분",
    difficulty: "쉬움",
    ingredients: [
      { name: "된장", amount: "2큰술" },
      { name: "두부", amount: "1/2모" },
      { name: "애호박", amount: "1/3개" },
      { name: "양파", amount: "1/2개" },
      { name: "대파", amount: "1대" },
      { name: "멸치육수", amount: "3컵" },
    ],
    steps: [
      "멸치육수를 끓이고 된장을 풀어준다.",
      "양파와 애호박을 넣고 끓인다.",
      "두부를 넣고 5분간 더 끓인다.",
      "대파를 넣어 마무리한다.",
    ],
    tips: ["된장은 체에 걸러 풀면 국물이 깔끔하다."],
    source: "집밥 기본",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/9d/Doenjang-jjigae.jpg",
    tags: ["된장", "된장찌개", "두부", "애호박", "찌개", "한식", "국물"],
  },
  {
    title: "토마토 계란볶음",
    summary: "새콤달콤 토마토와 부드러운 계란의 중국 가정식.",
    servings: "2인분",
    time: "약 15분",
    difficulty: "쉬움",
    ingredients: [
      { name: "토마토", amount: "2개" },
      { name: "계란", amount: "3개" },
      { name: "대파", amount: "1/2대" },
      { name: "설탕", amount: "1작은술" },
      { name: "소금", amount: "약간" },
    ],
    steps: [
      "토마토를 큼직하게 썰고 계란은 소금 간해 풀어둔다.",
      "팬에 기름을 두르고 계란을 반쯤 익혀 덜어낸다.",
      "토마토를 볶다가 설탕을 넣어 즙을 낸다.",
      "계란을 다시 넣고 살짝 볶아 마무리한다.",
    ],
    tips: ["설탕이 토마토의 신맛을 부드럽게 잡아준다."],
    source: "중국 가정식",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/3b/Stir-fried_tomato_and_scrambled_eggs.jpg",
    tags: ["토마토", "계란", "볶음", "중식", "간단"],
  },
];

const SAMPLES: Recipe[] = SEEDS.map(({ tags, ...r }) => ({
  ...r,
  id: recipeId(r.title, r.source, r.summary),
}));

// query/재료 키워드로 매칭. 아무 것도 안 맞으면 전체 반환(빈 화면 방지).
// exclude: 이미 본 레시피 제목(더보기 시 제외).
export function matchSamples(
  query: string,
  ingredients: string[] = [],
  exclude: string[] = []
): Recipe[] {
  const seen = new Set(exclude);
  const pool = SEEDS.map((seed, i) => ({ seed, recipe: SAMPLES[i] })).filter(
    (x) => !seen.has(x.recipe.title)
  );

  const terms = [query, ...ingredients]
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (terms.length === 0) return pool.map((x) => x.recipe);

  const scored = pool.map(({ seed, recipe }) => {
    const hay = [seed.title, seed.summary ?? "", ...seed.tags]
      .join(" ")
      .toLowerCase();
    const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    return { recipe, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.recipe);

  // 매칭 없으면 (제외 반영된) 전체를 보여준다
  return matched.length ? matched : pool.map((x) => x.recipe);
}

export const allSamples = SAMPLES;

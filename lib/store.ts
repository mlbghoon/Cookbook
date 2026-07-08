// IndexedDB 저장소 — 저장 레시피 + 사진 blob(오프라인용).
// Aremi lib/photos.ts 의 PhotoStore 인터페이스 패턴을 따른다.
// ⚠️ 네트워크·objectURL 생성 안 함(수명주기는 useSavedRecipes 가 관리 — 이슈 14A).
// ⚠️ indexedDB 는 import 시점에 만지지 않고, 함수 호출 시 lazy-init (이슈 2A).

import type { SavedRecipe } from "./types";

const DB_NAME = "cookbook";
const DB_VERSION = 1;
const STORE_RECIPES = "recipes";
const STORE_IMAGES = "images";

export interface SaveOptions {
  rating?: number;
  note?: string;
  imageBlob?: Blob | null;
}

export interface ExportedRecipe {
  recipe: SavedRecipe;
  imageDataUrl?: string;
}

export interface RecipeStore {
  save(recipe: SavedRecipe, opts?: SaveOptions): Promise<void>;
  list(): Promise<SavedRecipe[]>;
  get(id: string): Promise<SavedRecipe | undefined>;
  has(id: string): Promise<boolean>;
  getImageBlob(id: string): Promise<Blob | null>;
  setImage(id: string, imageUrl: string, blob: Blob | null): Promise<void>;
  setRating(id: string, rating: number): Promise<void>;
  setNote(id: string, note: string): Promise<void>;
  remove(id: string): Promise<void>;
  exportAll(): Promise<ExportedRecipe[]>;
  importAll(items: ExportedRecipe[]): Promise<void>;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable (SSR/no browser)"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECIPES)) {
        db.createObjectStore(STORE_RECIPES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// FileReader 비의존 — 브라우저/테스트(jsdom) 모두에서 동작.
async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 =
    typeof btoa !== "undefined"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return `data:${b.type || "application/octet-stream"};base64,${base64}`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export const recipeStore: RecipeStore = {
  async save(recipe, opts = {}) {
    const record: SavedRecipe = {
      ...recipe,
      savedAt: recipe.savedAt || Date.now(),
      ...(opts.rating !== undefined ? { rating: opts.rating } : {}),
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    };
    await tx(STORE_RECIPES, "readwrite", (s) => s.put(record));
    if (opts.imageBlob) {
      await tx(STORE_IMAGES, "readwrite", (s) =>
        s.put({ id: recipe.id, blob: opts.imageBlob })
      );
    }
  },

  async list() {
    const all = await tx<SavedRecipe[]>(STORE_RECIPES, "readonly", (s) =>
      s.getAll()
    );
    return all.sort((a, b) => b.savedAt - a.savedAt);
  },

  get(id) {
    return tx<SavedRecipe | undefined>(STORE_RECIPES, "readonly", (s) =>
      s.get(id)
    );
  },

  async has(id) {
    const key = await tx<IDBValidKey | undefined>(
      STORE_RECIPES,
      "readonly",
      (s) => s.getKey(id)
    );
    return key !== undefined;
  },

  async getImageBlob(id) {
    const rec = await tx<{ id: string; blob: Blob } | undefined>(
      STORE_IMAGES,
      "readonly",
      (s) => s.get(id)
    );
    return rec?.blob ?? null;
  },

  // 저장된 레시피에 사진을 나중에 붙인다(즐겨찾기 후 백그라운드 확보용)
  async setImage(id, imageUrl, blob) {
    const rec = await this.get(id);
    if (!rec) return;
    await tx(STORE_RECIPES, "readwrite", (s) => s.put({ ...rec, imageUrl }));
    if (blob) {
      await tx(STORE_IMAGES, "readwrite", (s) => s.put({ id, blob }));
    }
  },

  async setRating(id, rating) {
    const rec = await this.get(id);
    if (!rec) return;
    await tx(STORE_RECIPES, "readwrite", (s) => s.put({ ...rec, rating }));
  },

  async setNote(id, note) {
    const rec = await this.get(id);
    if (!rec) return;
    await tx(STORE_RECIPES, "readwrite", (s) => s.put({ ...rec, note }));
  },

  async remove(id) {
    await tx(STORE_RECIPES, "readwrite", (s) => s.delete(id));
    await tx(STORE_IMAGES, "readwrite", (s) => s.delete(id));
  },

  async exportAll() {
    const recipes = await this.list();
    return Promise.all(
      recipes.map(async (recipe) => {
        const blob = await this.getImageBlob(recipe.id);
        return {
          recipe,
          imageDataUrl: blob ? await blobToDataUrl(blob) : undefined,
        };
      })
    );
  },

  async importAll(items) {
    for (const item of items) {
      const blob = item.imageDataUrl
        ? await dataUrlToBlob(item.imageDataUrl)
        : null;
      await this.save(item.recipe, { imageBlob: blob });
    }
  },
};

// 테스트 편의: 열린 커넥션을 닫고 캐시 리셋 (deleteDatabase 블록 방지)
export function _resetDbForTest() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
}

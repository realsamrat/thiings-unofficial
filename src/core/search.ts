import { Icon, SearchResult } from "./types.js";

interface ScoredIcon {
  icon: Icon;
  score: number;
}

function scoreIcon(icon: Icon, query: string): number {
  const q = query.toLowerCase();
  const name = icon.name.toLowerCase();
  const id = icon.id.toLowerCase();

  // Exact name match
  if (name === q) return 100;

  // Exact id match
  if (id === q) return 95;

  // Name starts with query
  if (name.startsWith(q)) return 80;

  // Id starts with query
  if (id.startsWith(q)) return 75;

  // Name contains query as whole word
  if (name.includes(` ${q}`) || name.includes(`${q} `)) return 60;

  // Name contains query
  if (name.includes(q)) return 50;

  // Id contains query
  if (id.includes(q)) return 45;

  // Category exact match
  if (icon.categories.some((c) => c.toLowerCase() === q)) return 40;

  // Category contains query
  if (icon.categories.some((c) => c.toLowerCase().includes(q))) return 30;

  // Multi-word: all words appear somewhere
  const words = q.split(/\s+/);
  if (words.length > 1) {
    const allInName = words.every((w) => name.includes(w));
    if (allInName) return 55;

    const allInCategories = words.every((w) =>
      icon.categories.some((c) => c.toLowerCase().includes(w))
    );
    if (allInCategories) return 25;
  }

  return 0;
}

export function searchIcons(
  icons: Icon[],
  query: string,
  options: { category?: string; limit?: number } = {}
): SearchResult {
  const { category, limit = 20 } = options;

  let filtered = icons;

  // Filter by category first if specified
  if (category) {
    const cat = category.toLowerCase();
    filtered = filtered.filter((icon) =>
      icon.categories.some((c) => c.toLowerCase().includes(cat))
    );
  }

  // Score and sort
  const scored: ScoredIcon[] = filtered
    .map((icon) => ({ icon, score: scoreIcon(icon, query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const results = scored.slice(0, limit).map((s) => s.icon);

  return {
    icons: results,
    total: scored.length,
    query,
  };
}

export function browseIcons(
  icons: Icon[],
  options: { category?: string; page?: number; pageSize?: number } = {}
): { icons: Icon[]; total: number; page: number; totalPages: number } {
  const { category, page = 1, pageSize = 20 } = options;

  let filtered = icons;
  if (category) {
    const cat = category.toLowerCase();
    filtered = filtered.filter((icon) =>
      icon.categories.some((c) => c.toLowerCase().includes(cat))
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pageIcons = filtered.slice(start, start + pageSize);

  return { icons: pageIcons, total, page, totalPages };
}

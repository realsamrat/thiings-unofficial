import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CatalogCache, Icon } from "./types.js";
import { fetchCatalog } from "./scraper.js";

const CACHE_DIR = join(homedir(), ".thiings");
const CACHE_FILE = join(CACHE_DIR, "cache.json");
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

export async function getCache(): Promise<CatalogCache | null> {
  try {
    const data = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data) as CatalogCache;
  } catch {
    return null;
  }
}

export function isCacheValid(cache: CatalogCache): boolean {
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  return age < TTL_MS;
}

export async function setCache(icons: Icon[]): Promise<CatalogCache> {
  await ensureCacheDir();
  const categories = [
    ...new Set(icons.flatMap((icon) => icon.categories)),
  ].sort();
  const cache: CatalogCache = {
    icons,
    categories,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
  return cache;
}

export async function clearCache(): Promise<void> {
  try {
    await unlink(CACHE_FILE);
  } catch {
    // ignore if file doesn't exist
  }
}

/**
 * Get the catalog, using cache if valid, otherwise fetching fresh.
 */
export async function getCatalog(
  forceRefresh = false
): Promise<CatalogCache> {
  if (!forceRefresh) {
    const cache = await getCache();
    if (cache && isCacheValid(cache)) {
      return cache;
    }
  }

  const icons = await fetchCatalog();
  return setCache(icons);
}

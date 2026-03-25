export interface Icon {
  id: string;
  name: string;
  categories: string[];
  fileId: string;
  imageUrl: string;
}

export interface IconDetail extends Icon {
  description: string;
}

export interface SearchResult {
  icons: Icon[];
  total: number;
  query: string;
}

export interface CatalogCache {
  icons: Icon[];
  categories: string[];
  fetchedAt: string;
}

export const BLOB_CDN = "https://lftz25oez4aqbxpq.public.blob.vercel-storage.com";
export const THIINGS_BASE = "https://www.thiings.co";

export function buildImageUrl(fileId: string): string {
  return `${BLOB_CDN}/image-${fileId}.png`;
}

export function buildIconUrl(id: string): string {
  return `${THIINGS_BASE}/things/${id}`;
}

export function buildSearchUrl(query: string): string {
  return `${THIINGS_BASE}/things?q=${encodeURIComponent(query)}`;
}

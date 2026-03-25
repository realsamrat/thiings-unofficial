import { Icon, IconDetail, THIINGS_BASE, buildImageUrl } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Concatenate all RSC flight data chunks from self.__next_f.push calls.
 * Each chunk is: self.__next_f.push([1,"...content..."]) inside a <script> tag.
 * The content may contain escaped quotes, so we extract between the markers.
 */
function concatFlightData(html: string): string {
  const chunks: string[] = [];
  const marker = 'self.__next_f.push([1,"';
  let pos = 0;
  while (pos < html.length) {
    const start = html.indexOf(marker, pos);
    if (start === -1) break;
    const contentStart = start + marker.length;
    // Find the closing "])" — the content ends with "]) which is outside a </script>
    const end = html.indexOf('"])', contentStart);
    if (end === -1) break;
    chunks.push(html.slice(contentStart, end));
    pos = end + 3;
  }
  return chunks.join("");
}

interface RawIcon {
  id: string;
  name: string;
  categories: string[];
  fileId: string;
  shareUrl: string;
  isLatest: boolean;
}

/**
 * Parse the catalog from the /things page SSR payload.
 */
export async function fetchCatalog(): Promise<Icon[]> {
  const html = await fetchPage(`${THIINGS_BASE}/things`);

  // The objects array is in the RSC payload as escaped JSON
  const marker = '\\"objects\\":[';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error(
      "Could not find objects array in the catalog page. The page structure may have changed."
    );
  }

  // Find the array by tracking bracket depth
  const arrayStart = startIdx + marker.length - 1;
  let depth = 0;
  let arrayEnd = -1;
  let i = arrayStart;
  while (i < html.length) {
    const ch = html[i];
    if (ch === "\\" && i + 1 < html.length) {
      i += 2;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
    i++;
  }

  if (arrayEnd === -1) {
    throw new Error("Could not find end of objects array.");
  }

  const escapedJson = html.slice(arrayStart, arrayEnd);
  const json = escapedJson.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  let rawIcons: RawIcon[];
  try {
    rawIcons = JSON.parse(json);
  } catch (e) {
    throw new Error(`Failed to parse icons JSON: ${(e as Error).message}`);
  }

  const icons: Icon[] = rawIcons.map((raw) => ({
    id: raw.id,
    name: raw.name,
    categories: raw.categories,
    fileId: raw.fileId,
    imageUrl: buildImageUrl(raw.fileId),
  }));

  if (icons.length === 0) {
    throw new Error("No icons found in the catalog page.");
  }

  return icons;
}

interface DetailCategory {
  text: string;
  path: string;
}

interface RawDetail {
  id: string;
  name: string;
  note: string;
  categories: DetailCategory[];
  imageUrl: string;
  audioUrl?: string;
  shareUrl: string;
}

/**
 * Fetch full details for a single icon, including description.
 * The detail page splits RSC data across multiple script chunks.
 * The item object has: id, name, note (description), categories [{text, path}], imageUrl
 */
export async function fetchIconDetail(id: string): Promise<IconDetail | null> {
  try {
    const html = await fetchPage(`${THIINGS_BASE}/things/${id}`);

    // Concatenate all RSC flight data chunks
    const flight = concatFlightData(html);

    // Find the item object in the concatenated flight data
    const itemMarker = `\\"item\\":{`;
    const itemIdx = flight.indexOf(itemMarker);

    if (itemIdx === -1) {
      // Fallback: try from the catalog cache
      return fallbackFromCatalog(id);
    }

    // Extract the item object by tracking brace depth
    const objStart = itemIdx + itemMarker.length - 1;
    let depth = 0;
    let objEnd = objStart;
    while (objEnd < flight.length) {
      const ch = flight[objEnd];
      if (ch === "\\" && objEnd + 1 < flight.length) {
        objEnd += 2;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd++;
          break;
        }
      }
      objEnd++;
    }

    const escapedObj = flight.slice(objStart, objEnd);
    const objJson = escapedObj.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

    let detail: RawDetail;
    try {
      detail = JSON.parse(objJson);
    } catch {
      return fallbackFromCatalog(id);
    }

    const categories = detail.categories.map((c) => c.text);
    // Extract fileId from imageUrl if present
    let fileId = "";
    const fileIdMatch = detail.imageUrl?.match(/image-([^.]+)\.png/);
    if (fileIdMatch) {
      fileId = fileIdMatch[1];
    }

    return {
      id: detail.id,
      name: detail.name,
      categories,
      fileId,
      imageUrl: detail.imageUrl || (fileId ? buildImageUrl(fileId) : ""),
      description: detail.note || "No description available.",
    };
  } catch {
    return null;
  }
}

async function fallbackFromCatalog(id: string): Promise<IconDetail | null> {
  // If we can't parse the detail page, return basic info
  return {
    id,
    name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    categories: [],
    fileId: "",
    imageUrl: "",
    description: "No description available.",
  };
}

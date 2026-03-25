import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Icon } from "./types.js";

export async function downloadIcon(
  icon: Icon,
  outputDir: string
): Promise<string> {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const filePath = join(outputDir, `${icon.id}.png`);
  const res = await fetch(icon.imageUrl);

  if (!res.ok) {
    throw new Error(
      `Failed to download ${icon.name}: ${res.status} ${res.statusText}`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

export async function downloadBatch(
  icons: Icon[],
  outputDir: string,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, icon: Icon) => void;
  } = {}
): Promise<{ downloaded: string[]; failed: { icon: Icon; error: string }[] }> {
  const { concurrency = 5, onProgress } = options;

  const downloaded: string[] = [];
  const failed: { icon: Icon; error: string }[] = [];
  let completed = 0;

  // Process in chunks for concurrency control
  for (let i = 0; i < icons.length; i += concurrency) {
    const chunk = icons.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map(async (icon) => {
        const path = await downloadIcon(icon, outputDir);
        completed++;
        onProgress?.(completed, icons.length, icon);
        return path;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        downloaded.push(result.value);
      } else {
        failed.push({
          icon: chunk[j],
          error: result.reason?.message || "Unknown error",
        });
        completed++;
        onProgress?.(completed, icons.length, chunk[j]);
      }
    }
  }

  return { downloaded, failed };
}

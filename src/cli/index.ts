#!/usr/bin/env node
import { select, input, confirm, number } from "@inquirer/prompts";
import chalk from "chalk";
import { getCatalog, clearCache } from "../core/cache.js";
import { searchIcons, browseIcons } from "../core/search.js";
import { fetchIconDetail } from "../core/scraper.js";
import { downloadIcon, downloadBatch } from "../core/downloader.js";
import { Icon, buildIconUrl, buildSearchUrl } from "../core/types.js";
import { resolve } from "node:path";

// --- Display helpers ---

function printBanner() {
  console.log();
  console.log(chalk.bold("  thiings") + chalk.dim("  —  10,000+ AI-generated 3D icons"));
  console.log(chalk.dim("  https://www.thiings.co"));
  console.log();
}

function printIconTable(icons: Icon[], startIndex = 0) {
  if (icons.length === 0) {
    console.log(chalk.yellow("  No icons found."));
    return;
  }

  const maxName = Math.min(30, Math.max(...icons.map((i) => i.name.length), 4));
  const maxId = Math.min(28, Math.max(...icons.map((i) => i.id.length), 2));

  console.log(
    `  ${chalk.dim("#".padStart(3))}  ${chalk.bold("Name".padEnd(maxName))}  ${chalk.bold("ID".padEnd(maxId))}  ${chalk.bold("URL")}`
  );
  console.log(chalk.dim("  " + "─".repeat(95)));

  icons.forEach((icon, i) => {
    const idx = startIndex + i + 1;
    console.log(
      `  ${chalk.dim(String(idx).padStart(3))}  ${chalk.white(icon.name.slice(0, maxName).padEnd(maxName))}  ${chalk.cyan(icon.id.slice(0, maxId).padEnd(maxId))}  ${chalk.dim(buildIconUrl(icon.id))}`
    );
  });
}

// --- Actions ---

async function doSearch() {
  const query = await input({ message: "Search query:" });
  if (!query.trim()) return;

  const catalog = await getCatalog();
  const result = searchIcons(catalog.icons, query, { limit: 30 });

  console.log();
  console.log(
    chalk.bold(`  ${result.total} results for "${query}"`) +
      (result.total > result.icons.length ? chalk.dim(` (showing ${result.icons.length})`) : "")
  );
  console.log(`  ${chalk.dim("Search on thiings.co:")} ${chalk.cyan(buildSearchUrl(query))}`);
  console.log();

  printIconTable(result.icons);
  console.log();

  if (result.icons.length > 0) {
    await iconActions(result.icons);
  }
}

async function doBrowse() {
  const catalog = await getCatalog();

  // Pick a category or browse all
  const categoryChoice = await select({
    message: "Browse by:",
    choices: [
      { name: "All icons", value: "__all__" },
      ...getTopCategories(catalog.icons, 20).map((c) => ({
        name: `${c.name} (${c.count})`,
        value: c.name,
      })),
      { name: "Type a category...", value: "__custom__" },
    ],
  });

  let category: string | undefined;
  if (categoryChoice === "__custom__") {
    category = await input({ message: "Category name:" });
  } else if (categoryChoice !== "__all__") {
    category = categoryChoice;
  }

  let page = 1;
  const pageSize = 20;

  while (true) {
    const result = browseIcons(catalog.icons, { category, page, pageSize });

    console.log();
    if (category) {
      console.log(`  ${chalk.dim("View on thiings.co:")} ${chalk.cyan(buildSearchUrl(category))}`);
    }
    console.log(
      chalk.bold(`  Page ${result.page}/${result.totalPages}`) +
        chalk.dim(` (${result.total} total)`)
    );
    console.log();

    printIconTable(result.icons, (page - 1) * pageSize);
    console.log();

    const choices: { name: string; value: string }[] = [];
    if (result.page < result.totalPages) choices.push({ name: "Next page", value: "next" });
    if (result.page > 1) choices.push({ name: "Previous page", value: "prev" });
    choices.push({ name: "View icon details", value: "details" });
    choices.push({ name: "Download icons from this page", value: "download" });
    choices.push({ name: "Back to menu", value: "back" });

    const action = await select({ message: "Action:", choices });

    if (action === "next") { page++; continue; }
    if (action === "prev") { page--; continue; }
    if (action === "details") { await iconActions(result.icons); continue; }
    if (action === "download") { await downloadFromList(result.icons); continue; }
    break;
  }
}

async function doCategories() {
  const catalog = await getCatalog();
  const categories = getTopCategories(catalog.icons, 50);

  console.log(chalk.bold(`\n  ${categories.length} categories (top 50)\n`));

  const maxName = Math.max(...categories.map((c) => c.name.length), 8);
  categories.forEach((cat) => {
    console.log(
      `  ${chalk.white(cat.name.padEnd(maxName))}  ${chalk.dim(cat.count + " icons")}  ${chalk.dim(buildSearchUrl(cat.name))}`
    );
  });
  console.log();
}

async function doIconLookup() {
  const id = await input({ message: "Icon ID (e.g. fire-truck):" });
  if (!id.trim()) return;

  console.log(chalk.dim("  Fetching details..."));
  const detail = await fetchIconDetail(id.trim());

  if (!detail) {
    console.log(chalk.red(`  Icon "${id}" not found.\n`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${detail.name}`));
  console.log(chalk.dim(`  ${detail.id}`));
  console.log();
  if (detail.description && detail.description !== "No description available.") {
    console.log(`  ${chalk.white(detail.description)}`);
    console.log();
  }
  console.log(`  ${chalk.dim("Categories:")}  ${detail.categories.join(", ") || "—"}`);
  console.log(`  ${chalk.dim("Page URL:")}    ${chalk.cyan(buildIconUrl(detail.id))}`);
  console.log(`  ${chalk.dim("Image URL:")}   ${chalk.cyan(detail.imageUrl)}`);
  console.log();

  const action = await select({
    message: "Action:",
    choices: [
      { name: "Download this icon", value: "download" },
      { name: "Back to menu", value: "back" },
    ],
  });

  if (action === "download") {
    const outputDir = await input({ message: "Output directory:", default: "./thiings-icons" });
    const dir = resolve(outputDir);
    console.log(`  Downloading ${chalk.bold(detail.name)}...`);
    const filePath = await downloadIcon(
      { id: detail.id, name: detail.name, categories: detail.categories, fileId: detail.fileId, imageUrl: detail.imageUrl },
      dir
    );
    console.log(`  ${chalk.green("Done")} ${chalk.cyan(filePath)}\n`);
  }
}

async function doDownload() {
  const mode = await select({
    message: "Download mode:",
    choices: [
      { name: "Search and download matching icons", value: "search" },
      { name: "Download by icon ID", value: "single" },
      { name: "Download all icons in a category", value: "category" },
    ],
  });

  const outputDir = await input({ message: "Output directory:", default: "./thiings-icons" });
  const dir = resolve(outputDir);

  if (mode === "single") {
    const id = await input({ message: "Icon ID:" });
    const catalog = await getCatalog();
    const icon = catalog.icons.find((i) => i.id === id.trim());
    if (!icon) {
      console.log(chalk.red(`  Icon "${id}" not found.\n`));
      return;
    }
    console.log(`  Downloading ${chalk.bold(icon.name)}...`);
    const filePath = await downloadIcon(icon, dir);
    console.log(`  ${chalk.green("Done")} ${chalk.cyan(filePath)}\n`);
    return;
  }

  if (mode === "search") {
    const query = await input({ message: "Search query:" });
    const catalog = await getCatalog();
    const result = searchIcons(catalog.icons, query, { limit: 100 });
    if (result.icons.length === 0) {
      console.log(chalk.yellow("  No icons found.\n"));
      return;
    }
    const ok = await confirm({
      message: `Download ${result.icons.length} icons to ${dir}?`,
    });
    if (!ok) return;
    await runBatchDownload(result.icons, dir);
    return;
  }

  if (mode === "category") {
    const category = await input({ message: "Category name:" });
    const catalog = await getCatalog();
    const cat = category.toLowerCase();
    const icons = catalog.icons.filter((i) =>
      i.categories.some((c) => c.toLowerCase().includes(cat))
    );
    if (icons.length === 0) {
      console.log(chalk.yellow("  No icons in that category.\n"));
      return;
    }
    const ok = await confirm({
      message: `Download ${icons.length} icons to ${dir}?`,
    });
    if (!ok) return;
    await runBatchDownload(icons, dir);
  }
}

async function doCache() {
  const action = await select({
    message: "Cache action:",
    choices: [
      { name: "Refresh (re-fetch catalog)", value: "refresh" },
      { name: "Clear (delete local cache)", value: "clear" },
      { name: "Back", value: "back" },
    ],
  });

  if (action === "refresh") {
    console.log("  Fetching fresh catalog...");
    const catalog = await getCatalog(true);
    console.log(chalk.green(`  Cached ${catalog.icons.length} icons.\n`));
  } else if (action === "clear") {
    await clearCache();
    console.log(chalk.green("  Cache cleared.\n"));
  }
}

// --- Shared sub-flows ---

async function iconActions(icons: Icon[]) {
  const action = await select({
    message: "What next?",
    choices: [
      { name: "View icon details", value: "details" },
      { name: "Download specific icons", value: "download" },
      { name: "Download all results", value: "download_all" },
      { name: "Back to menu", value: "back" },
    ],
  });

  if (action === "details") {
    const id = await input({ message: "Icon ID from above:" });
    const found = icons.find((i) => i.id === id.trim());
    if (found) {
      console.log(chalk.dim("  Fetching details..."));
      const detail = await fetchIconDetail(found.id);
      if (detail) {
        console.log();
        console.log(chalk.bold(`  ${detail.name}`));
        console.log();
        if (detail.description && detail.description !== "No description available.") {
          console.log(`  ${detail.description}`);
          console.log();
        }
        console.log(`  ${chalk.dim("Categories:")}  ${detail.categories.join(", ") || "—"}`);
        console.log(`  ${chalk.dim("Page URL:")}    ${chalk.cyan(buildIconUrl(detail.id))}`);
        console.log(`  ${chalk.dim("Image URL:")}   ${chalk.cyan(detail.imageUrl)}`);
        console.log();
      }
    } else {
      console.log(chalk.red(`  "${id}" not in results.\n`));
    }
  } else if (action === "download") {
    await downloadFromList(icons);
  } else if (action === "download_all") {
    const outputDir = await input({ message: "Output directory:", default: "./thiings-icons" });
    await runBatchDownload(icons, resolve(outputDir));
  }
}

async function downloadFromList(icons: Icon[]) {
  const id = await input({ message: "Icon ID to download:" });
  const icon = icons.find((i) => i.id === id.trim());
  if (!icon) {
    console.log(chalk.red(`  "${id}" not in this list.\n`));
    return;
  }
  const outputDir = await input({ message: "Output directory:", default: "./thiings-icons" });
  const dir = resolve(outputDir);
  console.log(`  Downloading ${chalk.bold(icon.name)}...`);
  const filePath = await downloadIcon(icon, dir);
  console.log(`  ${chalk.green("Done")} ${chalk.cyan(filePath)}\n`);
}

async function runBatchDownload(icons: Icon[], dir: string) {
  console.log(`\n  Downloading ${icons.length} icons to ${chalk.cyan(dir)}...\n`);
  const result = await downloadBatch(icons, dir, {
    concurrency: 5,
    onProgress: (completed, total, icon) => {
      process.stdout.write(`\r  ${chalk.green("↓")} ${completed}/${total} — ${icon.name}`.padEnd(80));
    },
  });
  console.log(`\n\n  ${chalk.green("Done")} ${result.downloaded.length} downloaded`);
  if (result.failed.length > 0) {
    console.log(chalk.red(`  ${result.failed.length} failed`));
  }
  console.log();
}

// --- Utilities ---

function getTopCategories(icons: Icon[], limit: number) {
  const counts = new Map<string, number>();
  for (const icon of icons) {
    for (const cat of icon.categories) {
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// --- Main loop ---

async function main() {
  printBanner();

  while (true) {
    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Search icons", value: "search" },
        { name: "Browse icons", value: "browse" },
        { name: "View icon details", value: "info" },
        { name: "Download icons", value: "download" },
        { name: "List categories", value: "categories" },
        { name: "Manage cache", value: "cache" },
        { name: "Exit", value: "exit" },
      ],
    });

    try {
      if (action === "search") await doSearch();
      else if (action === "browse") await doBrowse();
      else if (action === "info") await doIconLookup();
      else if (action === "download") await doDownload();
      else if (action === "categories") await doCategories();
      else if (action === "cache") await doCache();
      else if (action === "exit") {
        console.log(chalk.dim("  Bye.\n"));
        process.exit(0);
      }
    } catch (err) {
      if ((err as Error).name === "ExitPromptError") {
        console.log(chalk.dim("\n  Bye.\n"));
        process.exit(0);
      }
      console.error(chalk.red(`  Error: ${(err as Error).message}\n`));
    }
  }
}

main().catch((err) => {
  if (err.name === "ExitPromptError") process.exit(0);
  console.error(chalk.red(err.message));
  process.exit(1);
});

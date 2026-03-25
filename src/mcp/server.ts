#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCatalog } from "../core/cache.js";
import { searchIcons, browseIcons } from "../core/search.js";
import { fetchIconDetail } from "../core/scraper.js";
import { downloadIcon, downloadBatch } from "../core/downloader.js";
import { buildIconUrl, buildSearchUrl } from "../core/types.js";
import { resolve } from "node:path";

const server = new McpServer({
  name: "thiings",
  version: "1.0.0",
});

function formatIcon(i: { id: string; name: string; categories: string[]; imageUrl: string }) {
  return {
    id: i.id,
    name: i.name,
    categories: i.categories,
    imageUrl: i.imageUrl,
    url: buildIconUrl(i.id),
  };
}

// --- Tools ---

server.registerTool(
  "search_icons",
  {
    title: "Search Icons",
    description:
      "Search the thiings.co icon catalog by name or category. Returns matching icons with name, id, categories, image URL, and page URL.",
    inputSchema: {
      query: z.string().describe("Search query (icon name, keyword, or category)"),
      category: z
        .string()
        .optional()
        .describe("Filter by category name"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max results to return (default 20)"),
    },
  },
  async ({ query, category, limit }) => {
    const catalog = await getCatalog();
    const result = searchIcons(catalog.icons, query, { category, limit });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              total: result.total,
              showing: result.icons.length,
              query: result.query,
              searchUrl: buildSearchUrl(query),
              icons: result.icons.map(formatIcon),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "get_icon",
  {
    title: "Get Icon Details",
    description:
      "Get full details for a specific icon including description, categories, download URL, and page URL.",
    inputSchema: {
      id: z.string().describe("Icon ID (slug), e.g. 'worksite-floodlight'"),
    },
  },
  async ({ id }) => {
    const detail = await fetchIconDetail(id);
    if (!detail) {
      return {
        content: [
          { type: "text" as const, text: `Icon "${id}" not found.` },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: detail.id,
              name: detail.name,
              description: detail.description,
              categories: detail.categories,
              imageUrl: detail.imageUrl,
              url: buildIconUrl(detail.id),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "list_categories",
  {
    title: "List Categories",
    description:
      "List all available icon categories with the number of icons in each and a link to browse that category on thiings.co.",
    inputSchema: {},
  },
  async () => {
    const catalog = await getCatalog();
    const counts = new Map<string, number>();
    for (const icon of catalog.icons) {
      for (const cat of icon.categories) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    const categories = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, url: buildSearchUrl(name) }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ total: categories.length, categories }, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "browse_icons",
  {
    title: "Browse Icons",
    description:
      "Browse icons with optional category filter and pagination. Each icon includes its page URL.",
    inputSchema: {
      category: z.string().optional().describe("Filter by category"),
      page: z.number().optional().default(1).describe("Page number (default 1)"),
      pageSize: z
        .number()
        .optional()
        .default(20)
        .describe("Items per page (default 20)"),
    },
  },
  async ({ category, page, pageSize }) => {
    const catalog = await getCatalog();
    const result = browseIcons(catalog.icons, { category, page, pageSize });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              page: result.page,
              totalPages: result.totalPages,
              total: result.total,
              showing: result.icons.length,
              browseUrl: category ? buildSearchUrl(category) : `https://www.thiings.co/things`,
              icons: result.icons.map(formatIcon),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "download_icon",
  {
    title: "Download Icon",
    description: "Download a single icon PNG to a local directory.",
    inputSchema: {
      id: z.string().describe("Icon ID to download"),
      outputDir: z
        .string()
        .optional()
        .default("./thiings-icons")
        .describe("Output directory (default ./thiings-icons)"),
    },
  },
  async ({ id, outputDir }) => {
    const catalog = await getCatalog();
    const icon = catalog.icons.find((i) => i.id === id);
    if (!icon) {
      return {
        content: [
          { type: "text" as const, text: `Icon "${id}" not found in catalog.` },
        ],
      };
    }
    const dir = resolve(outputDir);
    const filePath = await downloadIcon(icon, dir);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              downloaded: true,
              filePath,
              icon: { id: icon.id, name: icon.name, url: buildIconUrl(icon.id) },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "download_icons",
  {
    title: "Batch Download Icons",
    description:
      "Download multiple icons by search query, category, or explicit IDs.",
    inputSchema: {
      query: z.string().optional().describe("Search query to find icons to download"),
      category: z.string().optional().describe("Category to download from"),
      ids: z
        .array(z.string())
        .optional()
        .describe("Specific icon IDs to download"),
      outputDir: z
        .string()
        .optional()
        .default("./thiings-icons")
        .describe("Output directory"),
    },
  },
  async ({ query, category, ids, outputDir }) => {
    const catalog = await getCatalog();
    let icons = catalog.icons;

    if (ids && ids.length > 0) {
      const idSet = new Set(ids);
      icons = icons.filter((i) => idSet.has(i.id));
    } else if (query) {
      const result = searchIcons(icons, query, { category, limit: 50 });
      icons = result.icons;
    } else if (category) {
      const cat = category.toLowerCase();
      icons = icons.filter((i) =>
        i.categories.some((c) => c.toLowerCase().includes(cat))
      );
    } else {
      return {
        content: [
          {
            type: "text" as const,
            text: "Please provide a query, category, or list of IDs to download.",
          },
        ],
      };
    }

    if (icons.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "No icons matched your criteria." },
        ],
      };
    }

    const dir = resolve(outputDir || "./thiings-icons");
    const result = await downloadBatch(icons, dir);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              downloaded: result.downloaded.length,
              failed: result.failed.length,
              outputDir: dir,
              files: result.downloaded,
              errors: result.failed.map((f) => ({
                id: f.icon.id,
                error: f.error,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Resources ---

server.resource("catalog", "thiings://catalog", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify((await getCatalog()).icons, null, 2),
    },
  ],
}));

server.resource(
  "icon",
  new ResourceTemplate("thiings://icon/{id}", { list: undefined }),
  async (uri, variables) => {
    const id = variables.id as string;
    const detail = await fetchIconDetail(id);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(detail, null, 2),
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Thiings MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

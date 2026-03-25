# Contributing to thiings-unofficial

Thanks for your interest. This guide covers the basics.

## Setup

1. Fork the repo and clone your fork
2. `npm install`
3. `npm run build` to compile TypeScript
4. `npm run cli` to test the CLI
5. `npm run mcp` to test the MCP server

The source lives in `src/`. The build output goes to `build/`. Don't commit `build/` or `node_modules/`.

## Project layout

- `src/core/` — shared logic (scraper, cache, search, downloader, types)
- `src/mcp/server.ts` — MCP server, registers tools and resources
- `src/cli/index.ts` — interactive CLI using inquirer

The core layer does the heavy lifting. Both the MCP server and CLI import from it. If you're fixing how search scoring works, you touch `src/core/search.ts`. If you're adding a new MCP tool, you edit `src/mcp/server.ts` and wire it to something in `src/core/`.

## How the scraper works

thiings.co has no public API. The scraper fetches the `/things` page, extracts icon data from the React Server Component flight payload, unescapes the JSON, and parses it. Individual icon pages (for descriptions) use the same approach but concatenate multiple `self.__next_f.push` chunks first.

If thiings.co changes their page structure, the scraper breaks. Regex patterns live in `src/core/scraper.ts` and are isolated for this reason.

## Making changes

1. Create a branch from `main`
2. Make your changes in `src/`
3. Run `npm run build` and verify it compiles clean
4. Test your changes with `npm run cli` or `npm run mcp`
5. Open a PR against `main`

## What makes a good PR

- One concern per PR. Don't mix a bug fix with a new feature.
- If you change the scraper, explain what broke and how you fixed it.
- If you add a new MCP tool, describe what it does and when you'd use it.
- Keep dependencies minimal. We avoid heavy libraries on purpose.

## Bug reports

Open an issue. Include:
- What you did (the command or MCP tool call)
- What you expected
- What you got instead
- Your Node.js version (`node --version`)

If the scraper broke because thiings.co changed their site, mention that. Those fixes tend to be small and focused.

## Code style

- TypeScript, ES modules (`"type": "module"` in package.json)
- No semicolons at end of statements (match existing style)
- Keep functions short. If a function is doing two things, split it.

## License

By contributing, you agree that your contributions fall under the MIT License in the LICENSE file.

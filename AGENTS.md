# AGENTS.md

## Project Overview

Chrome Extension (Side Panel) for visualizing Fanqie Novel short story analytics. Reuses official login state to fetch author's own works data, stores in IndexedDB, and displays as an interactive dashboard.

## Quick Commands

```bash
# Install dependencies
pnpm install

# Development (runs on 127.0.0.1:5173)
pnpm dev

# Build (TypeScript check + Vite build)
pnpm build

# Preview production build
pnpm preview
```

## Architecture

- **Chrome Extension**: Background service worker + Side Panel UI
- **Data Flow**: Official API → normalize → IndexedDB (Dexie) → React UI
- **Entry Points**:
  - UI: `src/ui/main.tsx` → `src/ui/pages/App.tsx`
  - Background: `src/background/index.ts`
  - Build output: `dist/` (manifest.json for extension loading)

## Key Files

| Path | Purpose |
|------|---------|
| `src/client/fanqieApi.ts` | Official API client (credentials: include) |
| `src/sync/fanqieSync.ts` | Data sync orchestration (pagination, rate limiting) |
| `src/sync/normalize.ts` | API response normalization |
| `src/db/schema.ts` | Dexie schema (works, workDailyStats, promotionMarks) |
| `src/domain/metrics.ts` | Scoring/aggregation logic |
| `src/shared/types.ts` | All TypeScript types |
| `src/ui/pages/App.tsx` | Main dashboard component (single-file) |

## Development Notes

- **No test framework** configured — no test commands available
- **No linting/formatting** — no eslint, prettier, or similar tools
- **No CI/CD** — no GitHub Actions workflows
- **Package manager**: pnpm (workspace configured but single package)
- **Chrome types**: `@types/chrome` in devDependencies, `types: ["chrome"]` in tsconfig
- **Build**: Two entry points (app + background), output to `dist/`
- **Dev server**: Binds to `127.0.0.1:5173` (not localhost)

## Data Model

IndexedDB database: `fanqie_short_story_panel`
- `works`: Platform work metadata
- `workDailyStats`: Daily metrics per work
- `promotionMarks`: User promotion tracking
- `syncState`: Sync status and timestamp

## Sync Constants

- Page size: 20 items
- Max pages: 20
- Sync period: 60 days
- Request delay: 250ms between API calls

## Common Pitfalls

- Extension APIs only work when loaded as Chrome extension (not plain dev server)
- `chrome.runtime.sendMessage` requires extension context
- Dev server uses `127.0.0.1` not `localhost`
- Mock data auto-seeds on first load if DB is empty

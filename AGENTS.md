# AGENTS.md

## Project Overview

Chrome Extension (Side Panel) for visualizing Fanqie Novel short story analytics. Reuses official login state to fetch author's own works data, stores in IndexedDB, and displays as an interactive dashboard.

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev server on 127.0.0.1:5173
pnpm build            # TypeScript check + Vite build → dist/
pnpm preview          # Preview production build
```

## Architecture

- **Chrome Extension**: Background service worker + Side Panel UI
- **Data Flow**: Official API → normalize → IndexedDB (Dexie) → React UI
- **Entry Points**:
  - UI: `src/ui/main.tsx` → `src/ui/pages/App.tsx`
  - Background: `src/background/index.ts`
  - Build output: `dist/` (load as unpacked extension)

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

## Known API Issues

- **`singleByDate` endpoint returns 400** — code falls back to `singleCommon` (cumulative stats)
- **`multi_title` is an array** `['标题']` not a string — `firstString()` in normalize.ts handles this
- **`finishedReaders` field missing** from `singleCommon` response — always shows 0
- **All cumulative stats stored with same date** (yesterday) — date range filtering has no effect
- **Many API fields return empty strings `""`** — `asNumber()` returns `undefined` for these

## Development Notes

- **No test framework** — no test commands available
- **No linting/formatting** — no eslint, prettier
- **No CI/CD** — no GitHub Actions
- **Package manager**: pnpm
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
- After modifying background script, must reload extension in chrome://extensions

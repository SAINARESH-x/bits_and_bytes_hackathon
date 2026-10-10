# DigSync

> **Simulated demo data — not real projects.** Every project, department,
> contractor, budget and citizen report in this app is fictional. See
> [Simulated data disclosure](#simulated-data-disclosure).

## Problem

Residents see roads dug up, drains repaired and pipelines laid every day, but
rarely know what is being done, by whom, how long it will take, or why a
deadline slipped. Information is scattered across offices, notice boards and
informal channels. Departments themselves often work without knowing what the
others have planned, so the same road gets opened several times in a few
months — traffic disruption, safety hazards, wasted public money and lost
trust.

## Solution

DigSync is a public registry plus a coordination layer for civic works. It puts
every project on one map with its department, contractor, purpose, planned vs
actual dates and delay reason, and adds a **clash-detection engine** that flags
two specific failure modes:

1. **Concurrent overlap** — different departments working on the same or an
   adjacent road at the same time, which is an opportunity to coordinate.
2. **Repeat dig** — work starting within 180 days of a road being restored,
   which is wasted money.

For each clash it proposes a coordinated schedule (merge the two works into one
shared window, or batch the later dig with the next planned one) so the road is
opened once instead of twice. Citizens can follow projects, report issues with a
geotagged photo (including digs that are not listed anywhere) and confirm or
dispute whether a job marked "completed" is really finished.

## Features

_(Built across milestones M1–M8.)_

- **M1 (done):** Next.js App Router + TypeScript + Tailwind scaffold, root
  layout with nav and a persistent "Simulated demo data" banner, home page,
  Leaflet map shell loaded client-side only, `/api/health` mode endpoint,
  demo-mode data layer falling back to `data/seed.json`.
- **M2 (done):** Postgres schema, simulated seed dataset (39 projects, road
  segments, updates, citizen reports) and the data-access layer with
  Supabase ⇄ demo auto-switching.
- **M3 (done): public registry.** `/map` draws one polyline per road segment
  with a status legend that never relies on colour alone (glyph + line style +
  colour) and a click popup linking to the project; a shareable filter bar
  (department, status, type, ward, date range, text search) stored in the URL
  query string; `/projects` as a sortable table on desktop and cards with a
  **Map | List** toggle on mobile; `/projects/[id]` with purpose, contractor,
  simulated budget, a shared-axis **PLANNED vs ACTUAL** timeline showing delay
  days, the updates feed with delay reasons, and citizen reports. An
  **Upcoming disruptions** panel lists works starting or active in the next 30
  days, filterable by ward. Every screen has loading, empty and error states.
- **M4 (done): clash-detection engine + clash board.** `lib/clash/` is a pure,
  unit-tested module (no UI, no database, no framework imports) that takes the
  registry plus road geometry and returns clashes, 3+-way clusters and a list of
  rows it could not check. It buckets projects by road segment and grid cell
  before sweeping dates, so 500 projects are analysed in milliseconds rather
  than naively comparing every pair. Results appear on `/clashes` grouped by
  severity with a plain-language "why flagged", the simulated cost at risk, a
  proposed coordinated window, a zoomable map of the road and a severity filter;
  as **⚠ badges on the map polylines**; as clash counts in the project list and
  table; and as a **Clash alerts** section on every project page. `GET
  /api/clashes` serves the same board as cacheable JSON.
- Live clash preview while creating/editing a project. _(M5.)_
- Citizen layer: follow, geotagged issue reports, confirm/dispute completion.
  _(M6 — placeholder on the detail page.)_
- Transparency dashboard: delays, repeat digs, contested completions,
  per-department scorecard.

## How the clash engine decides

The engine is a pure function — `detectClashes(projects, segments, options)` —
so the same registry always yields the same board, and every rule is testable
without a browser or a database.

- **Which dates:** actual dates where they exist, planned dates otherwise.
  Rows with missing, unparseable (`2026-02-30`) or inverted dates are reported in
  a `skipped` list with a reason instead of being silently dropped or throwing.
- **Which roads count as "the same":** the same road segment, or two segments
  whose geometries come within **50 m** of each other (adjacency radius).
- **Concurrent overlap:** spatially related, two different departments, and the
  two windows intersect for at least one day (touching dates — one road opening
  as the other closes — count as a 1-day overlap).
- **Repeat dig:** a work starts between 1 and **180 days** after a related work
  finished restoring the road.
- **Severity** is scored 0–100 from how long the works overlap (0–35), how short
  the repeat-dig gap is (0–25), how large the budgets involved are (0–25) and how
  many works share the road (0–20), then banded high / medium / low. Same
  department pairs are always low severity unless the caller opts in.
- **3+ way conflicts** are grouped into one cluster (stable id, no duplicated
  pairs) rather than being reported as a pile of two-way cards.

Distances are computed with hand-written haversine and point-to-segment maths in
a local metre frame — **no `turf.js` dependency** — which is also the honest
disclosure that no spatial library is doing the work.

## Architecture

```
app/(public)/           Public routes: /, /map, /projects, /projects/[id], /clashes
app/(public)/*/loading, error, not-found
                        Per-route skeleton, retryable error and 404 states
app/api/health/         Health endpoint reporting demo | supabase mode
app/api/clashes/        GET the computed clash board as cacheable JSON
components/             UI. Leaflet lives behind next/dynamic (ssr: false);
                        the legend and text list render in server HTML
lib/data.ts             Data access: Supabase when configured, seed.json otherwise
lib/filters.ts          Pure filter/sort state shared by /map and /projects
lib/map-lines.ts        Pure polyline builder: groups projects per segment and
                        offsets overlapping lines so each stays clickable
lib/geometry.ts         Pure geometry helpers (perpendicular offset, midpoint)
lib/format.ts           Date/delay/number formatting and status → style maps
lib/clash/              Pure clash-detection engine (no UI or DB imports)
lib/clash-view.ts       Pure clash helpers shared by server and browser
lib/clashes.ts          Server-side loader: registry + engine → board payload
lib/supabase/           Supabase client factory (returns null without env vars)
lib/types.ts            Shared domain types
data/seed.json          Simulated dataset backing demo mode
supabase/schema.sql     Postgres schema (optional — demo mode needs no DB)
scripts/verify-*.mjs    End-to-end checks (server HTML + headless Chrome)
tests/                  Vitest unit tests
```

Data flow: server components read through `lib/data.ts`, which returns
`data/seed.json` when Supabase env vars are absent or the database is
unreachable (3 s timeout, then fall back). Mutation endpoints re-validate every
payload with Zod on both client and server.

## Open-source libraries & APIs

_(Disclosure is required by the hackathon rules; this list is kept current
with `package.json`.)_

- [Next.js](https://nextjs.org) 15.5.27 — App Router, MIT
- [React](https://react.dev) 19.1.0 — MIT
- [Tailwind CSS](https://tailwindcss.com) 4 — MIT
- [TypeScript](https://www.typescriptlang.org) — Apache-2.0
- [Supabase JS](https://github.com/supabase/supabase-js) — Apache-2.0
- [Leaflet](https://leafletjs.com) 1.9.4 — BSD-2-Clause
- [react-leaflet](https://github.com/PaulLeCam/react-leaflet) 5.0.0 — MIT
- [Recharts](https://recharts.org) — MIT
- [Zod](https://zod.dev) — MIT
- [Vitest](https://vitest.dev) — MIT
- [ESLint](https://eslint.org) + eslint-config-next — MIT
- **OpenStreetMap tiles** — © OpenStreetMap contributors, ODbL. Attributed on
  the map itself.

Not used, deliberately: **no `turf.js`** (or any spatial library). The clash
engine's distance maths — haversine plus point-to-segment proximity in a local
metre frame — is hand-written in `lib/clash/geo.ts` and unit-tested, so the
spatial logic is inspectable and adds no dependency.

## Setup

```sh
git clone git@github.com:SAINARESH-x/bits_and_bytes_hackathon.git
cd bits_and_bytes_hackathon
npm install
cp .env.example .env.local   # optional — leave blank for demo mode
npm run dev                  # http://localhost:3000
```

Scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `node scripts/verify-m3.mjs` | Server-HTML checks (start `npm start` first) |
| `node scripts/verify-m4.mjs` | Clash-board checks: API shape, ordering, badges |
| `node scripts/verify-browser.mjs` | Headless-Chrome UI checks (start `npm start` first) |

The `verify-*` scripts expect a production server on port 3100:

```sh
npm run build
(npx next start -p 3100 > /tmp/digsync-server.log 2>&1 &)
node scripts/verify-m3.mjs      # server-rendered HTML
node scripts/verify-m4.mjs      # clash API + clash board + badges
node scripts/verify-browser.mjs # real browser: popups, filters, sort, toggle
```

Health check (demo mode is the default with no env vars set):

```sh
curl http://localhost:3000/api/health
# {"ok":true,"mode":"demo","timestamp":"..."}
```

The clash board is available as JSON — cached for 60 s, since it is a pure
function of the registry:

```sh
curl http://localhost:3000/api/clashes | head -c 200
# {"clashes":[...],"clusters":[...],"skipped":[],"counts":{...},"mode":"demo",...}
```

## Tests

`npm test` runs the Vitest suite. The clash engine carries the heaviest coverage
(`tests/clash.test.ts`): identical-segment and adjacent-segment overlaps,
non-overlapping windows, touching dates (one road opening as another closes),
repeat digs inside and outside the 180-day window, same-department pairs,
cancelled and inverted rows, missing dates, empty input, a 3-way cluster with no
duplicated pairs, determinism (same input → same order), a 500-project
performance budget, and the flagship seed story (a water pipeline on Amber
Garden Road followed by a power cable 91 days later). `tests/clash-view.test.ts`
covers the browser-safe helpers and the API payload summary.

## Demo video

_A 2–5 minute walkthrough will be committed here._

## Simulated data disclosure

**All project, department, contractor, budget and citizen-report data in this
application is SIMULATED.** Nothing here refers to a real municipal project,
department or contractor. Road names are fictional and department names are
deliberately generic. Every record carries `is_simulated = true`, the UI shows
a persistent "Simulated demo data — not real projects" banner, and
`/api/health` reports which data mode the app is in. Cost figures produced by the
clash engine are labelled "(simulated estimate)" wherever they appear, and the
clash board and `GET /api/clashes` name the source they were computed from.
Simulated data is never presented as real.

## Future scope

- Real municipal/utility APIs and contractor GSTIN verification.
- Field-officer mobile app with GPS proof-of-work photos.
- SMS/WhatsApp/push alerts when a followed project changes.
- Weighted crowd verification and moderation for reports.
- ML delay prediction and budget-waste estimation; Open311 export.
- Multi-city, multilingual, offline PWA; PostGIS spatial indexing; public API;
  RLS + audit logs; AR "what was dug here" history.

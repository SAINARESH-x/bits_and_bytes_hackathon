Read AGENTS.md. One datapoint I pulled from the machine to pick a tier: it's now 01:58 IST, 10 Oct, so roughly 18 hours to the 8:00 PM deadline. Reserving the final 90 minutes leaves ~16.5 h of build. Below is the plan.
Assumptions (stated, not asked): repo is empty; stack per AGENTS.md is kept; locality is the central-Chennai area (coords only — road/department/contractor names stay fictional per the data-honesty rule); team is 2–3 people able to parallelize dashboard/map work. These don't change the architecture. My only real ask is at the very end.
1. TIER
L (>10h). With ~16.5 h build / 90 min final reserve, all of M1–M8 are in. The only things deliberately out regardless: real municipal integrations, email/push notifications, multi-city, audit history, offline PWA. Everything else is in but guarded by the cut list in §8.
2. SCOPE
Must-have (6):
#	Feature	Judging criterion it earns
1	Public map + list + project detail (dept, contractor, purpose, planned vs actual, status, delay reason)	Feasibility (usability), Technical impl., Deployment
2	Clash engine (pure + tested) + coordinated-schedule suggestion	Technical impl. 35% (depth/system design), Innovation
3	Live clash preview in create/edit flow	Innovation, Technical impl.
4	Citizen layer: follow, report issue w/ geotagged photo (incl. unlisted works), confirm/dispute completion	Innovation, real-world-applicability extra credit, Feasibility
5	Transparency dashboard (delays, repeat digs, contested completions, per-dept scorecard)	Innovation, "meaningful use of data" extra credit
6	Public deploy + README + persistent "Simulated demo data" labeling	Deployment 10%, avoids disqualification
Should-have: Supabase Auth with roles; Recharts charts; filters/search; unlisted-report moderation queue.
Cut list (drop first): real auth → role-switch in demo; photo Storage → data-URL; dashboard charts → numeric scorecards; map geometry → point markers only.
3. ARCHITECTURE
Folders
app/(public)/page.tsx              map + list
app/(public)/projects/[id]/page.tsx  detail + follow + confirm/dispute
app/(public)/report/page.tsx       report unlisted work (geotag)
app/(public)/dashboard/page.tsx    transparency dashboard
app/(official)/projects/new/page.tsx   create (live clash preview)
app/(official)/projects/[id]/edit/page.tsx  edit (live clash preview)
app/api/projects/route.ts          GET list / POST create
app/api/projects/[id]/route.ts     PATCH / DELETE
app/api/clash/preview/route.ts     POST draft project -> clash result
app/api/reports/route.ts           POST/GET citizen reports
app/api/projects/[id]/verdicts/route.ts  POST confirm/dispute
app/api/follows/route.ts           POST/DELETE
lib/clash/                         PURE engine + *.test.ts
lib/data.ts                        demo/Supabase switch
lib/validation/                    Zod schemas (shared client+server)
lib/supabase/                      client/server factories
data/seed.json
components/                        map, project-card, banner, forms
middleware.ts                      guard /official/*
Data model (Supabase Postgres; all rows is_simulated boolean default true)
- departments(id uuid pk, name text, code text) — generic names.
- contractors(id uuid pk, name text).
- corridors(id uuid pk, road_name text, locality text, lat float8, lng float8, adjacency text[] ) — adjacency = ids of nearby corridors (precomputed).
- projects(id uuid pk, corridor_id fk, department_id fk, contractor_id fk, title text, purpose text, utility_type enum(road|drain|water|power|fibre), status enum(planned|in_progress|completed|stalled|cancelled), planned_start date, planned_end date, actual_start date, actual_end date, restored_at date, budget_inr numeric, delay_reason text, created_at, updated_at).
- citizen_reports(id uuid pk, project_id fk nullable, lat float8, lng float8, category text, description text, photo_url text, created_at) — null project_id = unlisted work.
- verdicts(id uuid pk, project_id fk, user_id fk nullable, verdict enum(confirm|dispute|partial), comment text, created_at).
- follows(id uuid pk, project_id fk, user_id fk nullable, created_at).
- profiles(id fk auth.users, role enum(citizen|official|admin), department_id fk nullable, display_name text).
Relations: project → corridor/department/contractor; clashes are computed between two projects (not stored in M-tier; optional clash_reports materialization later); reports → project (or standalone); verdicts/follows → project + user.
Routes/actions: public reads via server components calling lib/data.ts; all mutations via Route Handlers that re-validate with the shared Zod schemas (never trust client). /api/clash/preview calls the pure engine directly.
Auth + roles: Supabase magic-link (or anonymous), profiles.role; middleware.ts gates /official/*. Demo mode (no Supabase env): a cookie-based role switch + local seed store so the whole flow is demonstrable without login.
Storage: Supabase Storage bucket report-photos; demo fallback stores the image as a data URL in data/seed.json/localStorage.
4. CLASH ENGINE SPEC
Pure module lib/clash/ — no UI/DB imports. Functions: detectClashes(draft, existing, config): ClashResult.
Types
type UtilityType = 'road'|'drain'|'water'|'power'|'fibre'
interface WorkWindow { id: string; corridorId: string; departmentId: string;
  status: string; plannedStart?: string; plannedEnd?: string;
  actualEnd?: string; restoredAt?: string; budgetInr?: number; utility: UtilityType }
type ClashType = 'time_overlap' | 'repeat_dig'
type Severity = 'low'|'medium'|'high'|'critical'
interface ClashPair { type: ClashType; a: string; b: string; severity: Severity;
  overlapDays: number; gapDays: number; sameCorridor: boolean; reason: string }
interface Suggestion { action:'coordinate'|'defer'|'merge'|'none';
  proposedStart?: string; proposedEnd?: string; rationale: string;
  savesDig: boolean; estSavingsInr?: number }
interface ClashResult { pairs: ClashPair[]; clusterCount: number; topSeverity: Severity;
  suggestions: Suggestion[]; warnings: string[] }
Rules
- Spatial adjacency: same corridorId → sameCorridor=true. Else adjacent if the corridor is in the project's adjacency list (precomputed ≤ ~60 m). Distant → not a clash.
- Time overlap: min(endA,endB) > max(startA,startB) in date-only UTC; overlapDays = diff. Zero-length window = a point; overlaps only if strictly inside the other.
- Repeat dig: project B (or A) has restoredAt/actualEnd, and the other's plannedStart is after restore and within REPEAT_GAP_DAYS (default 180). gapDays = plannedStart − restore.
- Same-department: still detected but tagged reason:"intra-department" and severity capped at medium.
Severity (0–100 then banded): score = w_overlap*min(overlapDays,90)/90*40 + utilityWeight[type]*25 + sameCorridor?15:8 + proximity(repeat: gapDays→180)*20. utilityWeight: road 1.0 (trenching on a road is most disruptive), water 0.9, drain 0.85, power 0.7, fibre 0.5. Bands: ≥75 critical, ≥50 high, ≥25 medium, else low.
Coordination suggestion: for time_overlap on sameCorridor → merge into one window [min(starts), max(ends)] (one dig, two works). For repeat_dig → defer B to restoredAt + COORDINATION_BUFFER_DAYS (default 7) so works are batched, savesDig=true, estSavingsInr ≈ min(budgetA,budgetB)*0.6 (trench/restore share). Else coordinate.
Edge cases: cancelled projects excluded; missing plannedStart/plannedEnd → skip time rules + warnings:"missing-dates"; inverted (start>end) → warnings:"inverted-dates", do not crash, do not auto-swap; zero-length windows as above; many-way clashes on one corridor → clustered, pairwise list capped to top-N by severity with clusterCount; null/undefined geometry ignored.
Complexity/scaling: corridor-indexed compare → near O(n·k) where k = corridor + adjacency neighbours; the live preview is O(n) (draft vs index). Naive upper bound O(n²), fine for a few hundred seeded rows. Scales to PostGIS/GiST on (corridor_id, daterange) or a materialized clash_reports view refreshed nightly.
5. MILESTONES
Build window 02:00–18:30 IST; final 18:30–20:00 reserved for hardening + deploy verification + README + video.
#	Budget	Scope	Acceptance / demoable
M1	1.5h	create-next-app (TS, Tailwind, App Router, ESLint), Vitest, data/seed.json stub, lib/data.ts demo mode, simulated banner, .env.example, deploy to Vercel	Public URL shows banner + empty list. (Satisfies "M1 ends deployed.")
M2	1.5h	Seed data + project list + detail (planned vs actual, status, delay reason) + loading/empty/error	Browse all seeded projects
M3	2.5h	lib/clash/ pure engine + Vitest suite (overlap, repeat, adjacency, same-dept, invalid dates, many-way)	npm test green; engine demonstrable
M4	2.0h	react-leaflet map (client-only) + list/map toggle + filters (dept/status/utility)	Map renders markers, filters work
M5	2.5h	Official create/edit with live clash preview + coordinated schedule; Zod client+server; persistence (Supabase or demo)	Create a project → clashes + suggestion appear
M6	2.0h	Citizen layer: follow, geotagged report (incl. unlisted), confirm/dispute completion	Full citizen loop works
M7	2.0h	Dashboard: delays, repeat digs, contested completions, per-dept scorecard (+Recharts)	Dashboard shows live numbers
M8	1.5h	Hardening, a11y, README, deploy re-verify	build+lint+typecheck+test all clean
RESERVE	90m	Final hardening, deploy check, README polish, record 3-min video, submit	Submitted before 20:00
Slack: budgets total 15.5 h vs 16.5 h available → ~1 h buffer for the inevitable Supabase/Leaflet snags.
6. EDGE CASES + ROBUSTNESS CHECKLIST
- Clash: missing/inverted/zero-length dates, cancelled excluded, same-dept, many-way clustering, null geometry (per §4).
- SSR: Leaflet and Recharts loaded via dynamic(..., { ssr:false }); app must build with no window errors.
- Offline/degraded: tiles or Supabase unreachable → list still renders from data/seed.json; Supabase calls wrapped in AbortController (3 s timeout).
- Geolocation: permission denied/timeout → manual lat-lng entry, clear message.
- Uploads: non-image/oversize/file failure → rejected with message; data-URL fallback.
- Empty DB: every screen has an empty state (no crash).
- Double submit: disable buttons, idempotent create.
- Auth: unauthenticated → /official/* redirects; role unset handled.
- Errors: app/error.tsx, app/not-found.tsx, app/loading.tsx; zero unhandled rejections.
- Validation: shared Zod on client and server.
- Formatting: INR number formatting, long text truncation.
- A11y: labels, focus rings, contrast, alt text, keyboard-accessible map controls/lists.
- Security: secrets only in env; RLS on Supabase tables; never commit .env.
7. SIMULATED DATA PLAN
- Corridors: 10 fictional, around 13.08°N/80.27°E (central Chennai), each with an adjacency list.
- Departments (generic): Roads & Infrastructure; Water Works; Stormwater Drains; Electricity Board; Telecom/Fibre.
- Contractors: 6 fictional. Projects: ~30 across statuses and utility types.
- Planted clash scenarios (each deterministic, so the engine's output is stable for demo + tests):
1. Flagship: Road A restored 05 Jan 2026 (Roads) → Fibre starts 20 Jan (repeat dig, ~15-day gap) and Water overlaps in time → multi-way clash on one corridor with a merge + defer suggestion.
2. Electricity + Water overlapping on the same corridor → time_overlap, high severity.
3. Repeat dig near the 180-day threshold (must stay flagged).
4. Two works on adjacent (not same) corridors ~50 m apart.
5. A completed project with citizen disputes (contested completion).
6. A delayed project with a delay reason.
7. A cancelled project (proves exclusion).
8. A record with inverted dates (proves graceful degradation).
- Labeling: is_simulated:true on every row, persistent banner, README disclosure, fictional names only.
8. RISKS + FALLBACKS (top 6)
1. Supabase setup/auth friction → ship demo mode (lib/data.ts switch); Supabase optional. Cut first: real auth.
2. Leaflet SSR/build breakage → dynamic import ssr:false; fallback to plain list. Cut: map geometry.
3. Time overrun → drop should-haves; protect engine + map + dashboard + deploy.
4. Vercel env/deploy issues → deploy at M1, keep demo mode so the URL always works.
5. Photo storage failing → data-URL/localStorage fallback.
6. Engine over-engineering → keep to the deterministic rules in §4.
Cut order if behind: dashboard charts → auth/roles → map geometry (points only) → dispute/confirm.
9. DEMO VIDEO OUTLINE (3 min, shot-by-shot)
Time	Shot
0:00–0:15	Problem: same road dug up again; nobody knows who/why.
0:15–0:30	Intro DigSync + "simulated demo data" banner on screen.
0:30–1:00	Public map + list; open a project detail (planned vs actual, delay reason).
1:00–1:45	Flagship clash story: open the corridor → engine flags repeat-dig + overlap, shows severity + coordinated schedule.
1:45–2:20	Citizen flow: follow, file a geotagged report on an unlisted work, confirm/dispute a "completed" job.
2:20–2:45	Transparency dashboard: delays, repeat digs, contested completions, per-dept scorecard.
2:45–3:00	Public URL, README disclosure, future scope.
10. FUTURE SCOPE (Feasibility + README)
- Real municipal/utility APIs and contractor GSTIN verification.
- Field-officer mobile app with GPS proof-of-work photos.
- SMS/WhatsApp/push alerts when a followed project changes.
- Weighted crowd verification + moderation for reports.
- ML delay prediction and budget-waste estimation; Open311 export.
- Multi-city, multilingual, offline PWA; PostGIS spatial indexing; public API; RLS + audit logs; AR "what was dug here" history.

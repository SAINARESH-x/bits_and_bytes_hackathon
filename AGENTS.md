# AGENTS.md — DigSync (hackathon build)

## Context

IIITDM Kancheepuram 24-hour hackathon, **CivicTech** track: *Improving Transparency
and Coordination in Public Works Projects* (team **BITSANDBYTES**).

- **HARD DEADLINE: 8:00 PM IST, 10 Oct** (working target — the official brief says dev
  window ends 8:30 PM / submissions close 9:00 PM; use the earlier time to be safe).
- Judging: Innovation 20%, Technical implementation 35% (depth, code quality,
  robustness, edge cases, system design), Feasibility 20%, Demo video 15%,
  Public deployment 10%.
- **A working, deployed, demoable app beats a big half-working one.**

## Product (DigSync)

Public registry + coordination layer for public works (roads, drains, water
pipelines, power cables, fibre). Core features:

1. Public map + list of projects (department, contractor, purpose, planned vs
   actual dates, status, delay reasons).
2. **Clash detection engine:** flags works by different departments on the same or
   adjacent road that (a) overlap in time → coordinate, or (b) start soon after the
   road was restored → repeat dig / wasted money. Proposes a coordinated schedule.
   Departments see a **live clash preview** while creating/editing a project.
3. **Citizen layer:** follow projects, report issues with geotagged photo (including
   **unlisted works**), confirm/dispute that a "completed" job is really done.
4. **Transparency dashboard:** delays, repeat digs, contested completions,
   per-department scorecard.

## Stack

Next.js (App Router) + TypeScript + Tailwind; Supabase (Postgres/Auth/Storage) free
tier; Leaflet + OpenStreetMap tiles (`react-leaflet`, **client-side only** to avoid
SSR errors); Recharts; Zod for validation; Vitest for tests. Free tiers only — **no
paid services. Do not add dependencies without saying why.**

## Repo layout contract

- `lib/clash/` — **pure** clash-detection module. No UI or DB imports. Unit-tested.
  This is the highest-weighted logic; keep it isolated.
- `lib/data.ts` — data-access layer. Automatically switches to **demo mode** from
  `data/seed.json` when Supabase env vars are missing or the DB is unreachable.
- `data/seed.json` — simulated records backing demo mode.
- `README.md` — must list **every** library / API / dataset used (disclosure required).

The repo starts empty; this layout is the intended structure.

## Data honesty (IMPORTANT)

All project, department, contractor, budget and citizen-report data is **SIMULATED**.

- Every record carries `is_simulated=true`.
- Persistent **"Simulated demo data"** banner in the UI, and state it in the README.
- Never present simulated data as real. Use fictional road names and generic
  department names.

## Working rules

- Work in **small vertical slices**. After each slice the app builds and runs.
- Before declaring anything done: run **build, lint, type-check and tests**; fix every
  failure. Never leave the app broken. Commit after each working milestone with a
  clear message.
- Handle **loading, empty and error states** on every screen. Validate inputs on
  **client AND server** (Zod). No unhandled promise rejections.
- Every external call (Supabase, geolocation, tiles) has a **timeout/error path**. The
  app must still work in demo mode from `data/seed.json`.
- **Secrets only in env vars.** Keep `.env.example` current. Never commit secrets.
- Mobile-first, accessible UI (labels, contrast, keyboard, alt text).
- Clear folders, small functions, TypeScript types, comments only where the "why" is
  not obvious.
- **Do not expand scope beyond the current task.** Suggest extras at the end instead.

## Definition of done (per task)

Builds cleanly, runs locally, edge cases handled, tests pass, committed, and you tell
the user exactly how to verify it in under 1 minute.

## Hackathon submission requirements

- **Deployment is mandatory** (10% of score): public link, no local setup for judges.
- README required: problem, solution, setup.
- **2–5 minute demo video committed into the repo.**
- Disclose all open-source libraries / APIs.
- Built during the hackathon window; fake/non-working demos → disqualification.
- Only the team leader submits, via the organizers' Google Form.

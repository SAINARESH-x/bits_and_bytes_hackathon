-- DigSync schema — Supabase Postgres
--
-- EVERY row in this database is SIMULATED demo data. Nothing here describes a
-- real project, department or contractor. See AGENTS.md "Data honesty".
--
-- This file is the source of truth for the schema; run it in the Supabase SQL
-- editor if you want the real Postgres path. The app works without it (demo
-- mode reads data/seed.json), so this is optional.

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_simulated boolean not null default true
);

create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_simulated boolean not null default true
);

create table if not exists corridors (
  id uuid primary key default gen_random_uuid(),
  road_name text not null,
  locality text not null,
  lat double precision not null,
  lng double precision not null,
  -- ids of nearby corridors (precomputed, <= ~60m) used for adjacency clashes
  adjacency text[] not null default '{}',
  is_simulated boolean not null default true
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  corridor_id uuid not null references corridors (id),
  department_id uuid not null references departments (id),
  contractor_id uuid references contractors (id),
  title text not null,
  purpose text not null,
  utility_type text not null
    check (utility_type in ('road', 'drain', 'water', 'power', 'fibre')),
  status text not null
    check (status in ('planned', 'in_progress', 'completed', 'stalled', 'cancelled')),
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  restored_at date,
  budget_inr numeric,
  delay_reason text,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_corridor_idx on projects (corridor_id);
create index if not exists projects_department_idx on projects (department_id);
create index if not exists projects_status_idx on projects (status);

-- project_id is NULL for an UNLISTED work found by a citizen.
create table if not exists citizen_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects (id),
  lat double precision not null,
  lng double precision not null,
  category text not null,
  description text not null,
  photo_url text,
  created_at timestamptz not null default now(),
  is_simulated boolean not null default true
);

create table if not exists verdicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  user_id uuid,
  verdict text not null check (verdict in ('confirm', 'dispute', 'partial')),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  user_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'citizen'
    check (role in ('citizen', 'official', 'admin')),
  department_id uuid references departments (id),
  display_name text
);

-- RLS: these tables are demo-scoped. Tighten further once real auth lands in M5.
alter table departments enable row level security;
alter table contractors enable row level security;
alter table corridors enable row level security;
alter table projects enable row level security;
alter table citizen_reports enable row level security;
alter table verdicts enable row level security;
alter table follows enable row level security;
alter table profiles enable row level security;

create policy "public read simulated data" on projects for select using (true);
create policy "public read corridors" on corridors for select using (true);
create policy "public read departments" on departments for select using (true);
create policy "public read contractors" on contractors for select using (true);
create policy "public read reports" on citizen_reports for select using (true);

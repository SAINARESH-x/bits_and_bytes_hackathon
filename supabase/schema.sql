-- DigSync schema — Supabase Postgres
--
-- EVERY row in this database is SIMULATED demo data. Nothing here describes a
-- real project, department or contractor. See AGENTS.md "Data honesty".
--
-- Run this in the Supabase SQL editor (or `psql -f`). The app works without a
-- database — demo mode reads data/seed.json — so this file is optional.
--
-- IDEMPOTENT: drops and recreates everything. Safe to re-run. Wipes data.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

drop type if exists project_type cascade;
create type project_type as enum
  ('road', 'drain', 'water_pipeline', 'power_cable', 'fibre', 'other');

drop type if exists project_status cascade;
create type project_status as enum
  ('planned', 'in_progress', 'stalled', 'completed', 'cancelled');

-- Why a project slipped. Append-only on project_updates.
drop type if exists delay_reason cascade;
create type delay_reason as enum
  ('contractor_delay',
   'monsoon',
   'permit_pending',
   'material_shortage',
   'utility_conflict',
   'redesign',
   'budget_held',
   'unforeseen_ground_condition',
   'other');

drop type if exists report_type cascade;
create type report_type as enum
  ('unsafe_barricade',
   'work_stalled',
   'poor_road_restoration',
   'debris_dust_noise',
   'unlisted_work',
   'other');

drop type if exists verification_vote cascade;
create type verification_vote as enum ('confirm', 'dispute');

drop type if exists profile_role cascade;
create type profile_role as enum ('admin', 'department');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

drop table if exists verifications cascade;
drop table if exists citizen_reports cascade;
drop table if exists project_updates cascade;
drop table if exists projects cascade;
drop table if exists road_segments cascade;
drop table if exists departments cascade;
drop table if exists profiles cascade;

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now()
);

-- A stretch of road. `geometry` is a GeoJSON LineString in EPSG:4326
-- (lon, lat). Stored as jsonb rather than PostGIS geometry so the app needs
-- no extension; the GIN index below still makes containment queries cheap.
create table road_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ward text not null,
  geometry jsonb not null,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(),
  constraint geometry_is_linestring
    check (geometry->>'type' = 'LineString')
);

-- Contractor is a free-text name, not a table: for this demo the registry
-- never needs contractor attributes, and a join would just add a failure mode.
create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  purpose text not null,
  project_type project_type not null,
  department_id uuid not null references departments (id),
  contractor_name text,
  road_segment_id uuid not null references road_segments (id),
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  status project_status not null default 'planned',
  budget_inr numeric(14, 2),
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(),
  -- NULLs are allowed (a project may have no plan yet); when both dates exist
  -- the window must not be inverted.
  constraint planned_window_ordered
    check (planned_end is null or planned_start is null
           or planned_end >= planned_start),
  constraint actual_window_ordered
    check (actual_end is null or actual_start is null
           or actual_end >= actual_start),
  constraint budget_positive
    check (budget_inr is null or budget_inr >= 0)
);

-- Append-only status log. Rows are never updated or deleted — this is the
-- audit trail that lets a dashboard show "why is this late".
create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  status project_status not null,
  note text,
  delay_reason delay_reason,
  new_planned_end date,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now()
);

-- project_id is NULL for an UNLISTED work: a citizen spotted digging that is
-- not in the registry at all. That gap is the whole point of this table.
create table citizen_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects (id) on delete set null,
  report_type report_type not null,
  description text not null,
  photo_url text,
  lat double precision not null,
  lng double precision not null,
  is_unlisted_work boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lat_in_range check (lat between -90 and 90),
  constraint lng_in_range check (lng between -180 and 180),
  -- An unlisted report, by definition, points at no project.
  constraint unlisted_has_no_project
    check (not is_unlisted_work or project_id is null)
);

-- One vote per device per project. `device_id` is a client-generated UUID in
-- localStorage — deliberately not auth, so citizens can vote anonymously.
create table verifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  vote verification_vote not null,
  device_id uuid not null,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(),
  constraint one_vote_per_device unique (project_id, device_id)
);

-- Role gate for the official create/edit flow (M5).
-- id is a plain uuid rather than a FK to auth.users so this schema also runs
-- on a bare Postgres without the auth schema.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  role profile_role not null default 'department',
  department_id uuid references departments (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes — the clash engine joins projects on segment + date window, so
-- those two carry the most weight.
-- ---------------------------------------------------------------------------

create index projects_segment_idx on projects (road_segment_id);
create index projects_department_idx on projects (department_id);
create index projects_status_idx on projects (status);
create index projects_planned_start_idx on projects (planned_start);
create index projects_segment_start_idx on projects (road_segment_id, planned_start);

create index project_updates_project_idx on project_updates (project_id);
create index project_updates_created_idx on project_updates (created_at);

create index citizen_reports_project_idx on citizen_reports (project_id)
  where project_id is not null;
create index citizen_reports_unlisted_idx on citizen_reports (is_unlisted_work);
create index citizen_reports_created_idx on citizen_reports (created_at);

create index verifications_project_idx on verifications (project_id);

-- jsonb GIN index; works without PostGIS.
create index road_segments_geometry_idx on road_segments using gin (geometry);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- This is a public read-only registry. Everyone may read; nobody writes via
-- the anon key. Writes go through server route handlers that use the
-- service-role key (which bypasses RLS) after Zod validation.
-- ---------------------------------------------------------------------------

alter table departments enable row level security;
alter table road_segments enable row level security;
alter table projects enable row level security;
alter table project_updates enable row level security;
alter table citizen_reports enable row level security;
alter table verifications enable row level security;
alter table profiles enable row level security;

create policy "public read departments"  on departments    for select using (true);
create policy "public read segments"     on road_segments  for select using (true);
create policy "public read projects"     on projects       for select using (true);
create policy "public read updates"      on project_updates for select using (true);
create policy "public read reports"      on citizen_reports for select using (true);
create policy "public read verifications" on verifications for select using (true);
-- profiles stays unreadable: it maps device/user ids to roles.

-- Writes are performed by server route handlers using the service-role key,
-- which bypasses RLS. Citizen INSERT/UPDATE stays closed to the anon key.

-- ---------------------------------------------------------------------------
-- Storage — citizen report photos (M6)
--
-- Report photos are compressed client-side to <= 1 MB before upload, re-checked
-- server-side, and stored with their EXIF/metadata stripped (see
-- lib/image/metadata.ts). The bucket is public-read so a stored photo URL can
-- render in the report list; uploads go through the service-role key only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do update set public = true;

-- Public read of objects in the report-photos bucket; no anon write policy,
-- so browsers cannot upload directly.
create policy "public read report photos"
  on storage.objects for select
  using (bucket_id = 'report-photos');

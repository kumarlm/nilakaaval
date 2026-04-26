-- Schema for GIS unauthorized-construction monitor.
-- Run this in Supabase SQL editor once after creating the project.

-- 1. Profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('authority', 'viewer')),
  designation text,        -- e.g. "Tahsildar", "VAO", "RDO"
  district text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Parcels (restricted areas) ----------------------------------------
-- We store the polygon as GeoJSON in jsonb. Postgres's native geography type
-- requires the postgis extension; jsonb keeps the migration portable on the
-- Supabase free tier and lets us use Turf.js in the worker for area / diff.
create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  taluk text not null,
  village text not null,
  survey_no text,
  restriction_type text not null check (restriction_type in (
    'reserved_forest',
    'water_body',
    'government_poromboke',
    'temple_land',
    'archaeological',
    'coastal_regulation_zone',
    'highway_setback',
    'other'
  )),
  notes text,
  geom jsonb not null,                  -- GeoJSON Polygon (WGS84)
  area_hectares numeric,
  scan_frequency_days int not null default 7,
  last_scanned_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists parcels_district_idx on public.parcels (district);
create index if not exists parcels_status_idx on public.parcels (status);

-- 3. Snapshots ---------------------------------------------------------
-- One row per Sentinel-2 (or other) capture per parcel.
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcels(id) on delete cascade,
  captured_at timestamptz not null,
  source text not null default 'sentinel-2',
  cloud_cover numeric,
  image_url text not null,              -- public URL in Supabase Storage
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_parcel_captured_idx
  on public.snapshots (parcel_id, captured_at desc);

-- 4. Alerts ------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcels(id) on delete cascade,
  baseline_snapshot_id uuid references public.snapshots(id) on delete set null,
  current_snapshot_id uuid references public.snapshots(id) on delete set null,
  detected_at timestamptz not null default now(),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  change_score numeric,                 -- 0..1
  diff_image_url text,
  status text not null default 'open' check (status in (
    'open', 'investigating', 'unauthorized', 'authorized', 'false_positive'
  )),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  notes text
);

create index if not exists alerts_status_idx on public.alerts (status);
create index if not exists alerts_parcel_idx on public.alerts (parcel_id);

-- 5. Row Level Security -----------------------------------------------
alter table public.profiles enable row level security;
alter table public.parcels  enable row level security;
alter table public.snapshots enable row level security;
alter table public.alerts   enable row level security;

-- Profiles: a user can read/update only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- Helper: is the current user an authority?
create or replace function public.is_authority()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'authority'
  );
$$;

-- Parcels: any authenticated user can read; only authorities can write.
drop policy if exists parcels_select_authed on public.parcels;
create policy parcels_select_authed on public.parcels
  for select using (auth.role() = 'authenticated');

drop policy if exists parcels_insert_authority on public.parcels;
create policy parcels_insert_authority on public.parcels
  for insert with check (public.is_authority());

drop policy if exists parcels_update_authority on public.parcels;
create policy parcels_update_authority on public.parcels
  for update using (public.is_authority());

drop policy if exists parcels_delete_authority on public.parcels;
create policy parcels_delete_authority on public.parcels
  for delete using (public.is_authority());

-- Snapshots & alerts: read for any authed user; write only by service role
-- (the worker uses the service-role key, which bypasses RLS).
drop policy if exists snapshots_select_authed on public.snapshots;
create policy snapshots_select_authed on public.snapshots
  for select using (auth.role() = 'authenticated');

drop policy if exists alerts_select_authed on public.alerts;
create policy alerts_select_authed on public.alerts
  for select using (auth.role() = 'authenticated');

drop policy if exists alerts_update_authority on public.alerts;
create policy alerts_update_authority on public.alerts
  for update using (public.is_authority());

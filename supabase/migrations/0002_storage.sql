-- Storage bucket for Sentinel-2 snapshots and (later) diff images.
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- 1. Create the bucket (public read, server-only write).
insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', true)
on conflict (id) do nothing;

-- 2. Storage RLS: anyone authenticated can read; only service role writes.
-- (The cron / scan API uses the service-role key, which bypasses RLS, so we
-- don't need an explicit insert policy. Authenticated reads are needed for
-- the dashboard to load the public URLs through the Supabase CDN.)

drop policy if exists "snapshots_read" on storage.objects;
create policy "snapshots_read" on storage.objects
  for select using (bucket_id = 'snapshots');

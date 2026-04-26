-- Allow authority users to delete snapshots and alerts. Parcels already have
-- delete-authority RLS in 0001_init.sql.
-- Storage objects associated with deleted rows are cleaned up server-side
-- (see src/lib/delete-actions.ts) using the service-role client.

drop policy if exists snapshots_delete_authority on public.snapshots;
create policy snapshots_delete_authority on public.snapshots
  for delete using (public.is_authority());

drop policy if exists alerts_delete_authority on public.alerts;
create policy alerts_delete_authority on public.alerts
  for delete using (public.is_authority());

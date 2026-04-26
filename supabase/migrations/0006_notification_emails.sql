-- Per-user list of additional email addresses to notify when an alert fires
-- on any parcel. Authority users always get alerts to their account email;
-- this column adds extra recipients (e.g. district revenue inspector,
-- village admin officer).

alter table public.profiles
  add column if not exists notification_emails text[] not null default '{}';

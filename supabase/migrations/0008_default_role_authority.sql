-- Pilot policy: every new signup is assumed to be a TN official, so the
-- default role becomes 'authority'. Also promote any existing viewers so
-- previously-signed-up accounts can immediately use the tool. Override
-- manually in SQL if you need a read-only viewer.

alter table public.profiles
  alter column role set default 'authority';

update public.profiles
   set role = 'authority'
 where role = 'viewer';

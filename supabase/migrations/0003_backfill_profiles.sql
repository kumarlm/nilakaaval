-- Backfill profile rows for users who signed up before 0001_init.sql ran
-- (or before the on_auth_user_created trigger existed). Safe to re-run.

insert into public.profiles (id, email)
select u.id, u.email
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

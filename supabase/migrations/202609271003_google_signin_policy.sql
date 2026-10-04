begin;
-- Same-email identity linking is performed by Supabase Auth. Keep its user UUID.
-- Remember that Google was linked, even if a client later unlinks the identity.
create table private.google_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now()
);
alter table private.google_accounts enable row level security;
revoke all on private.google_accounts from public,anon,authenticated;
insert into private.google_accounts(user_id)
 select distinct user_id from auth.identities where provider='google' on conflict do nothing;
create function private.remember_google_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.provider='google' then
  insert into private.google_accounts(user_id) values(new.user_id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.remember_google_identity() from public,anon,authenticated;
create trigger upcatch_google_identity after insert or update of provider on auth.identities
 for each row execute function private.remember_google_identity();
create function private.signin_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  not exists(select 1 from private.google_accounts where user_id=auth.uid())
  or exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) entry where entry->>'method'='oauth')
 );
$$;
revoke all on function private.signin_allowed() from public,anon,authenticated;
create function public.my_signin_policy() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'google_required',exists(select 1 from private.google_accounts where user_id=auth.uid()),
  'allowed',private.signin_allowed()
 );
$$;
revoke all on function public.my_signin_policy() from public,anon;
grant execute on function public.my_signin_policy() to authenticated;
create function public.email_uses_google(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.google_accounts g on g.user_id=u.id
 where lower(u.email)=lower(trim(p_email)));
$$;
revoke all on function public.email_uses_google(text) from public,anon,authenticated;
grant execute on function public.email_uses_google(text) to service_role;
create or replace function private.is_confirmed() returns boolean
language sql stable security definer set search_path='' as $$
 select private.signin_allowed() and exists(
  select 1 from auth.users u join private.member_access a on a.user_id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and a.account_status='active'
 );
$$;
-- Existing RLS policies and member RPCs call is_confirmed(), protecting app data
-- even if someone calls Supabase password/magic-link endpoints directly.
notify pgrst, 'reload schema';
commit;

-- The server can dispatch both sides of a member's latest meetup.
-- Recipient identifiers are never exposed through the authenticated browser API.
begin;
create function public.notification_recipients(p_user uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 with latest as (
  select m.id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=p_user order by m.created_at desc,m.id desc limit 1
 )
 select p_user where p_user is not null
 union
 select p.user_id from public.meetup_participants p join latest m on m.id=p.meetup_id;
$$;
revoke all on function public.notification_recipients(uuid) from public,anon,authenticated;
grant execute on function public.notification_recipients(uuid) to service_role;
notify pgrst, 'reload schema';
commit;

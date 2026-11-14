begin;

-- Keep the original three-meetup participation limit even when the optional
-- admin entitlement column has not been installed.
create or replace function private.can_queue(p_user uuid,p_city uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from private.member_access a join public.profiles p on p.id=a.user_id
  join auth.users u on u.id=p.id join public.cities c on c.id=p.home_city_id
  where p.id=p_user and p.home_city_id=p_city and c.status='active'
   and p.onboarding_completed_at is not null and u.email_confirmed_at is not null
   and a.account_status='active' and a.reserved_meetups=0 and private.is_adult(p_user)
   and a.id_status<>'revoked'
   and (a.id_status='approved' or a.completed_meetups<3)
   and ((to_jsonb(a)->>'meetup_limit') is null or a.completed_meetups<(to_jsonb(a)->>'meetup_limit')::integer)
   and not exists(select 1 from private.meetup_responses r join public.meetups m on m.id=r.meetup_id
     join private.meetup_details d on d.meetup_id=m.id
     where r.user_id=p_user and r.feedback_ack_at is null
       and (m.status='completed' or (m.status='cancelled' and d.closure_reason='scheduled_end')))
 );
$$;

create or replace function private.enforce_meetup_allowance() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_access private.member_access;
begin
 if tg_op='UPDATE' and (new.meetup_id<>old.meetup_id or new.user_id<>old.user_id) then
   raise exception 'Participation identity is immutable';
 end if;
 select * into v_access from private.member_access where user_id=new.user_id for update;
 if tg_op='INSERT' then
   if new.status<>'reserved' then raise exception 'Participation must start reserved'; end if;
   if v_access.account_status<>'active' or not exists(
     select 1 from auth.users u join public.profiles p on p.id=u.id
     where u.id=new.user_id and u.email_confirmed_at is not null and p.onboarding_completed_at is not null
   ) then raise exception 'Complete verified-email onboarding first'; end if;
   if v_access.id_status='revoked' or
     (v_access.id_status<>'approved' and v_access.completed_meetups+v_access.reserved_meetups>=3) then
     raise exception 'ID verification required';
   end if;
   if (to_jsonb(v_access)->>'meetup_limit') is not null and
     v_access.completed_meetups+v_access.reserved_meetups>=(to_jsonb(v_access)->>'meetup_limit')::integer then
     raise exception 'Meetup allowance reached';
   end if;
   update private.member_access set reserved_meetups=reserved_meetups+1 where user_id=new.user_id;
 elsif new.status<>old.status then
   if old.status<>'reserved' or new.status not in ('completed','cancelled','no_show') then
     raise exception 'Invalid participation transition';
   end if;
   if new.status='completed' and not exists(
     select 1 from public.meetups where id=new.meetup_id and status='completed' and ends_at<=now()
   ) then raise exception 'Meetup must be completed by the trusted lifecycle first'; end if;
   update private.member_access set reserved_meetups=reserved_meetups-1,
     completed_meetups=completed_meetups+case when new.status='completed' then 1 else 0 end
     where user_id=new.user_id;
 end if;
 return new;
end $$;

create or replace function public.my_meetup_access()
returns table(completed_meetups integer,reserved_meetups integer,id_status text,id_required boolean)
language sql stable security definer set search_path='' as $$
 select a.completed_meetups,a.reserved_meetups,a.id_status,
   a.id_status='revoked' or (a.id_status<>'approved' and a.completed_meetups+a.reserved_meetups>=3)
 from private.member_access a where a.user_id=(select auth.uid()) and private.is_confirmed();
$$;

revoke all on function private.can_queue(uuid,uuid),private.enforce_meetup_allowance() from public,anon,authenticated;
revoke all on function public.my_meetup_access() from public,anon;
grant execute on function public.my_meetup_access() to authenticated;
notify pgrst, 'reload schema';
commit;

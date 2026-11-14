-- Keep private matching criteria out of Wall responses and enforce them on requests.
begin;
create function private.scheduled_private_preferences_allow(p_post uuid,p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from private.scheduled_posts post
    join private.member_access host_access on host_access.user_id=post.author_id
    join private.member_access member_access on member_access.user_id=p_member
    join private.member_settings host_settings on host_settings.user_id=post.author_id
    join private.member_settings member_settings on member_settings.user_id=p_member
    where post.id=p_post and post.author_id<>p_member
      and (not 'Verified ID only'=any(post.preferences)
        or (host_access.id_status='approved' and member_access.id_status='approved'))
      and (not 'Similar age'=any(post.preferences)
        or (host_settings.age is not null and member_settings.age is not null
          and abs(host_settings.age-member_settings.age)<=5))
  );
$$;
create function private.guard_scheduled_private_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' or (tg_op='UPDATE' and new.status='accepted'))
    and not private.scheduled_private_preferences_allow(new.post_id,new.user_id)
    then raise exception 'This invite is not available to you'; end if;
  return new;
end $$;
create trigger scheduled_private_preferences_guard before insert or update of status on private.scheduled_post_requests
for each row execute function private.guard_scheduled_private_preferences();
revoke all on function private.scheduled_private_preferences_allow(uuid,uuid),private.guard_scheduled_private_preferences() from public,anon,authenticated;

create or replace function public.list_scheduled_posts(p_after_starts timestamptz default null,p_after_id uuid default null,p_limit integer default 20,p_intent text default null)
returns table(post_id uuid,author_name text,intent text,starts_at timestamptz,note text,request_status text,pending_count integer,requests jsonb,accepted_name text,is_mine boolean,post_status text,duration_min integer,radius_km numeric,preferences text[])
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select p.home_city_id into v_city from public.profiles p join private.member_access a on a.user_id=p.id
 join public.cities c on c.id=p.home_city_id
 where p.id=v_user and p.onboarding_completed_at is not null and a.account_status='active'
  and a.id_status<>'revoked' and private.is_adult(p.id) and c.status='active';
 if v_city is null then raise exception 'Complete your eligible profile first'; end if;
 return query
 with page as (
  select p.id,p.author_id,p.intent,p.starts_at,p.note,p.status,p.duration_min,p.radius_km,p.preferences
  from private.scheduled_posts p
  join public.profiles author on author.id=p.author_id and author.home_city_id=p.city_id
  join private.member_access aa on aa.user_id=p.author_id and aa.account_status='active'
  where p.city_id=v_city and p.starts_at>now() and (p_intent is null or p.intent=p_intent)
   and (p.status='open' or (p.status='matched' and
    (p.author_id=v_user or exists(select 1 from private.scheduled_post_requests accepted
      where accepted.post_id=p.id and accepted.user_id=v_user and accepted.status='accepted'))))
   and (p.author_id=v_user or p.status='matched' or private.scheduled_private_preferences_allow(p.id,v_user))
   and (p_after_starts is null and p_after_id is null
    or p_after_starts is not null and p_after_id is not null and (p.starts_at,p.id)>(p_after_starts,p_after_id))
   and not exists(select 1 from private.member_blocks b
     where (b.blocker_id=v_user and b.blocked_id=p.author_id)
       or (b.blocker_id=p.author_id and b.blocked_id=v_user))
  order by p.starts_at,p.id
  limit least(greatest(coalesce(p_limit,20),1),30)
 )
 select page.id,author.display_name,page.intent,page.starts_at,page.note,
  (select r.status from private.scheduled_post_requests r where r.post_id=page.id and r.user_id=v_user),
  case when page.author_id=v_user then
   (select count(*)::integer from private.scheduled_post_requests r where r.post_id=page.id and r.status='pending') else 0 end,
  case when page.author_id=v_user then coalesce(
   (select jsonb_agg(jsonb_build_object('user_id',pending.user_id,'name',member.display_name) order by pending.created_at)
    from private.scheduled_post_requests pending join public.profiles member on member.id=pending.user_id
    where pending.post_id=page.id and pending.status='pending'),'[]'::jsonb) else '[]'::jsonb end,
  (select member.display_name from private.scheduled_post_requests accepted
   join public.profiles member on member.id=accepted.user_id
   where accepted.post_id=page.id and accepted.status='accepted'),
  page.author_id=v_user,page.status,page.duration_min,page.radius_km,
  array_remove(array_remove(page.preferences,'Verified ID only'),'Similar age')
 from page join public.profiles author on author.id=page.author_id
 order by page.starts_at,page.id;
end $$;
revoke all on function public.list_scheduled_posts(timestamptz,uuid,integer,text) from public,anon;
grant execute on function public.list_scheduled_posts(timestamptz,uuid,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;

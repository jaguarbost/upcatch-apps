-- Keep scheduled Wall invites aligned with the approved Create form.
begin;
alter table private.scheduled_posts
 add column duration_min integer not null default 30 check(duration_min in (15,30,45,60,90)),
 add column radius_km numeric(10,6) not null default 4.828032 check(radius_km in (0.804672,1.609344,3.218688,4.828032)),
 add column preferences text[] not null default '{}'::text[] check(cardinality(preferences)<=7);

create or replace function private.validate_scheduled_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not exists(select 1 from public.profiles where id=new.author_id and home_city_id=new.city_id)
   then raise exception 'Post city must match its author'; end if;
 elsif new.id<>old.id or new.author_id<>old.author_id or new.city_id<>old.city_id
   or new.intent<>old.intent or new.starts_at<>old.starts_at or new.note<>old.note
   or new.duration_min<>old.duration_min or new.radius_km<>old.radius_km
   or new.preferences<>old.preferences or new.created_at<>old.created_at
   or not ((old.status='open' and new.status in ('matched','cancelled'))
    or (old.status='matched' and new.status='cancelled'))
   then raise exception 'Invalid scheduled post transition'; end if;
 return new;
end $$;

create function public.create_scheduled_post(p_intent text,p_starts_at timestamptz,p_note text,p_duration integer,p_radius numeric,p_preferences text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_id uuid; v_note text:=btrim(p_note);
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select p.home_city_id into v_city from public.profiles p
 join private.member_access a on a.user_id=p.id
 join public.cities c on c.id=p.home_city_id
 where p.id=v_user and p.onboarding_completed_at is not null
  and a.account_status='active' and a.id_status<>'revoked'
  and private.is_adult(p.id) and c.status='active';
 if v_city is null then raise exception 'Complete your eligible profile first'; end if;
 if p_intent not in ('coffee','lunch','drink','walk','networking','explore','chat') or p_intent is null
  then raise exception 'Choose an activity'; end if;
 if p_starts_at is null or p_starts_at<now()+interval '15 minutes'
  or p_starts_at>now()+interval '14 days'
  then raise exception 'Choose a time between 15 minutes and 14 days from now'; end if;
 if v_note is null or char_length(v_note) not between 1 and 240
  then raise exception 'Write a plan of 1 to 240 characters'; end if;
 if p_duration is null or p_duration not in (15,30,45,60,90)
  then raise exception 'Choose a valid duration'; end if;
 if p_radius is null or p_radius not in (0.804672,1.609344,3.218688,4.828032)
  then raise exception 'Choose a valid travel distance'; end if;
 if p_preferences is null or cardinality(p_preferences)>7 or exists(
  select 1 from unnest(p_preferences) preference
  where preference is null or char_length(btrim(preference)) not between 1 and 80)
  then raise exception 'Choose valid preferences'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scheduled-posts:'||v_user::text,0));
 if (select count(*) from private.scheduled_posts where author_id=v_user and status in ('open','matched') and starts_at>now())>=3
  then raise exception 'You can have up to three upcoming posts'; end if;
 insert into private.scheduled_posts(author_id,city_id,intent,starts_at,note,duration_min,radius_km,preferences)
 values(v_user,v_city,p_intent,p_starts_at,v_note,p_duration,p_radius,p_preferences) returning id into v_id;
 return v_id;
end $$;

drop function public.list_scheduled_posts(timestamptz,uuid,integer,text);
create function public.list_scheduled_posts(p_after_starts timestamptz default null,p_after_id uuid default null,p_limit integer default 20,p_intent text default null)
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
  page.author_id=v_user,page.status,page.duration_min,page.radius_km,page.preferences
 from page join public.profiles author on author.id=page.author_id
 order by page.starts_at,page.id;
end $$;

revoke all on function public.create_scheduled_post(text,timestamptz,text,integer,numeric,text[]),
 public.list_scheduled_posts(timestamptz,uuid,integer,text) from public,anon;
grant execute on function public.create_scheduled_post(text,timestamptz,text,integer,numeric,text[]),
 public.list_scheduled_posts(timestamptz,uuid,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;

-- City-scoped, paginated wall for future meetup plans. Interests do not reserve a meetup.
begin;
create table private.scheduled_posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 city_id uuid not null references public.cities(id),
 intent text not null check(intent in ('coffee','lunch','drink','walk','networking','explore','chat')),
 starts_at timestamptz not null,
 note text not null check(char_length(btrim(note)) between 1 and 240),
 status text not null default 'open' check(status in ('open','cancelled')),
 created_at timestamptz not null default now()
);
create index scheduled_posts_city_feed_idx on private.scheduled_posts(city_id,starts_at,id) where status='open';
create index scheduled_posts_author_idx on private.scheduled_posts(author_id,starts_at) where status='open';

create table private.scheduled_post_interests (
 post_id uuid not null references private.scheduled_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index scheduled_post_interests_user_idx on private.scheduled_post_interests(user_id,post_id);
alter table private.scheduled_posts enable row level security;
alter table private.scheduled_post_interests enable row level security;
revoke all on private.scheduled_posts,private.scheduled_post_interests from public,anon,authenticated;
grant all on private.scheduled_posts,private.scheduled_post_interests to service_role;

create function private.validate_scheduled_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not exists(select 1 from public.profiles where id=new.author_id and home_city_id=new.city_id)
   then raise exception 'Post city must match its author'; end if;
 elsif new.id<>old.id or new.author_id<>old.author_id or new.city_id<>old.city_id
   or new.intent<>old.intent or new.starts_at<>old.starts_at or new.note<>old.note
   or new.created_at<>old.created_at or old.status<>'open' or new.status<>'cancelled'
   then raise exception 'Only an open post can be cancelled'; end if;
 return new;
end $$;
create trigger scheduled_post_guard before insert or update on private.scheduled_posts
 for each row execute function private.validate_scheduled_post();

create function private.validate_scheduled_interest() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Interest cannot be edited'; end if;
 if not exists(select 1 from private.scheduled_posts p join public.profiles member on member.id=new.user_id
   where p.id=new.post_id and p.status='open' and p.starts_at>now()
   and p.author_id<>new.user_id and p.city_id=member.home_city_id)
   then raise exception 'Interest must be for a future post in your city'; end if;
 return new;
end $$;
create trigger scheduled_interest_guard before insert or update on private.scheduled_post_interests
 for each row execute function private.validate_scheduled_interest();
revoke all on function private.validate_scheduled_post(),private.validate_scheduled_interest() from public,anon,authenticated;

create function public.create_scheduled_post(p_intent text,p_starts_at timestamptz,p_note text)
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
 perform pg_advisory_xact_lock(hashtextextended('scheduled-posts:'||v_user::text,0));
 if (select count(*) from private.scheduled_posts where author_id=v_user and status='open' and starts_at>now())>=3
  then raise exception 'You can have up to three upcoming posts'; end if;
 insert into private.scheduled_posts(author_id,city_id,intent,starts_at,note)
 values(v_user,v_city,p_intent,p_starts_at,v_note) returning id into v_id;
 return v_id;
end $$;

create function public.list_scheduled_posts(p_after_starts timestamptz default null,p_after_id uuid default null,p_limit integer default 20)
returns table(post_id uuid,author_name text,intent text,starts_at timestamptz,note text,interested_count integer,my_interest boolean,is_mine boolean)
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
  select p.id,p.author_id,p.intent,p.starts_at,p.note
  from private.scheduled_posts p
  join public.profiles author on author.id=p.author_id and author.home_city_id=p.city_id
  join private.member_access aa on aa.user_id=p.author_id and aa.account_status='active'
  where p.city_id=v_city and p.status='open' and p.starts_at>now()
   and (p_after_starts is null and p_after_id is null
    or p_after_starts is not null and p_after_id is not null and (p.starts_at,p.id)>(p_after_starts,p_after_id))
   and not exists(select 1 from private.member_blocks b
     where (b.blocker_id=v_user and b.blocked_id=p.author_id)
       or (b.blocker_id=p.author_id and b.blocked_id=v_user))
  order by p.starts_at,p.id
  limit least(greatest(coalesce(p_limit,20),1),30)
 )
 select page.id,author.display_name,page.intent,page.starts_at,page.note,
  (select count(*)::integer from private.scheduled_post_interests i where i.post_id=page.id),
  exists(select 1 from private.scheduled_post_interests i where i.post_id=page.id and i.user_id=v_user),
  page.author_id=v_user
 from page join public.profiles author on author.id=page.author_id
 order by page.starts_at,page.id;
end $$;

create function public.set_scheduled_interest(p_post uuid,p_interested boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_author uuid;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 if not coalesce(p_interested,false) then
  delete from private.scheduled_post_interests where post_id=p_post and user_id=v_user;
  return;
 end if;
 select p.home_city_id into v_city from public.profiles p join private.member_access a on a.user_id=p.id
 where p.id=v_user and p.onboarding_completed_at is not null and a.account_status='active'
  and a.id_status<>'revoked' and private.is_adult(p.id);
 select author_id into v_author from private.scheduled_posts
  where id=p_post and city_id=v_city and status='open' and starts_at>now();
 if v_author is null or v_author=v_user or exists(select 1 from private.member_blocks b
   where (b.blocker_id=v_user and b.blocked_id=v_author) or (b.blocker_id=v_author and b.blocked_id=v_user))
  then raise exception 'This post is not available to you'; end if;
 insert into private.scheduled_post_interests(post_id,user_id) values(p_post,v_user)
 on conflict(post_id,user_id) do nothing;
end $$;

create function public.cancel_scheduled_post(p_post uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 update private.scheduled_posts set status='cancelled'
 where id=p_post and author_id=auth.uid() and status='open';
 if not found then raise exception 'Your open post was not found'; end if;
end $$;
revoke all on function public.create_scheduled_post(text,timestamptz,text),
 public.list_scheduled_posts(timestamptz,uuid,integer),
 public.set_scheduled_interest(uuid,boolean),
 public.cancel_scheduled_post(uuid) from public,anon;
grant execute on function public.create_scheduled_post(text,timestamptz,text),
 public.list_scheduled_posts(timestamptz,uuid,integer),
 public.set_scheduled_interest(uuid,boolean),
 public.cancel_scheduled_post(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

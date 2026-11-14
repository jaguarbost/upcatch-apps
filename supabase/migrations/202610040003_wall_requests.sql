-- Convert early wall interests into one-to-one join requests.
begin;
alter table private.scheduled_post_interests rename to scheduled_post_requests;
alter table private.scheduled_post_requests add column status text not null default 'pending'
 check(status in ('pending','accepted','rejected','cancelled'));
create unique index scheduled_one_accepted_request on private.scheduled_post_requests(post_id) where status='accepted';
create index scheduled_pending_requests_idx on private.scheduled_post_requests(post_id,created_at) where status='pending';
create index scheduled_posts_intent_feed_idx on private.scheduled_posts(city_id,intent,starts_at,id) where status='open';
alter table private.scheduled_posts drop constraint scheduled_posts_status_check;
alter table private.scheduled_posts add constraint scheduled_posts_status_check
 check(status in ('open','matched','cancelled'));
drop trigger scheduled_interest_guard on private.scheduled_post_requests;
drop function private.validate_scheduled_interest();

create or replace function private.validate_scheduled_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not exists(select 1 from public.profiles where id=new.author_id and home_city_id=new.city_id)
   then raise exception 'Post city must match its author'; end if;
 elsif new.id<>old.id or new.author_id<>old.author_id or new.city_id<>old.city_id
   or new.intent<>old.intent or new.starts_at<>old.starts_at or new.note<>old.note
   or new.created_at<>old.created_at
   or not ((old.status='open' and new.status in ('matched','cancelled'))
    or (old.status='matched' and new.status='cancelled'))
   then raise exception 'Invalid scheduled post transition'; end if;
 return new;
end $$;

create function private.validate_scheduled_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not exists(select 1 from private.scheduled_posts p join public.profiles member on member.id=new.user_id
    where p.id=new.post_id and p.status='open' and p.starts_at>now()
      and p.author_id<>new.user_id and p.city_id=member.home_city_id)
    then raise exception 'Request must be for a future post in your city'; end if;
 elsif new.post_id<>old.post_id or new.user_id<>old.user_id or new.created_at<>old.created_at
   or not ((old.status='pending' and new.status in ('accepted','rejected'))
      or (old.status='accepted' and new.status='cancelled'))
   then raise exception 'Invalid request transition'; end if;
 return new;
end $$;
create trigger scheduled_request_guard before insert or update on private.scheduled_post_requests
 for each row execute function private.validate_scheduled_request();
revoke all on function private.validate_scheduled_request() from public,anon,authenticated;

drop function public.list_scheduled_posts(timestamptz,uuid,integer);
drop function public.set_scheduled_interest(uuid,boolean);
create or replace function public.create_scheduled_post(p_intent text,p_starts_at timestamptz,p_note text)
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
 if (select count(*) from private.scheduled_posts where author_id=v_user and status in ('open','matched') and starts_at>now())>=3
  then raise exception 'You can have up to three upcoming posts'; end if;
 insert into private.scheduled_posts(author_id,city_id,intent,starts_at,note)
 values(v_user,v_city,p_intent,p_starts_at,v_note) returning id into v_id;
 return v_id;
end $$;

create function public.list_scheduled_posts(p_after_starts timestamptz default null,p_after_id uuid default null,p_limit integer default 20,p_intent text default null)
returns table(post_id uuid,author_name text,intent text,starts_at timestamptz,note text,request_status text,pending_count integer,requests jsonb,accepted_name text,is_mine boolean,post_status text)
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
  select p.id,p.author_id,p.intent,p.starts_at,p.note,p.status
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
  page.author_id=v_user,page.status
 from page join public.profiles author on author.id=page.author_id
 order by page.starts_at,page.id;
end $$;

create function public.request_scheduled_post(p_post uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_post private.scheduled_posts; v_status text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select p.home_city_id into v_city from public.profiles p join private.member_access a on a.user_id=p.id
 where p.id=v_user and p.onboarding_completed_at is not null and a.account_status='active'
  and a.id_status<>'revoked' and private.is_adult(p.id);
 select * into v_post from private.scheduled_posts
  where id=p_post and city_id=v_city and status='open' and starts_at>now() for update;
 if v_post.id is null or v_post.author_id=v_user or exists(select 1 from private.member_blocks b
   where (b.blocker_id=v_user and b.blocked_id=v_post.author_id) or (b.blocker_id=v_post.author_id and b.blocked_id=v_user))
  then raise exception 'This post is not available to you'; end if;
 select status into v_status from private.scheduled_post_requests where post_id=p_post and user_id=v_user;
 if v_status='pending' then return; end if;
 if v_status is not null then raise exception 'You already requested to join this plan'; end if;
 if (select count(*) from private.scheduled_post_requests where post_id=p_post and status='pending')>=20
  then raise exception 'This plan has reached its request limit'; end if;
 insert into private.scheduled_post_requests(post_id,user_id) values(p_post,v_user);
end $$;

create function public.respond_scheduled_request(p_post uuid,p_requester uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_post private.scheduled_posts;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select * into v_post from private.scheduled_posts where id=p_post for update;
 if v_post.id is null or v_post.author_id<>auth.uid() or v_post.status<>'open' or v_post.starts_at<=now()
  then raise exception 'Your open plan was not found'; end if;
 update private.scheduled_post_requests set status=case when p_accept then 'accepted' else 'rejected' end
  where post_id=p_post and user_id=p_requester and status='pending';
 if not found then raise exception 'Pending request was not found'; end if;
 if p_accept then
  update private.scheduled_posts set status='matched' where id=p_post;
  update private.scheduled_post_requests set status='rejected' where post_id=p_post and status='pending';
 end if;
end $$;

create or replace function public.cancel_scheduled_post(p_post uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 update private.scheduled_posts set status='cancelled'
 where id=p_post and author_id=auth.uid() and status in ('open','matched');
 if not found then raise exception 'Your upcoming post was not found'; end if;
 update private.scheduled_post_requests set status='cancelled' where post_id=p_post and status='accepted';
end $$;
revoke all on function public.create_scheduled_post(text,timestamptz,text),
 public.list_scheduled_posts(timestamptz,uuid,integer,text),
 public.request_scheduled_post(uuid),
 public.respond_scheduled_request(uuid,uuid,boolean),
 public.cancel_scheduled_post(uuid) from public,anon;
grant execute on function public.create_scheduled_post(text,timestamptz,text),
 public.list_scheduled_posts(timestamptz,uuid,integer,text),
 public.request_scheduled_post(uuid),
 public.respond_scheduled_request(uuid,uuid,boolean),
 public.cancel_scheduled_post(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

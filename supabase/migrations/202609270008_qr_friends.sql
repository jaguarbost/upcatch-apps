begin;
create table private.friend_codes (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(), expires_at timestamptz not null
);
create table private.friend_requests (
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '5 minutes',
 unique(sender_id,recipient_id), check(sender_id<>recipient_id)
);
create table private.friendships (
 first_id uuid not null references public.profiles(id) on delete cascade,
 second_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(first_id,second_id), check(first_id<second_id)
);
alter table private.friend_codes enable row level security;
alter table private.friend_requests enable row level security;
alter table private.friendships enable row level security;
revoke all on private.friend_codes,private.friend_requests,private.friendships from public,anon,authenticated;
grant all on private.friend_codes,private.friend_requests,private.friendships to service_role;

create function private.friend_visible(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_confirmed() and exists(select 1 from private.member_access where user_id=p_other and account_status='active')
 and not exists(select 1 from private.member_blocks where
 (blocker_id=auth.uid() and blocked_id=p_other) or (blocked_id=auth.uid() and blocker_id=p_other))
 and (exists(select 1 from private.friendships where first_id=least(auth.uid(),p_other) and second_id=greatest(auth.uid(),p_other))
 or exists(select 1 from private.friend_requests where expires_at>now() and
 ((sender_id=auth.uid() and recipient_id=p_other) or (recipient_id=auth.uid() and sender_id=p_other))));
$$;
revoke all on function private.friend_visible(uuid) from public,anon,authenticated;
grant execute on function private.friend_visible(uuid) to authenticated;
create policy friend_profile_photo on storage.objects for select to authenticated
using(bucket_id='profile-photos' and exists(select 1 from public.profiles p where p.photo_path=name and private.friend_visible(p.id)));
-- This narrow policy shares current photos, without exposing profile rows to clients.
create policy friend_profile_read on public.profiles for select to authenticated using(private.friend_visible(id));

create function public.friend_command(p_command text default 'state',p_value uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); other_id uuid; request private.friend_requests; result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
 raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,7));
 if p_command='code' then
 insert into private.friend_codes(user_id,expires_at) values(me,now()+interval '60 seconds')
 on conflict(user_id) do update set token=gen_random_uuid(),expires_at=excluded.expires_at
 where private.friend_codes.expires_at<=now();
 elsif p_command='scan' then
 select user_id into other_id from private.friend_codes where token=p_value and expires_at>now();
 if other_id is null then raise exception 'Code expired or invalid. Ask them to refresh it.'; end if;
 if other_id=me then raise exception 'This is your own code'; end if;
 if not exists(select 1 from private.member_access a join public.profiles p on p.id=a.user_id
 where a.user_id=other_id and a.account_status='active' and p.onboarding_completed_at is not null)
 or exists(select 1 from private.member_blocks where (blocker_id=me and blocked_id=other_id) or (blocker_id=other_id and blocked_id=me)) then
 raise exception 'This member is unavailable'; end if;
 if (select count(*) from private.friend_requests where sender_id=me and expires_at>now())>=10 then raise exception 'Too many scans. Try again in a few minutes.'; end if;
 insert into private.friend_requests(sender_id,recipient_id) values(me,other_id)
 on conflict(sender_id,recipient_id) do update set id=gen_random_uuid(),expires_at=now()+interval '5 minutes'
 returning * into request;
 elsif p_command='confirm' then
 select * into request from private.friend_requests where id=p_value and recipient_id=me and expires_at>now() for update;
 if not found then raise exception 'Request expired. Scan again.'; end if;
 other_id:=request.sender_id;
 if not private.friend_visible(other_id) then raise exception 'This member is unavailable'; end if;
 insert into private.friendships(first_id,second_id) values(least(me,other_id),greatest(me,other_id)) on conflict do nothing;
 delete from private.friend_requests where (sender_id=me and recipient_id=other_id) or (sender_id=other_id and recipient_id=me);
 elsif p_command='remove' then
 delete from private.friendships where first_id=least(me,p_value) and second_id=greatest(me,p_value);
 delete from private.friend_requests where (sender_id=me and recipient_id=p_value) or (sender_id=p_value and recipient_id=me);
 elsif p_command<>'state' then raise exception 'Invalid friend action'; end if;
 select jsonb_build_object(
 'code',(select jsonb_build_object('token',token,'expires_at',expires_at) from private.friend_codes where user_id=me and expires_at>now()),
 'scanned_id',other_id,'request_id',request.id,
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_path',p.photo_path,'since',f.created_at))
 from private.friendships f join public.profiles p on p.id=case when f.first_id=me then f.second_id else f.first_id end
 where me in(f.first_id,f.second_id) and private.friend_visible(p.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'incoming',r.recipient_id=me,'person_id',p.id,'name',p.display_name,'photo_path',p.photo_path))
 from private.friend_requests r join public.profiles p on p.id=case when r.sender_id=me then r.recipient_id else r.sender_id end
 where me in(r.sender_id,r.recipient_id) and r.expires_at>now() and private.friend_visible(p.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.friend_command(text,uuid) from public,anon,authenticated;
grant execute on function public.friend_command(text,uuid) to authenticated;
commit;

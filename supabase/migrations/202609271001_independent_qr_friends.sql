-- QR friendships are global and do not require a meetup, arrival, location or city match.
begin;
drop policy if exists friend_profile_read on public.profiles;
drop policy if exists friend_profile_photo on storage.objects;

create function private.qr_friend_peer(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_confirmed() and p_other<>auth.uid()
 and exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
 join auth.users u on u.id=p.id where p.id=p_other and p.onboarding_completed_at is not null
 and a.account_status='active' and u.email_confirmed_at is not null)
 and not exists(select 1 from private.member_blocks where
 (blocker_id=auth.uid() and blocked_id=p_other) or (blocked_id=auth.uid() and blocker_id=p_other));
$$;
revoke all on function private.qr_friend_peer(uuid) from public,anon,authenticated;

create function public.qr_friend_photo_path(p_user uuid,p_token uuid default null) returns text
language plpgsql security definer set search_path='' as $$
begin
 if not private.qr_friend_peer(p_user) or not exists(select 1 from public.profiles where id=auth.uid() and onboarding_completed_at is not null) then return null; end if;
 if not private.friend_visible(p_user) and not exists(select 1 from private.friend_codes where user_id=p_user and token=p_token and expires_at>now()) then return null; end if;
 return (select photo_path from public.profiles where id=p_user);
end $$;
revoke all on function public.qr_friend_photo_path(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qr_friend_photo_path(uuid,uuid) to authenticated;

create or replace function public.friend_command(p_command text default 'state',p_value uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); other_id uuid; req private.friend_requests; result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
 raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,7));
 delete from private.friend_requests where me in(sender_id,recipient_id) and expires_at<=now();
 if p_command='code' then
 insert into private.friend_codes(user_id,expires_at) values(me,now()+interval '60 seconds')
 on conflict(user_id) do update set token=gen_random_uuid(),expires_at=excluded.expires_at
 where private.friend_codes.expires_at<=now();
 elsif p_command in('resolve','scan') then
 select user_id into other_id from private.friend_codes where token=p_value and expires_at>now();
 if other_id is null then raise exception 'Code expired or invalid. Ask them to refresh it.'; end if;
 if other_id=me then raise exception 'This is your own code'; end if;
 if not private.qr_friend_peer(other_id) then raise exception 'This member is unavailable'; end if;
 if p_command='scan' and not exists(select 1 from private.friendships where first_id=least(me,other_id) and second_id=greatest(me,other_id)) then
  if (select count(*) from private.friend_requests where sender_id=me and expires_at>now())>=10
   and not exists(select 1 from private.friend_requests where sender_id=me and recipient_id=other_id) then raise exception 'Too many scans. Try again in a few minutes.'; end if;
  insert into private.friend_requests(sender_id,recipient_id) values(me,other_id)
  on conflict(sender_id,recipient_id) do update set expires_at=private.friend_requests.expires_at
  returning * into req;
 end if;
 elsif p_command='confirm' then
 select * into req from private.friend_requests where id=p_value and recipient_id=me and expires_at>now() for update;
 if not found then raise exception 'Request expired. Scan again.'; end if;
 other_id:=req.sender_id;
 if not private.qr_friend_peer(other_id) then raise exception 'This member is unavailable'; end if;
 insert into private.friendships(first_id,second_id) values(least(me,other_id),greatest(me,other_id)) on conflict do nothing;
 delete from private.friend_requests where (sender_id=me and recipient_id=other_id) or (sender_id=other_id and recipient_id=me);
 elsif p_command='dismiss' then
 delete from private.friend_requests where id=p_value and me in(sender_id,recipient_id);
 elsif p_command='remove' then
 delete from private.friendships where first_id=least(me,p_value) and second_id=greatest(me,p_value);
 delete from private.friend_requests where (sender_id=me and recipient_id=p_value) or (sender_id=p_value and recipient_id=me);
 elsif p_command<>'state' then raise exception 'Invalid friend action'; end if;
 select jsonb_build_object(
 'code',(select jsonb_build_object('token',token,'expires_at',expires_at) from private.friend_codes where user_id=me and expires_at>now()),
 'scanned_id',other_id,'request_id',req.id,
 'person',(select jsonb_build_object('id',id,'name',display_name,'photo_path',photo_path) from public.profiles where id=other_id),
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_path',p.photo_path,'since',f.created_at))
 from private.friendships f join public.profiles p on p.id=case when f.first_id=me then f.second_id else f.first_id end
 where me in(f.first_id,f.second_id) and private.qr_friend_peer(p.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'incoming',r.recipient_id=me,'person_id',p.id,'name',p.display_name,'photo_path',p.photo_path) order by r.expires_at)
 from private.friend_requests r join public.profiles p on p.id=case when r.sender_id=me then r.recipient_id else r.sender_id end
 where me in(r.sender_id,r.recipient_id) and r.expires_at>now() and private.qr_friend_peer(p.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.friend_command(text,uuid) from public,anon,authenticated;
grant execute on function public.friend_command(text,uuid) to authenticated;
commit;

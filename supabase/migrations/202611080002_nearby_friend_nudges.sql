begin;

-- Both members must have refreshed their approximate area in the last hour.
-- The 3-mile limit matches the maximum Go Live search radius.
create function private.nudge_friend_nearby(p_sender uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from private.member_settings sender
   join private.member_settings recipient on recipient.user_id=p_recipient
   where sender.user_id=p_sender
     and sender.location_updated_at>=now()-interval '1 hour'
     and recipient.location_updated_at>=now()-interval '1 hour'
     and sender.approx_lat is not null and sender.approx_lon is not null
     and recipient.approx_lat is not null and recipient.approx_lon is not null
     and 2*6371*asin(least(1.0,sqrt(
       power(sin(radians(recipient.approx_lat-sender.approx_lat)/2),2)
       +cos(radians(sender.approx_lat))*cos(radians(recipient.approx_lat))
       *power(sin(radians(recipient.approx_lon-sender.approx_lon)/2),2)
     )))<=4.828032
 );
$$;
revoke all on function private.nudge_friend_nearby(uuid,uuid) from public,anon,authenticated;

create function public.nearby_nudge_friends() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
   where p.id=me and p.onboarding_completed_at is not null and a.account_status='active') then
   raise exception 'Complete your confirmed account first'; end if;
 select coalesce(jsonb_agg(friend.id order by friend.id),'[]'::jsonb) into result
 from (
   select case when f.first_id=me then f.second_id else f.first_id end id
   from private.friendships f where me in(f.first_id,f.second_id)
 ) friend
 where private.nudge_friend_eligible(me,friend.id) and private.nudge_friend_nearby(me,friend.id);
 return result;
end $$;
revoke all on function public.nearby_nudge_friends() from public,anon,authenticated;
grant execute on function public.nearby_nudge_friends() to authenticated;

create or replace function public.nudge_friends(p_recipient uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_count integer:=0; v_friend uuid;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
   where p.id=me and p.onboarding_completed_at is not null and a.account_status='active') then
   raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,73));
 if p_recipient is not null then
   if p_recipient=me then raise exception 'You cannot nudge yourself'; end if;
   if not private.nudge_friend_eligible(me,p_recipient) then raise exception 'This person is no longer your friend'; end if;
   if not private.nudge_friend_nearby(me,p_recipient) then raise exception 'This friend is not nearby right now'; end if;
   if exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=p_recipient and n.dismissed_at is null) then
     raise exception 'Your nudge is already waiting for this friend'; end if;
   if exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=p_recipient and n.created_at>now()-interval '30 minutes') then
     raise exception 'Wait 30 minutes before nudging this friend again'; end if;
   insert into private.friend_nudges(sender_id,recipient_id) values(me,p_recipient);
   v_count:=1;
 else
   if exists(select 1 from private.friend_nudge_batches b where b.sender_id=me and b.created_at>now()-interval '6 hours') then
     raise exception 'Wait 6 hours before nudging all friends again'; end if;
   if not exists(select 1 from private.friendships f where me in(f.first_id,f.second_id)) then
     raise exception 'Add a friend before sending a nudge'; end if;
   insert into private.friend_nudge_batches(sender_id) values(me);
   for v_friend in select case when f.first_id=me then f.second_id else f.first_id end
     from private.friendships f where me in(f.first_id,f.second_id)
   loop
     if private.nudge_friend_eligible(me,v_friend) and private.nudge_friend_nearby(me,v_friend)
       and not exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=v_friend
         and (n.dismissed_at is null or n.created_at>now()-interval '30 minutes')) then
       insert into private.friend_nudges(sender_id,recipient_id) values(me,v_friend);
       v_count:=v_count+1;
     end if;
   end loop;
 end if;
 return jsonb_build_object('sent',v_count);
end $$;
revoke all on function public.nudge_friends(uuid) from public,anon,authenticated;
grant execute on function public.nudge_friends(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

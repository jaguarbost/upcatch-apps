begin;

-- Expiry uses the original creation time. No backfill or deletion of chat history.
create or replace function public.my_friend_nudges() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
   raise exception 'Complete your confirmed account first'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'sender_id',n.sender_id,'sender_name',p.display_name,'created_at',n.created_at)
   order by n.created_at desc),'[]'::jsonb) into result
 from private.friend_nudges n join public.profiles p on p.id=n.sender_id
 where n.recipient_id=me and n.dismissed_at is null and n.created_at>now()-interval '30 minutes'
   and private.nudge_friend_eligible(n.sender_id,me);
 return result;
end $$;
revoke all on function public.my_friend_nudges() from public,anon,authenticated;
grant execute on function public.my_friend_nudges() to authenticated;

create function public.my_sent_friend_nudges() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
   raise exception 'Complete your confirmed account first'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'recipient_id',n.recipient_id,'created_at',n.created_at)
   order by n.created_at desc),'[]'::jsonb) into result
 from private.friend_nudges n
 where n.sender_id=me and n.dismissed_at is null and n.created_at>now()-interval '30 minutes'
   and private.nudge_friend_eligible(me,n.recipient_id);
 return result;
end $$;
revoke all on function public.my_sent_friend_nudges() from public,anon,authenticated;
grant execute on function public.my_sent_friend_nudges() to authenticated;

create or replace function public.nudge_friends(p_recipient uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_count integer:=0; v_friend uuid;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
   where p.id=me and p.onboarding_completed_at is not null and a.account_status='active') then
   raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,73));
 -- Release the existing unique open-pair slot only when this sender resends.
 update private.friend_nudges set dismissed_at=now()
 where sender_id=me and dismissed_at is null and created_at<=now()-interval '30 minutes'
   and (p_recipient is null or recipient_id=p_recipient);
 if p_recipient is not null then
   if p_recipient=me then raise exception 'You cannot nudge yourself'; end if;
   if not private.nudge_friend_eligible(me,p_recipient) then raise exception 'This person is no longer your friend'; end if;
   if exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=p_recipient and n.dismissed_at is null) then
     raise exception 'Your nudge is already waiting for this friend'; end if;
   insert into private.friend_nudges(sender_id,recipient_id) values(me,p_recipient);
   v_count:=1;
 else
   if not exists(select 1 from private.friendships f where me in(f.first_id,f.second_id)) then
     raise exception 'Add a friend before sending a nudge'; end if;
   insert into private.friend_nudge_batches(sender_id) values(me);
   for v_friend in select case when f.first_id=me then f.second_id else f.first_id end
     from private.friendships f where me in(f.first_id,f.second_id)
   loop
     if private.nudge_friend_eligible(me,v_friend)
       and not exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=v_friend and n.dismissed_at is null) then
       insert into private.friend_nudges(sender_id,recipient_id) values(me,v_friend);
       v_count:=v_count+1;
     end if;
   end loop;
 end if;
 return jsonb_build_object('sent',v_count);
end $$;
revoke all on function public.nudge_friends(uuid) from public,anon,authenticated;
grant execute on function public.nudge_friends(uuid) to authenticated;

create or replace function public.friend_nudge_push_active(p_nudge uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.friend_nudges n where n.id=p_nudge and n.dismissed_at is null
   and n.created_at>now()-interval '30 minutes' and private.nudge_friend_eligible(n.sender_id,n.recipient_id));
$$;
revoke all on function public.friend_nudge_push_active(uuid) from public,anon,authenticated;
grant execute on function public.friend_nudge_push_active(uuid) to service_role;

create or replace function private.queue_friend_nudge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.nudge_friend_eligible(new.sender_id,new.recipient_id)
   and exists(select 1 from public.notification_preferences p where p.user_id=new.recipient_id and p.push_enabled) then
   insert into private.notification_jobs(user_id,event_key,kind,payload)
   select new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,'friend_push',
     jsonb_build_object('title',left(p.display_name||' nudged you',120),'text',p.display_name||' is requesting to connect on UpCatch.',
       'route','nudges','nudge_id',new.id,'expires_at',new.created_at+interval '30 minutes')
   from public.profiles p where p.id=new.sender_id
   on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.queue_friend_nudge() from public,anon,authenticated;

create or replace function private.capture_nudge_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_notifications(user_id,event_key,title,body,destination,peer_id,created_at)
 select new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,
   left(p.display_name||' nudged you',120),p.display_name||' is requesting to connect on UpCatch.',
   'nudges',new.sender_id,new.created_at
 from public.profiles p where p.id=new.sender_id
 on conflict(user_id,event_key) do update set title=excluded.title,body=excluded.body,peer_id=excluded.peer_id;
 return new;
end $$;
revoke all on function private.capture_nudge_inbox() from public,anon,authenticated;

-- Preserve stored notification history; expired nudges disappear from member reads/counts.
alter policy member_notifications_read on public.member_notifications
 using(user_id=auth.uid() and (destination<>'nudges' or created_at>now()-interval '30 minutes'));

-- Reveal senders in existing nudge cards and still-pending push jobs only.
update public.member_notifications notification
set title=left(p.display_name||' nudged you',120),body=p.display_name||' is requesting to connect on UpCatch.',peer_id=n.sender_id
from private.friend_nudges n join public.profiles p on p.id=n.sender_id
where notification.destination='nudges' and notification.user_id=n.recipient_id
  and notification.event_key='friend-nudge:'||n.sender_id::text||':'||n.id::text;

update private.notification_jobs job
set payload=job.payload||jsonb_build_object('title',left(p.display_name||' nudged you',120),
  'text',p.display_name||' is requesting to connect on UpCatch.','expires_at',n.created_at+interval '30 minutes')
from private.friend_nudges n join public.profiles p on p.id=n.sender_id
where job.kind='friend_push' and job.state='pending' and job.payload->>'route'='nudges'
  and job.payload->>'nudge_id'=n.id::text and job.user_id=n.recipient_id;

-- Rank by this member's own nudge history; recent distance breaks ties.
create or replace function public.nearby_nudge_friends() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
   where p.id=me and p.onboarding_completed_at is not null and a.account_status='active') then
   raise exception 'Complete your confirmed account first'; end if;
 select coalesce(jsonb_agg(friend.id order by coalesce(history.nudges,0) desc,
   case when own.location_updated_at>=now()-interval '1 hour'
     and location.location_updated_at>=now()-interval '1 hour'
     and own.approx_lat is not null and own.approx_lon is not null
     and location.approx_lat is not null and location.approx_lon is not null
     then 2*6371*asin(least(1.0,sqrt(
       power(sin(radians(location.approx_lat-own.approx_lat)/2),2)
       +cos(radians(own.approx_lat))*cos(radians(location.approx_lat))
       *power(sin(radians(location.approx_lon-own.approx_lon)/2),2)))) end
   nulls last, friend.id),'[]'::jsonb) into result
 from (
   select case when f.first_id=me then f.second_id else f.first_id end id
   from private.friendships f where me in(f.first_id,f.second_id)
 ) friend
 left join private.member_settings own on own.user_id=me
 left join private.member_settings location on location.user_id=friend.id
 left join (select recipient_id,count(*) nudges from private.friend_nudges where sender_id=me group by recipient_id) history
   on history.recipient_id=friend.id
 where private.nudge_friend_eligible(me,friend.id);
 return result;
end $$;
revoke all on function public.nearby_nudge_friends() from public,anon,authenticated;
grant execute on function public.nearby_nudge_friends() to authenticated;

notify pgrst, 'reload schema';
commit;

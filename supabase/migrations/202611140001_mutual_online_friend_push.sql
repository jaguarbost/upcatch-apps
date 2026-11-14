begin;

-- Availability alerts require two currently available friends. Explicit nudges
-- and messages deliberately do not use this availability condition.
create function private.friend_online_push_eligible(p_sender uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.nudge_friend_eligible(p_sender,p_recipient)
   and private.nudge_friend_eligible(p_recipient,p_sender)
   and exists(
     select 1 from private.match_queue sender
     join private.match_queue recipient on recipient.user_id=p_recipient
       and recipient.city_id=sender.city_id and recipient.expires_at>now()
     join private.member_settings source on source.user_id=sender.user_id
     join private.member_settings target on target.user_id=recipient.user_id
     join public.notification_preferences push on push.user_id=recipient.user_id and push.push_enabled
     where sender.user_id=p_sender and sender.expires_at>now()
       and coalesce((source.prefs->>'notifyFriends')::boolean,false)
       and coalesce((target.prefs->>'friendMeetups')::boolean,false)
   );
$$;
revoke all on function private.friend_online_push_eligible(uuid,uuid) from public,anon,authenticated;

create or replace function private.queue_friend_online() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_friend uuid; v_sender uuid; v_recipient uuid; v_expires timestamptz;
begin
 for v_friend in
   select case when f.first_id=new.user_id then f.second_id else f.first_id end
   from private.friendships f where new.user_id in(f.first_id,f.second_id)
 loop
   for v_sender,v_recipient in
     select new.user_id,v_friend union all select v_friend,new.user_id
   loop
     if private.friend_online_push_eligible(v_sender,v_recipient) then
       select least(s.expires_at,r.expires_at) into v_expires
       from private.match_queue s join private.match_queue r on r.user_id=v_recipient
       where s.user_id=v_sender;
       insert into private.notification_jobs(user_id,event_key,kind,payload)
       values(v_recipient,'friend-online:'||v_sender||':'||v_recipient||':'||date_trunc('hour',now())::text,
         'friend_push',jsonb_build_object('title','A friend is free',
           'text','One of your friends is online. Open UpCatch to say hello.',
           'expires_at',v_expires,'route','map'))
       on conflict(event_key) do nothing;
     end if;
   end loop;
 end loop;
 return new;
end $$;
revoke all on function private.queue_friend_online() from public,anon,authenticated;

-- Recheck at dispatch, including jobs queued before this migration.
create function public.friend_online_push_active(p_job uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_job private.notification_jobs; v_sender text;
begin
 select * into v_job from private.notification_jobs where id=p_job and kind='friend_push';
 if not found or v_job.event_key not like 'friend-online:%' then return false; end if;
 v_sender:=split_part(v_job.event_key,':',2);
 if v_sender !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return private.friend_online_push_eligible(v_sender::uuid,v_job.user_id);
end $$;
revoke all on function public.friend_online_push_active(uuid) from public,anon,authenticated;
grant execute on function public.friend_online_push_active(uuid) to service_role;

notify pgrst, 'reload schema';
commit;

begin;

-- No timed nudge cooldowns. Keep one pending request per sender/recipient.
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
       and not exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=v_friend
         and n.dismissed_at is null) then
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

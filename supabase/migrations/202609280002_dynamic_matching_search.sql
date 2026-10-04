-- Update a search atomically without resetting availability or FIFO position.
begin;
create function public.update_matching_search(
 p_intent text default null,p_duration integer default null,p_audience text default null
) returns void language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_city uuid; m public.meetups; v_audience text;
 v_intent text; v_duration integer;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if (p_intent is null)<>(p_duration is null)
   or (p_intent is not null and p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat'))
   or (p_duration is not null and p_duration not in (15,30,45,60,90,120))
   then raise exception 'Choose an intent and duration'; end if;
 if p_audience is not null and p_audience not in ('friends','public','both')
   then raise exception 'Choose your audience'; end if;
 select home_city_id into v_city from public.profiles where id=v_user and onboarding_completed_at is not null;
 if v_city is null then raise exception 'Complete your profile first'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select mm.* into m from public.meetups mm join public.meetup_participants mp on mp.meetup_id=mm.id
   where mp.user_id=v_user and mp.status='reserved' for update of mm;
 if m.id is not null then
   if m.status<>'draft' then raise exception 'Finish or cancel your confirmed meetup before changing your search'; end if;
   select audience into v_audience from private.member_settings where user_id=v_user;
   select intent,duration_min into v_intent,v_duration from private.meetup_queue_snapshots
     where meetup_id=m.id and user_id=v_user;
   if (p_audience is not null and p_audience is distinct from v_audience)
     or (p_intent is not null and (p_intent is distinct from v_intent or p_duration is distinct from v_duration)) then
     perform private.release_match(m.id);
   else return;
   end if;
 end if;
 if p_audience is not null then perform public.set_matching_audience(p_audience); end if;
 if p_intent is not null then
   update private.match_queue set intent=p_intent,duration_min=p_duration where user_id=v_user;
 end if;
 -- Retry uses the saved deadline, FIFO position, radius, and mutual preferences.
 -- Offline accounts remain offline, and expired availability is never recreated.
 perform public.meetup_command('retry');
end $$;
revoke all on function public.update_matching_search(text,integer,text) from public,anon,authenticated;
grant execute on function public.update_matching_search(text,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;

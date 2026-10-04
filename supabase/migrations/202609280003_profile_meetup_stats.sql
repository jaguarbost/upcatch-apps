-- Refresh profile metrics from real participation and ratings received from peers.
begin;
create function public.my_profile_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_rating numeric; v_ratings integer; v_attended integer; v_due integer;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select round(avg(peer.rating),1),count(peer.rating)::integer into v_rating,v_ratings
 from public.meetup_participants p join public.meetups m on m.id=p.meetup_id and m.status='completed'
 join private.meetup_responses peer on peer.meetup_id=m.id and peer.user_id<>v_user
 where p.user_id=v_user and p.status='completed';
 select count(*) filter(where r.arrived_at is not null)::integer,count(*)::integer into v_attended,v_due
 from public.meetup_participants p join public.meetups m on m.id=p.meetup_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 where p.user_id=v_user and (
   (m.status in ('confirmed','completed') and (m.ends_at<=now() or r.arrived_at is not null))
   or p.status='no_show'
 );
 return jsonb_build_object(
   'completed_meetups',coalesce((select completed_meetups from private.member_access where user_id=v_user),0),
   'rating',v_rating,'rating_count',v_ratings,
   'show_up_percent',case when v_due>0 then round(100.0*v_attended/v_due)::integer else null end
 );
end $$;
create function public.rate_meetup(p_meetup uuid,p_rating integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
 update private.meetup_responses r set rating=p_rating
 where r.meetup_id=p_meetup and r.user_id=auth.uid()
   and exists(select 1 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
     where m.id=p_meetup and m.status='completed' and p.user_id=auth.uid() and p.status='completed');
 if not found then raise exception 'No completed meetup to rate'; end if;
end $$;
revoke all on function public.my_profile_stats(),public.rate_meetup(uuid,integer) from public,anon,authenticated;
grant execute on function public.my_profile_stats(),public.rate_meetup(uuid,integer) to authenticated;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=private.live_state_snapshot();
 if s->'queue'<>'null'::jsonb then
  perform public.meetup_command('retry');
  s:=private.live_state_snapshot();
 end if;
 return s||jsonb_build_object('profile_stats',public.my_profile_stats());
end $$;
notify pgrst, 'reload schema';
commit;

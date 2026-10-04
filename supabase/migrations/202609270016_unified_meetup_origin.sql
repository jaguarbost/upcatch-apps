-- Manual and automatic initiation share one meetup model and lifecycle.
begin;
alter table public.meetups add column creation_type text not null default 'auto' check(creation_type in ('manual','auto'));
alter table private.availability_details add column creation_type text not null default 'manual' check(creation_type in ('manual','auto'));
alter table private.match_queue add column creation_type text not null default 'auto' check(creation_type in ('manual','auto'));
create function private.set_meetup_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.availability_details ad where ad.creation_type='manual' and (ad.user_id=new.host_id or ad.user_id=auth.uid())) then new.creation_type:='manual'; end if;
 return new;
end $$;
create trigger meetup_origin before insert on public.meetups for each row execute function private.set_meetup_origin();
create function private.set_queue_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.creation_type:=coalesce((select creation_type from private.availability_details where user_id=new.user_id),'auto');return new;
end $$;
create trigger queue_origin before insert on private.match_queue for each row execute function private.set_queue_origin();
create function public.go_online(p_intent text,p_duration integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km,creation_type) values(auth.uid(),'','{}',3,'auto') on conflict(user_id) do update set note='',preferences='{}',radius_km=3,creation_type='auto';
 perform public.meetup_command('live',null,p_intent,p_duration);
end $$;
revoke execute on function private.set_meetup_origin(),private.set_queue_origin(),public.go_online(text,integer) from public,anon,authenticated;
grant execute on function public.go_online(text,integer) to authenticated;
create or replace function public.publish_availability(p_intent text,p_duration integer,p_window integer,p_radius numeric,p_note text default '',p_preferences text[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_window not in (30,60,120) or p_window is null or p_radius not in (0.5,1,2,3) or p_radius is null or p_note is null or length(p_note)>60 or p_preferences is null or cardinality(p_preferences)>10 then raise exception 'Invalid availability'; end if;
 if 'Women only'=any(p_preferences) then raise exception 'Women-only matching needs a declared gender; choose another preference for now'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km) values(auth.uid(),p_note,p_preferences,p_radius) on conflict(user_id) do update set note=excluded.note,preferences=excluded.preferences,radius_km=excluded.radius_km;
 update private.availability_details set creation_type='manual' where user_id=auth.uid();
 perform public.meetup_command('live',null,p_intent,p_duration);
 update private.match_queue set expires_at=now()+make_interval(mins=>p_window) where user_id=auth.uid();
end $$;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('stats',(select jsonb_build_object('first',count(*),'coffee',count(distinct case when d.intent='coffee' then orr.user_id end),'explorer',count(distinct m.venue_id),'owl',count(*) filter(where extract(hour from m.starts_at at time zone c.timezone)>=21),'early',count(*) filter(where extract(hour from m.starts_at at time zone c.timezone)<8)) from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='completed' join private.meetup_details d on d.meetup_id=m.id join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user join public.cities c on c.id=m.city_id),'friends',coalesce((select jsonb_agg(f) from (select p.id,p.display_name name,case when exists(select 1 from private.match_queue where user_id=p.id) then 'free' else 'offline' end status from private.friendships fs join public.profiles p on p.id=case when fs.first_id=v_user then fs.second_id else fs.first_id end where (fs.first_id=v_user or fs.second_id=v_user) and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=p.id) or (second_id.blocker_id=p.id and second_id.blocked_id=v_user))) f),'[]'::jsonb),'settings',coalesce((select to_jsonb(s)-'user_id'-'approx_lat'-'approx_lon' from private.member_settings s where s.user_id=v_user),'{}'::jsonb),'blocked_count',(select count(*) from private.member_blocks where blocker_id=v_user),'messages',coalesce((select jsonb_agg(messages) from (select msg.id,msg.body text,case when msg.user_id=v_user then 'me' else 'them' end "from" from private.meetup_messages msg join public.meetups mm on mm.id=msg.meetup_id and mm.status='confirmed' join public.meetup_participants mp on mp.meetup_id=mm.id and mp.user_id=v_user and mp.status='reserved' order by msg.id desc limit 100) messages),'[]'::jsonb),'queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'awaiting_offer',exists(select 1 from public.meetups wm join public.meetup_participants wp on wp.meetup_id=wm.id and wp.user_id=v_user and wp.status='reserved' join private.meetup_responses wr on wr.meetup_id=wm.id and wr.user_id=wm.host_id where wm.status='draft' and wm.host_id<>v_user and wr.accepted_at is null),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'creation_type',m.creation_type,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'note',coalesce((select note from private.availability_details where user_id=op.id),''),'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.creation_type,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating,(select display_name from public.profiles op join private.meetup_responses orr on orr.user_id=op.id where orr.meetup_id=m.id and orr.user_id<>v_user) other_name
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
commit;

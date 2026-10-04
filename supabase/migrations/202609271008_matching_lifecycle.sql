-- Keep activity and audience boundaries, resume availability atomically, and close once.
begin;
alter table private.availability_details add column window_min integer check(window_min in (30,60,120));
create table private.meetup_queue_snapshots (
 meetup_id uuid not null references public.meetups(id),
 user_id uuid not null references public.profiles(id),
 city_id uuid not null references public.cities(id), venue_id uuid,
 intent text not null, duration_min integer not null,
 expires_at timestamptz not null, created_at timestamptz not null,
 primary key(meetup_id,user_id),
 foreign key(venue_id,city_id) references public.venues(id,city_id)
);
create table private.match_cooldowns (
 first_id uuid not null references public.profiles(id),
 second_id uuid not null references public.profiles(id),
 expires_at timestamptz not null,
 primary key(first_id,second_id), check(first_id<second_id)
);
alter table private.meetup_queue_snapshots enable row level security;
alter table private.match_cooldowns enable row level security;
revoke all on private.meetup_queue_snapshots,private.match_cooldowns from public,anon,authenticated;
grant select on private.meetup_queue_snapshots,private.match_cooldowns to service_role;

create function private.can_queue(p_user uuid,p_city uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from private.member_access a join public.profiles p on p.id=a.user_id
  join auth.users u on u.id=p.id join public.cities c on c.id=p.home_city_id
  where p.id=p_user and p.home_city_id=p_city and c.status='active'
   and p.onboarding_completed_at is not null and u.email_confirmed_at is not null
   and a.account_status='active' and a.reserved_meetups=0 and private.is_adult(p_user)
   and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
   -- Respect an installed entitlement cap without depending on the deferred admin migration.
   and ((to_jsonb(a)->>'meetup_limit') is null or a.completed_meetups<(to_jsonb(a)->>'meetup_limit')::integer)
 );
$$;

create function private.release_match(p_meetup uuid,p_offline uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare m public.meetups; peer uuid; q private.meetup_queue_snapshots;
begin
 select * into m from public.meetups where id=p_meetup for update;
 if m.status not in ('draft','confirmed') then return; end if;
 select user_id into peer from public.meetup_participants where meetup_id=m.id and user_id<>m.host_id;
 if peer is not null then
  insert into private.match_cooldowns values(least(m.host_id,peer),greatest(m.host_id,peer),now()+interval '30 minutes')
  on conflict(first_id,second_id) do update set expires_at=excluded.expires_at;
 end if;
 update public.meetups set status='cancelled' where id=m.id;
 update public.meetup_participants set status='cancelled' where meetup_id=m.id and status='reserved';
 -- All reservations are released before restoring either member. Never revive expired availability.
 for q in select * from private.meetup_queue_snapshots where meetup_id=m.id order by user_id loop
  if q.user_id is distinct from p_offline and q.expires_at>now() and private.can_queue(q.user_id,q.city_id)
   and (q.venue_id is null or exists(select 1 from public.venues where id=q.venue_id and city_id=q.city_id and status in ('listed','approved'))) then
   insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at,created_at)
   values(q.user_id,q.city_id,q.venue_id,q.intent,q.duration_min,q.expires_at,q.created_at)
   on conflict(user_id) do nothing;
   perform private.record_presence(q.user_id,q.city_id,'online','manual');
  end if;
 end loop;
end $$;
revoke all on function private.can_queue(uuid,uuid),private.release_match(uuid,uuid) from public,anon,authenticated;

create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid; v_intent text; v_queue private.match_queue; v_host uuid;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user and onboarding_completed_at is not null;
 if v_city is null then raise exception 'Complete your profile and choose first_id city'; end if;
 -- Serialize matching within each city. Ledger constraints also prevent global double booking.
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.* into v_meetup from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=v_user and p.status='reserved' for update of m;
 if p_command='offline' then
  delete from private.match_queue where user_id=v_user;
  if v_meetup.id is not null then
    if v_meetup.status<>'draft' then raise exception 'Cancel your meetup first'; end if;
    perform private.release_match(v_meetup.id,v_user);
  end if;
  perform private.record_presence(v_user,v_city,'offline','manual');
 elsif p_command in ('live','retry') then
  if p_command='retry' then
    select * into v_queue from private.match_queue where user_id=v_user and expires_at>now();
    if not found or v_meetup.id is not null then return; end if;
    p_intent:=v_queue.intent; p_duration:=v_queue.duration_min; p_venue:=v_queue.venue_id;
  end if;
  if v_meetup.id is not null then raise exception 'You already have a meetup'; end if;
  if not private.can_queue(v_user,v_city) then
    if p_command='retry' then
      delete from private.match_queue where user_id=v_user;
      perform private.record_presence(v_user,v_city,'offline','expired');
      return;
    end if;
    raise exception 'Your account is not eligible for matching';
  end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status<>'approved' and (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then raise exception 'ID approval is required before your next meetup'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  perform private.record_presence(v_user,v_city,'online','manual');
  if p_command='live' then
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at)
    values(v_user,v_city,p_venue,p_intent,p_duration,now()+make_interval(mins=>coalesce((select window_min from private.availability_details where user_id=v_user),p_duration)))
    on conflict(user_id) do update set city_id=excluded.city_id,venue_id=excluded.venue_id,intent=excluded.intent,
      duration_min=excluded.duration_min,expires_at=excluded.expires_at,created_at=now(),
      audience=coalesce((select audience from private.member_settings where user_id=v_user),'both'),
      creation_type=excluded.creation_type;
  end if;
  select * into v_queue from private.match_queue where user_id=v_user;
  select q.user_id,least(q.duration_min,p_duration),q.venue_id,q.intent into v_other,v_duration,v_venue,v_intent from private.match_queue q
    join private.member_access first_id on first_id.user_id=q.user_id
    where q.city_id=v_city and q.user_id<>v_user and q.expires_at>now()
      and q.intent=p_intent
      and (p_venue is null or q.venue_id is null or p_venue=q.venue_id)
      and private.can_queue(q.user_id,v_city)
      and not exists(select 1 from private.match_cooldowns cd where cd.first_id=least(v_user,q.user_id) and cd.second_id=greatest(v_user,q.user_id) and cd.expires_at>now())
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=q.user_id) or (second_id.blocker_id=q.user_id and second_id.blocked_id=v_user))
      and first_id.account_status='active' and first_id.reserved_meetups=0 and (first_id.id_status='approved' or (first_id.id_status<>'revoked' and first_id.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=v_user),false) or first_id.id_status='approved')
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=q.user_id),false) or v_access.id_status='approved')
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Verified ID only'=any(ad.preferences) and (first_id.id_status<>'approved' or v_access.id_status<>'approved'))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Similar age'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and abs(me.age-them.age)<=5))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Shared interests'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.interests && them.interests))
      and (case coalesce((select audience from private.member_settings where user_id=v_user),'both') when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and (case q.audience when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.approx_lat is not null and them.approx_lat is not null and 6371*2*asin(least(1.0,sqrt(power(sin(radians(them.approx_lat-me.approx_lat)/2),2)+cos(radians(me.approx_lat))*cos(radians(them.approx_lat))*power(sin(radians(them.approx_lon-me.approx_lon)/2),2))))>least(coalesce((select radius_km from private.availability_details where user_id=v_user),3),coalesce((select radius_km from private.availability_details where user_id=q.user_id),3)))
    order by q.created_at,q.user_id limit 1 for update of q;
  if v_other is not null then
    v_venue:=coalesce(v_venue,p_venue);
    if v_venue is null then
      select id into v_venue from public.venues where city_id=v_city and status in ('listed','approved') order by name limit 1;
    end if;
    if v_venue is null then raise exception 'No public venues are available in your city'; end if;
    select user_id into v_host from private.match_queue where user_id in (v_user,v_other) order by created_at,user_id limit 1;
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,v_venue,v_host,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
    insert into private.meetup_details values(v_id,v_intent,now()+interval '30 seconds');
    insert into public.meetup_participants(meetup_id,user_id,status)
      select v_id,u,'reserved' from unnest(array[v_user,v_other]) u order by u;
    insert into private.meetup_responses(meetup_id,user_id) values(v_id,v_user),(v_id,v_other);
    insert into private.meetup_queue_snapshots(meetup_id,user_id,city_id,venue_id,intent,duration_min,expires_at,created_at)
      select v_id,user_id,city_id,venue_id,intent,duration_min,expires_at,created_at from private.match_queue where user_id in (v_user,v_other);
    delete from private.match_queue where user_id in (v_user,v_other);
  end if;
 elsif p_command='rate' then
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose first_id rating from 1 to 5'; end if;
  select m.id into v_id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
    where p.user_id=v_user and p.status='completed' order by m.ends_at desc limit 1;
  if v_id is null then raise exception 'No completed meetup to rate'; end if;
  update private.meetup_responses set rating=p_rating where meetup_id=v_id and user_id=v_user;
 else
  if v_meetup.id is null then raise exception 'No active meetup'; end if;
  if p_command in ('cancel','pass','cancel_offline') then
    perform private.release_match(v_meetup.id,case when p_command='cancel_offline' then v_user else null end);
  elsif p_command='accept' then
    if v_meetup.status<>'draft' then raise exception 'Proposal is no longer pending'; end if;
    if v_user<>v_meetup.host_id and not exists(select 1 from private.meetup_responses where meetup_id=v_meetup.id and user_id=v_meetup.host_id and accepted_at is not null) then raise exception 'Waiting for the first person to accept'; end if;
    if v_user=v_meetup.host_id and not exists(select 1 from private.meetup_responses where meetup_id=v_meetup.id and user_id=v_user and accepted_at is not null) then update private.meetup_details set proposal_expires_at=now()+interval '30 seconds' where meetup_id=v_meetup.id; end if;
    update private.meetup_responses set accepted_at=coalesce(accepted_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and accepted_at is not null)=2 then
      update public.meetups set status='confirmed',starts_at=now(),ends_at=now()+(v_meetup.ends_at-v_meetup.starts_at) where id=v_meetup.id;
    end if;
  elsif p_command='arrive' then
    if v_meetup.status<>'confirmed' then raise exception 'Both people must accept first'; end if;
    update private.meetup_responses set arrived_at=coalesce(arrived_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
  elsif p_command='finish' then
    if v_meetup.status<>'confirmed' or v_meetup.ends_at>now() then raise exception 'Wait until the scheduled meetup ends'; end if;
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and arrived_at is not null)<>2 then raise exception 'Both people must confirm arrival'; end if;
    update private.meetup_responses set finished_at=coalesce(finished_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
    update public.meetups set status='completed' where id=v_meetup.id;
    update public.meetup_participants set status='completed',completed_at=now() where meetup_id=v_meetup.id and status='reserved';
  else raise exception 'Unknown meetup action'; end if;
 end if;
end $$;


-- Save the manual availability window before pairing, including immediate matches.
create or replace function public.go_online(p_intent text,p_duration integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km,creation_type,window_min)
 values(auth.uid(),'','{}',3,'auto',null) on conflict(user_id) do update set note='',preferences='{}',radius_km=3,creation_type='auto',window_min=null;
 perform public.meetup_command('live',null,p_intent,p_duration);
end $$;
create or replace function public.publish_availability(p_intent text,p_duration integer,p_window integer,p_radius numeric,p_note text default '',p_preferences text[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_window not in (30,60,120) or p_window is null or p_radius not in (0.5,1,2,3) or p_radius is null or p_note is null or length(p_note)>60 or p_preferences is null or cardinality(p_preferences)>10 then raise exception 'Invalid availability'; end if;
 if 'Women only'=any(p_preferences) then raise exception 'Women-only matching needs a declared gender; choose another preference for now'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km,creation_type,window_min)
 values(auth.uid(),p_note,p_preferences,p_radius,'manual',p_window)
 on conflict(user_id) do update set note=excluded.note,preferences=excluded.preferences,radius_km=excluded.radius_km,creation_type='manual',window_min=p_window;
 perform public.meetup_command('live',null,p_intent,p_duration);
end $$;

-- Preserve the existing snapshot payload; retry queued members without resetting their deadline or FIFO position.
alter function public.my_live_state() set schema private;
alter function private.my_live_state() rename to live_state_snapshot;
revoke all on function private.live_state_snapshot() from public,anon,authenticated;
create function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=private.live_state_snapshot();
 if s->'queue'<>'null'::jsonb then
  perform public.meetup_command('retry');
  s:=private.live_state_snapshot();
 end if;
 return s;
end $$;
revoke all on function public.my_live_state() from public,anon;
grant execute on function public.my_live_state() to authenticated;

-- Serialize audience updates with matching and prevent an existing offer becoming incompatible.
create or replace function public.set_matching_audience(p_audience text) returns void language plpgsql security definer set search_path='' as $$
declare v_city uuid;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_audience is null or p_audience not in ('friends','public','both') then raise exception 'Choose your audience'; end if;
 select home_city_id into v_city from public.profiles where id=auth.uid();
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 if exists(select 1 from public.meetup_participants where user_id=auth.uid() and status='reserved') then
  raise exception 'Pass or cancel your current meetup before changing audience';
 end if;
 insert into private.member_settings(user_id,audience) values(auth.uid(),p_audience) on conflict(user_id) do update set audience=excluded.audience;
 update private.match_queue set audience=p_audience where user_id=auth.uid();
end $$;

-- A pending offer that times out releases the pair without ending valid availability.
create or replace function private.expire_matches(p_city uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid;
begin
 for v_user in select user_id from private.match_queue where city_id=p_city and expires_at<=now() loop
  perform private.record_presence(v_user,p_city,'offline','expired');
 end loop;
 delete from private.match_queue where city_id=p_city and expires_at<=now();
 for v_id in select m.id from public.meetups m join private.meetup_details d on d.meetup_id=m.id
  where m.city_id=p_city and m.status='draft' and d.proposal_expires_at<=now() for update of m loop
  perform private.release_match(v_id);
 end loop;
 for v_id in select id from public.meetups where city_id=p_city and status='confirmed' and ends_at<now()-interval '24 hours' for update loop
  update public.meetups set status='cancelled' where id=v_id;
  update public.meetup_participants set status='cancelled' where meetup_id=v_id and status='reserved';
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;

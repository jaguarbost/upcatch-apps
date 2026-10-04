-- Private profile settings and real meetup chat. No public member directory.
begin;
create table private.member_settings (
 user_id uuid primary key references public.profiles(id), age integer check(age between 18 and 99),
 interests text[] not null default '{}', prefs jsonb not null default '{"verifiedOnly":false,"share":false,"hideAge":false,"notifyFriends":false,"friendMeetups":false,"friendsFirst":false}',
 approx_lat double precision, approx_lon double precision, trusted_email text,
 check(approx_lat between -90 and 90),check(approx_lon between -180 and 180)
);
create table private.availability_details(user_id uuid primary key references public.profiles(id),note text not null default '' check(length(note)<=60),preferences text[] not null default '{}',radius_km numeric not null default 1 check(radius_km between 0.5 and 3));
create table private.meetup_messages(id bigint generated always as identity primary key,meetup_id uuid not null references public.meetups(id),user_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 80),created_at timestamptz not null default now());
create index meetup_messages_recent on private.meetup_messages(meetup_id,id desc);
create index meetup_messages_rate on private.meetup_messages(user_id,created_at desc);
revoke all on private.member_settings,private.availability_details,private.meetup_messages from public,anon,authenticated;
create function public.save_member_settings(p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_key text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Invalid settings'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if v_key not in ('age','interests','verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst','latitude','longitude','trustedEmail') then raise exception 'Unknown setting'; end if;
  if v_key in ('verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst') and jsonb_typeof(p_patch->v_key)<>'boolean' then raise exception 'Invalid preference'; end if;
 end loop;
 insert into private.member_settings(user_id) values(v_user) on conflict do nothing;
 if p_patch ? 'age' then update private.member_settings set age=(p_patch->>'age')::integer where user_id=v_user; end if;
 if p_patch ? 'interests' then
  if jsonb_typeof(p_patch->'interests')<>'array' or jsonb_array_length(p_patch->'interests')>20 or exists(select 1 from jsonb_array_elements(p_patch->'interests') e where jsonb_typeof(e)<>'string' or length(e#>>'{}') not between 1 and 40) then raise exception 'Invalid interests'; end if;
  update private.member_settings set interests=array(select jsonb_array_elements_text(p_patch->'interests')) where user_id=v_user;
 end if;
 if p_patch ? 'latitude' or p_patch ? 'longitude' then
  if not (p_patch ? 'latitude' and p_patch ? 'longitude') then raise exception 'Both coordinates required'; end if;
  update private.member_settings set approx_lat=round((p_patch->>'latitude')::numeric,2),approx_lon=round((p_patch->>'longitude')::numeric,2) where user_id=v_user;
 end if;
 if p_patch ? 'trustedEmail' then
  if length(p_patch->>'trustedEmail')>254 or (p_patch->>'trustedEmail')!~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
  update private.member_settings set trusted_email=p_patch->>'trustedEmail' where user_id=v_user;
 end if;
 if p_patch->>'share'='true' and not exists(select 1 from private.member_settings where user_id=v_user and trusted_email is not null) then raise exception 'Add a trusted contact first'; end if;
 update private.member_settings set prefs=prefs||(p_patch-'age'-'interests'-'latitude'-'longitude'-'trustedEmail') where user_id=v_user;
end $$;
create function public.send_meetup_message(p_text text) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_id uuid;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_text is null or length(trim(p_text)) not between 1 and 80 then raise exception 'Use 1 to 80 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended('message:'||v_user::text,0));
 select m.id into v_id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved' where m.status='confirmed' for share of m;
 if v_id is null then raise exception 'Chat is available only during a confirmed meetup'; end if;
 if (select count(*) from private.meetup_messages where user_id=v_user and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait before sending more messages'; end if;
 insert into private.meetup_messages(meetup_id,user_id,body) values(v_id,v_user,trim(p_text));
end $$;
create function public.publish_availability(p_intent text,p_duration integer,p_window integer,p_radius numeric,p_note text default '',p_preferences text[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_window not in (30,60,120) or p_window is null or p_radius not in (0.5,1,2,3) or p_radius is null or p_note is null or length(p_note)>60 or p_preferences is null or cardinality(p_preferences)>10 then raise exception 'Invalid availability'; end if;
 if 'Women only'=any(p_preferences) then raise exception 'Women-only matching needs a declared gender; choose another preference for now'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km) values(auth.uid(),p_note,p_preferences,p_radius) on conflict(user_id) do update set note=excluded.note,preferences=excluded.preferences,radius_km=excluded.radius_km;
 perform public.meetup_command('live',null,p_intent,p_duration);
 update private.match_queue set expires_at=now()+make_interval(mins=>p_window) where user_id=auth.uid();
end $$;
revoke execute on function public.save_member_settings(jsonb),public.send_meetup_message(text),public.publish_availability(text,integer,integer,numeric,text,text[]) from public,anon;
grant execute on function public.save_member_settings(jsonb),public.send_meetup_message(text),public.publish_availability(text,integer,integer,numeric,text,text[]) to authenticated;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('settings',coalesce((select to_jsonb(s)-'user_id'-'approx_lat'-'approx_lon' from private.member_settings s where s.user_id=v_user),'{}'::jsonb),'blocked_count',(select count(*) from private.member_blocks where blocker_id=v_user),'messages',coalesce((select jsonb_agg(messages) from (select msg.id,msg.body text,case when msg.user_id=v_user then 'me' else 'them' end "from" from private.meetup_messages msg join public.meetups mm on mm.id=msg.meetup_id and mm.status='confirmed' join public.meetup_participants mp on mp.meetup_id=mm.id and mp.user_id=v_user and mp.status='reserved' order by msg.id desc limit 100) messages),'[]'::jsonb),'queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'awaiting_offer',exists(select 1 from public.meetups wm join public.meetup_participants wp on wp.meetup_id=wm.id and wp.user_id=v_user and wp.status='reserved' join private.meetup_responses wr on wr.meetup_id=wm.id and wr.user_id=wm.host_id where wm.status='draft' and wm.host_id<>v_user and wr.accepted_at is null),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating,(select display_name from public.profiles op join private.meetup_responses orr on orr.user_id=op.id where orr.meetup_id=m.id and orr.user_id<>v_user) other_name
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
create or replace function public.save_profile(p_name text, p_adult boolean, p_city uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_city uuid;
begin
  select coalesce(p_city,(select home_city_id from public.profiles where id=auth.uid()),(select id from public.cities where slug='manchester' and status='active')) into v_city;
  if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
  if length(trim(p_name)) not between 1 and 80 or p_adult is distinct from true then
    raise exception 'Name and adult declaration required';
  end if;
  if v_city is not null and not exists(select 1 from public.cities where id=v_city and status='active') then
    raise exception 'City is not available';
  end if;
  update public.profiles set display_name=trim(p_name),
    adult_declared_at=coalesce(adult_declared_at, now()), home_city_id=v_city, updated_at=now()
    where id=(select auth.uid());
end $$;

create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid; v_intent text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user and onboarding_completed_at is not null;
 if v_city is null then raise exception 'Complete your profile and choose a city'; end if;
 -- Serialize matching within each city. Ledger constraints also prevent global double booking.
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.* into v_meetup from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=v_user and p.status='reserved' for update of m;
 if p_command='offline' then
  delete from private.match_queue where user_id=v_user;
  if v_meetup.id is not null then raise exception 'Cancel your meetup first'; end if;
 elsif p_command='live' then
  if v_meetup.id is not null then raise exception 'You already have a meetup'; end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status<>'approved' and (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then raise exception 'ID approval is required before your next meetup'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  delete from private.match_queue where user_id=v_user;
  select q.user_id,least(q.duration_min,p_duration),q.venue_id,q.intent into v_other,v_duration,v_venue,v_intent from private.match_queue q
    join private.member_access a on a.user_id=q.user_id
    where q.city_id=v_city and q.user_id<>v_user and q.expires_at>now()
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks b where (b.blocker_id=v_user and b.blocked_id=q.user_id) or (b.blocker_id=q.user_id and b.blocked_id=v_user))
      and a.account_status='active' and a.reserved_meetups=0 and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=v_user),false) or a.id_status='approved')
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=q.user_id),false) or v_access.id_status='approved')
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Verified ID only'=any(ad.preferences) and (a.id_status<>'approved' or v_access.id_status<>'approved'))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Similar age'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and abs(me.age-them.age)<=5))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Shared interests'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.interests && them.interests))
    order by q.created_at limit 1 for update of q;
  if v_other is null then
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at)
    values(v_user,v_city,p_venue,p_intent,p_duration,now()+make_interval(mins=>p_duration));
  else
    v_venue:=coalesce(v_venue,p_venue);
    if v_venue is null then
      select id into v_venue from public.venues where city_id=v_city and status in ('listed','approved') order by name limit 1;
    end if;
    if v_venue is null then raise exception 'No public venues are available in your city'; end if;
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,v_venue,v_other,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
    insert into private.meetup_details values(v_id,v_intent,now()+interval '5 minutes');
    insert into public.meetup_participants(meetup_id,user_id,status)
      select v_id,u,'reserved' from unnest(array[v_user,v_other]) u order by u;
    insert into private.meetup_responses(meetup_id,user_id) values(v_id,v_user),(v_id,v_other);
    delete from private.match_queue where user_id in (v_user,v_other);
  end if;
 elsif p_command='rate' then
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  select m.id into v_id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
    where p.user_id=v_user and p.status='completed' order by m.ends_at desc limit 1;
  if v_id is null then raise exception 'No completed meetup to rate'; end if;
  update private.meetup_responses set rating=p_rating where meetup_id=v_id and user_id=v_user;
 else
  if v_meetup.id is null then raise exception 'No active meetup'; end if;
  if p_command='cancel' then
    update public.meetups set status='cancelled' where id=v_meetup.id;
    update public.meetup_participants set status='cancelled' where meetup_id=v_meetup.id and status='reserved';
  elsif p_command='accept' then
    if v_meetup.status<>'draft' then raise exception 'Proposal is no longer pending'; end if;
    if v_user<>v_meetup.host_id and not exists(select 1 from private.meetup_responses where meetup_id=v_meetup.id and user_id=v_meetup.host_id and accepted_at is not null) then raise exception 'Waiting for the first person to accept'; end if;
    if v_user=v_meetup.host_id then update private.meetup_details set proposal_expires_at=now()+interval '5 minutes' where meetup_id=v_meetup.id; end if;
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
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and finished_at is not null)=2 then
      update public.meetups set status='completed' where id=v_meetup.id;
      update public.meetup_participants set status='completed',completed_at=now() where meetup_id=v_meetup.id and status='reserved';
    end if;
  else raise exception 'Unknown meetup action'; end if;
 end if;
end $$;

alter table private.member_settings enable row level security;
alter table private.availability_details enable row level security;
alter table private.meetup_messages enable row level security;
commit;

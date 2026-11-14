-- Restore repeat matches after completed feedback and explain go-online eligibility.
begin;
create or replace function private.release_match(p_meetup uuid,p_offline uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare m public.meetups; peer uuid; q private.meetup_queue_snapshots;
begin
 select * into m from public.meetups where id=p_meetup for update;
 if m.status not in ('draft','confirmed') then return; end if;
 select user_id into peer from public.meetup_participants where meetup_id=m.id and user_id<>m.host_id;
 if peer is not null then
  insert into private.match_cooldowns values(least(m.host_id,peer),greatest(m.host_id,peer),now()+interval '10 seconds')
  on conflict(first_id,second_id) do update set expires_at=excluded.expires_at;
 end if;
 update public.meetups set status='cancelled' where id=m.id;
 update public.meetup_participants set status='cancelled' where meetup_id=m.id and status='reserved';
 -- All reservations are released before restoring either member. Never revive expired availability.
 for q in select * from private.meetup_queue_snapshots where meetup_id=m.id order by user_id loop
  if q.user_id is distinct from p_offline and q.expires_at>now() and private.can_queue(q.user_id,q.city_id)
   and (q.venue_id is null or exists(select 1 from public.venues where id=q.venue_id and city_id=q.city_id and status in ('listed','approved'))) then
   insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at,created_at,audience)
   values(q.user_id,q.city_id,q.venue_id,q.intent,q.duration_min,q.expires_at,q.created_at,coalesce((select audience from private.member_settings where user_id=q.user_id),'both'))
   on conflict(user_id) do nothing;
   perform private.record_presence(q.user_id,q.city_id,'online','manual');
  end if;
 end loop;
end $$;

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
    if exists(select 1 from private.meetup_responses r join public.meetups m on m.id=r.meetup_id join private.meetup_details d on d.meetup_id=m.id where r.user_id=v_user and r.feedback_ack_at is null and (m.status='completed' or (m.status='cancelled' and d.closure_reason='scheduled_end'))) then raise exception 'Finish feedback for your last meetup before going online'; end if;
    if not private.is_adult(v_user) then raise exception 'Complete your adult details before going online'; end if;
    if exists(select 1 from public.profiles p where p.id=v_user and p.onboarding_completed_at is null) then raise exception 'Finish your profile and photo before going online'; end if;
    raise exception 'Your account is not eligible for matching';
  end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status='revoked' then raise exception 'Your account is not eligible for matching'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  perform private.record_presence(v_user,v_city,'online','manual');
  if p_command='live' then
    delete from private.match_offer_counts where first_id=v_user or second_id=v_user;
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
      and coalesce((select offers from private.match_offer_counts oc where oc.first_id=least(v_user,q.user_id) and oc.second_id=greatest(v_user,q.user_id)),0)<3
      and private.can_queue(q.user_id,v_city)
      and private.pair_preferences_allow(v_user,q.user_id,v_city)
      and not exists(select 1 from private.match_cooldowns cd where cd.first_id=least(v_user,q.user_id) and cd.second_id=greatest(v_user,q.user_id) and cd.expires_at>now())
      and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=q.user_id) or (second_id.blocker_id=q.user_id and second_id.blocked_id=v_user))
      and first_id.account_status='active' and first_id.reserved_meetups=0 and first_id.id_status<>'revoked'
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=v_user),false) or first_id.id_status='approved')
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=q.user_id),false) or v_access.id_status='approved')
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Verified ID only'=any(ad.preferences) and (first_id.id_status<>'approved' or v_access.id_status<>'approved'))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Similar age'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and abs(me.age-them.age)<=5))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Shared interests'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.interests && them.interests))
      and (case coalesce((select audience from private.member_settings where user_id=v_user),'both') when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and (case q.audience when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.approx_lat is not null and them.approx_lat is not null and 6371*2*asin(least(1.0,sqrt(power(sin(radians(them.approx_lat-me.approx_lat)/2),2)+cos(radians(me.approx_lat))*cos(radians(them.approx_lat))*power(sin(radians(them.approx_lon-me.approx_lon)/2),2))))>least(coalesce((select radius_km from private.availability_details where user_id=v_user),4.828032),coalesce((select radius_km from private.availability_details where user_id=q.user_id),4.828032)))
    order by (q.intent=p_intent) desc,
      coalesce((select offers from private.match_offer_counts oc where oc.first_id=least(v_user,q.user_id) and oc.second_id=greatest(v_user,q.user_id)),0),
      q.created_at,q.user_id limit 1 for update of q;
  if v_other is not null then
    v_venue:=null;
    -- Members agree on a public venue in chat after matching.
    select user_id into v_host from private.match_queue where user_id in (v_user,v_other) order by created_at,user_id limit 1;
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,v_venue,v_host,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
    insert into private.meetup_details values(v_id,v_intent,now()+interval '30 seconds');
    insert into public.meetup_participants(meetup_id,user_id,status)
      select v_id,u,'reserved' from unnest(array[v_user,v_other]) u order by u;
    insert into private.meetup_responses(meetup_id,user_id) values(v_id,v_user),(v_id,v_other);
    insert into private.meetup_queue_snapshots(meetup_id,user_id,city_id,venue_id,intent,duration_min,expires_at,created_at)
      select v_id,user_id,city_id,venue_id,intent,duration_min,expires_at,created_at from private.match_queue where user_id in (v_user,v_other);
    insert into private.match_offer_counts(first_id,second_id,offers)
      values(least(v_user,v_other),greatest(v_user,v_other),1)
      on conflict(first_id,second_id) do update set offers=private.match_offer_counts.offers+1;
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
    if v_meetup.status<>'draft' then raise exception 'Invite is no longer pending'; end if;
    select user_id into v_other from private.meetup_responses where meetup_id=v_meetup.id and user_id<>v_user;
    if not private.pair_preferences_allow(v_user,v_other,v_city) then
      perform private.release_match(v_meetup.id);
      return;
    end if;
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
    insert into private.match_cooldowns(first_id,second_id,expires_at)
      select least(v_meetup.host_id,p.user_id),greatest(v_meetup.host_id,p.user_id),now()+interval '45 seconds'
      from public.meetup_participants p where p.meetup_id=v_meetup.id and p.user_id<>v_meetup.host_id
      on conflict(first_id,second_id) do update set expires_at=excluded.expires_at;
    -- A completed meetup ends the old slot; eligible members get a fresh search window.
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at,created_at,audience)
      select q.user_id,q.city_id,q.venue_id,q.intent,q.duration_min,
        greatest(q.expires_at,now()+make_interval(mins=>coalesce(ad.window_min,q.duration_min))),now(),
        coalesce(ms.audience,'both')
      from private.meetup_queue_snapshots q
      left join private.availability_details ad on ad.user_id=q.user_id
      left join private.member_settings ms on ms.user_id=q.user_id
      where q.meetup_id=v_meetup.id and private.can_queue(q.user_id,q.city_id)
        and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=q.city_id and v.status in ('listed','approved')))
      on conflict(user_id) do nothing;
  else raise exception 'Unknown meetup action'; end if;
 end if;
end $$;

create or replace function public.complete_meetup_feedback(p_meetup uuid,p_rating integer default null,p_met boolean default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_status text; v_reason text; q private.meetup_queue_snapshots;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select city_id into v_city from public.meetups where id=p_meetup;
 if v_city is null then raise exception 'Meetup not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.status,d.closure_reason into v_status,v_reason
 from public.meetups m join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 where m.id=p_meetup and r.feedback_ack_at is null for update of m;
 if not found or not (v_status='completed' or (v_status='cancelled' and v_reason='scheduled_end'))
   then raise exception 'Feedback is not pending for this meetup'; end if;
 if v_status='completed' and (p_rating is null or p_rating not between 1 and 5 or p_met is not null)
   then raise exception 'Choose a rating from 1 to 5'; end if;
 if v_status='cancelled' and (p_met is null or p_rating is not null)
   then raise exception 'Tell us whether you met'; end if;
 update private.meetup_responses set rating=p_rating,feedback_met=coalesce(p_met,true),feedback_ack_at=now()
   where meetup_id=p_meetup and user_id=v_user;
 delete from private.match_offer_counts oc where exists(select 1 from private.meetup_responses peer where peer.meetup_id=p_meetup and peer.user_id<>v_user and oc.first_id=least(v_user,peer.user_id) and oc.second_id=greatest(v_user,peer.user_id));
 select * into q from private.meetup_queue_snapshots where meetup_id=p_meetup and user_id=v_user;
 if q.user_id is not null and private.can_queue(v_user,q.city_id) then
  insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at,created_at,audience)
  values(q.user_id,q.city_id,q.venue_id,q.intent,q.duration_min,
   now()+make_interval(mins=>coalesce((select window_min from private.availability_details where user_id=v_user),q.duration_min)),
   now(),coalesce((select audience from private.member_settings where user_id=v_user),'both'))
  on conflict(user_id) do nothing;
  perform private.record_presence(v_user,q.city_id,'online','manual');
  perform public.meetup_command('retry');
 end if;
end $$;
create or replace function private.can_queue(p_user uuid,p_city uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from private.member_access a join public.profiles p on p.id=a.user_id
  join auth.users u on u.id=p.id join public.cities c on c.id=p.home_city_id
  where p.id=p_user and p.home_city_id=p_city and c.status='active'
   and p.onboarding_completed_at is not null and u.email_confirmed_at is not null
   and a.account_status='active' and a.reserved_meetups=0 and private.is_adult(p_user)
   and a.id_status<>'revoked'
   -- Respect an installed entitlement cap without depending on the deferred admin migration.
   and ((to_jsonb(a)->>'meetup_limit') is null or a.completed_meetups<(to_jsonb(a)->>'meetup_limit')::integer)
   and not exists(select 1 from private.meetup_responses r join public.meetups m on m.id=r.meetup_id join private.meetup_details d on d.meetup_id=m.id where r.user_id=p_user and r.feedback_ack_at is null and (m.status='completed' or (m.status='cancelled' and d.closure_reason='scheduled_end')))
 );
$$;

create or replace function private.pair_preferences_allow(p_first uuid,p_second uuid,p_city uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from private.member_settings me join private.member_settings them on them.user_id=p_second
  where me.user_id=p_first and me.approx_lat is not null and me.approx_lon is not null
    and them.approx_lat is not null and them.approx_lon is not null
    and not exists(select 1 from private.member_blocks b where (b.blocker_id=p_first and b.blocked_id=p_second) or (b.blocker_id=p_second and b.blocked_id=p_first))
    and (me.audience='both' or (me.audience='friends')=exists(select 1 from private.friendships where first_id=least(p_first,p_second) and second_id=greatest(p_first,p_second)))
    and (them.audience='both' or (them.audience='friends')=exists(select 1 from private.friendships where first_id=least(p_first,p_second) and second_id=greatest(p_first,p_second)))
    and 6371*2*asin(least(1.0,sqrt(power(sin(radians(them.approx_lat-me.approx_lat)/2),2)+cos(radians(me.approx_lat))*cos(radians(them.approx_lat))*power(sin(radians(them.approx_lon-me.approx_lon)/2),2))))
      <=least(coalesce((select radius_km from private.availability_details where user_id=p_first),4.828032),coalesce((select radius_km from private.availability_details where user_id=p_second),4.828032))
    and not exists(select 1 from private.availability_details ad where ad.user_id in (p_first,p_second)
      and (('Similar age'=any(ad.preferences) and (me.age is null or them.age is null or abs(me.age-them.age)>5))
        or ('Shared interests'=any(ad.preferences) and not (me.interests && them.interests))))
    and (select count(*) from private.member_access a join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id
      where p.id in (p_first,p_second) and p.home_city_id=p_city and p.onboarding_completed_at is not null
      and u.email_confirmed_at is not null and a.account_status='active' and private.is_adult(p.id)
      and a.id_status<>'revoked'
      and (not coalesce((case when p.id=p_second then me.prefs else them.prefs end->>'verifiedOnly')::boolean,false) or a.id_status='approved')
      and (not exists(select 1 from private.availability_details ad where ad.user_id in (p_first,p_second) and 'Verified ID only'=any(ad.preferences)) or a.id_status='approved')
      and ((to_jsonb(a)->>'meetup_limit') is null or a.completed_meetups+a.reserved_meetups<=(to_jsonb(a)->>'meetup_limit')::integer)
    )=2
    and exists(select 1 from public.cities where id=p_city and status='active')
 );
$$;

create or replace function private.enforce_meetup_allowance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_access private.member_access;
begin
  if tg_op='UPDATE' and (new.meetup_id<>old.meetup_id or new.user_id<>old.user_id) then
    raise exception 'Participation identity is immutable';
  end if;
  select * into v_access from private.member_access where user_id=new.user_id for update;
  if tg_op='INSERT' then
    if new.status<>'reserved' then raise exception 'Participation must start reserved'; end if;
    if v_access.account_status<>'active' or not exists(
      select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id=new.user_id and u.email_confirmed_at is not null and p.onboarding_completed_at is not null
    ) then raise exception 'Complete verified-email onboarding first'; end if;
    if v_access.id_status='revoked' then raise exception 'Account is not eligible for meetups'; end if;
    update private.member_access set reserved_meetups=reserved_meetups+1 where user_id=new.user_id;
  elsif new.status<>old.status then
    if old.status<>'reserved' or new.status not in ('completed','cancelled','no_show') then
      raise exception 'Invalid participation transition';
    end if;
    if new.status='completed' and not exists(
      select 1 from public.meetups where id=new.meetup_id and status='completed' and ends_at<=now()
    ) then raise exception 'Meetup must be completed by the trusted lifecycle first'; end if;
    update private.member_access set reserved_meetups=reserved_meetups-1,
      completed_meetups=completed_meetups+case when new.status='completed' then 1 else 0 end
      where user_id=new.user_id;
  end if;
  return new;
end $$;

create or replace function public.my_meetup_access()
returns table(completed_meetups integer,reserved_meetups integer,id_status text,id_required boolean)
language sql stable security definer set search_path = '' as $$
  select a.completed_meetups,a.reserved_meetups,a.id_status,
    false
  from private.member_access a where a.user_id=(select auth.uid()) and private.is_confirmed();
$$;

revoke all on function private.can_queue(uuid,uuid),private.pair_preferences_allow(uuid,uuid,uuid),private.enforce_meetup_allowance() from public,anon,authenticated;

revoke all on function public.my_meetup_access() from public,anon;

grant execute on function public.my_meetup_access() to authenticated;

notify pgrst, 'reload schema';

commit;

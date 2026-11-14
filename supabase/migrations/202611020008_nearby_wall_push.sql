-- Notify nearby online members and nearby friends when a future invite is posted.
begin;

create function private.queue_nearby_scheduled_post() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_host private.member_settings%rowtype;
begin
  select * into v_host from private.member_settings where user_id=new.author_id;
  if v_host.location_updated_at is null or v_host.location_updated_at<now()-interval '24 hours'
    or v_host.approx_lat is null or v_host.approx_lon is null then return new; end if;

  insert into private.notification_jobs(user_id,event_key,kind,payload)
  select recipient.id,'scheduled-nearby:'||new.id::text||':'||recipient.id::text,
    'friend_push',jsonb_build_object(
      'title',case when friend.friend_id is not null then 'A friend has a meetup plan nearby' else 'A meetup plan near you' end,
      'text',case when friend.friend_id is not null then 'Your friend posted a plan. Open the Wall to take a look.' else 'Someone nearby posted a plan. Open the Wall to take a look.' end,
      'route','wall','post_id',new.id,'expires_at',new.starts_at)
  from public.profiles recipient
  join private.member_access access on access.user_id=recipient.id
    and access.account_status='active' and access.id_status<>'revoked'
  join private.member_settings location on location.user_id=recipient.id
    and location.location_updated_at>=now()-interval '24 hours'
    and location.approx_lat is not null and location.approx_lon is not null
  join public.notification_preferences push on push.user_id=recipient.id and push.push_enabled
  left join lateral (
    select recipient.id as friend_id from private.friendships friendship
    where (friendship.first_id=new.author_id and friendship.second_id=recipient.id)
       or (friendship.second_id=new.author_id and friendship.first_id=recipient.id)
    limit 1
  ) friend on true
  where recipient.id<>new.author_id and recipient.home_city_id=new.city_id
    and recipient.onboarding_completed_at is not null and private.is_adult(recipient.id)
    and (friend.friend_id is not null or exists(
      select 1 from private.match_queue queue where queue.user_id=recipient.id and queue.expires_at>now()))
    and (friend.friend_id is null or coalesce((location.prefs->>'friendMeetups')::boolean,false))
    and not exists(select 1 from private.member_blocks block
      where (block.blocker_id=new.author_id and block.blocked_id=recipient.id)
         or (block.blocker_id=recipient.id and block.blocked_id=new.author_id))
    and private.scheduled_private_preferences_allow(new.id,recipient.id)
    and 2*6371*asin(least(1.0,sqrt(
      power(sin(radians(location.approx_lat-v_host.approx_lat)/2),2)
      +cos(radians(v_host.approx_lat))*cos(radians(location.approx_lat))
      *power(sin(radians(location.approx_lon-v_host.approx_lon)/2),2)
    )))<=1.609344
  on conflict(event_key) do nothing;
  return new;
end $$;
create trigger nearby_scheduled_post after insert on private.scheduled_posts
for each row execute function private.queue_nearby_scheduled_post();
revoke all on function private.queue_nearby_scheduled_post() from public,anon,authenticated;

create function public.scheduled_post_push_active(p_post uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.scheduled_posts
    where id=p_post and status='open' and starts_at>now());
$$;
revoke all on function public.scheduled_post_push_active(uuid) from public,anon,authenticated;
grant execute on function public.scheduled_post_push_active(uuid) to service_role;

create or replace function public.notification_recipients(p_user uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 with latest as (
  select m.id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=p_user order by m.created_at desc,m.id desc limit 1
 )
 select p_user where p_user is not null
 union
 select p.user_id from public.meetup_participants p join latest m on m.id=p.meetup_id
 union
 select j.user_id from private.notification_jobs j
 where j.kind='friend_push' and j.state='pending'
   and j.event_key like 'friend-online:'||p_user::text||':%'
 union
 select j.user_id from private.notification_jobs j
 join private.scheduled_posts post on j.event_key like 'scheduled-nearby:'||post.id::text||':%'
 where post.author_id=p_user and j.state='pending' and post.status='open' and post.starts_at>now();
$$;

notify pgrst, 'reload schema';
commit;

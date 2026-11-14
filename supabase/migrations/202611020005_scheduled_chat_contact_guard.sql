-- Private chat for accepted Wall pairs and one contact-number rule for both chat types.
begin;
create function private.message_contains_phone(p_body text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_body ~ '([0-9][[:space:]().-]*){10,}',false);
$$;
create function private.reject_phone_in_message() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if private.message_contains_phone(new.body) then
    raise exception 'Keep phone numbers out of UpCatch messages';
  end if;
  return new;
end $$;
create trigger meetup_message_phone_guard before insert or update of body on private.meetup_messages
for each row execute function private.reject_phone_in_message();

create table private.scheduled_post_messages (
  id bigint generated always as identity primary key,
  post_id uuid not null references private.scheduled_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(btrim(body)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index scheduled_post_messages_recent on private.scheduled_post_messages(post_id,id desc);
create index scheduled_post_messages_rate on private.scheduled_post_messages(user_id,created_at desc);
alter table private.scheduled_post_messages enable row level security;
revoke all on private.scheduled_post_messages from public,anon,authenticated;
grant all on private.scheduled_post_messages to service_role;
create trigger scheduled_message_phone_guard before insert or update of body on private.scheduled_post_messages
for each row execute function private.reject_phone_in_message();

create function public.list_scheduled_messages(p_post uuid)
returns table(id bigint,body text,sender_is_me boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_confirmed() then raise exception 'Sign in first'; end if;
  if not exists(select 1 from private.scheduled_posts p
    join private.scheduled_post_requests r on r.post_id=p.id and r.status='accepted'
    where p.id=p_post and p.status='matched'
      and p.starts_at + make_interval(mins=>p.duration_min)>now()
      and (p.author_id=auth.uid() or r.user_id=auth.uid()))
    then raise exception 'This chat is not available'; end if;
  return query select msg.id,msg.body,msg.user_id=auth.uid(),msg.created_at
    from (select m.id,m.body,m.user_id,m.created_at from private.scheduled_post_messages m
      where m.post_id=p_post order by m.id desc limit 100) msg
    order by msg.id;
end $$;

create function public.send_scheduled_message(p_post uuid,p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if not private.is_confirmed() then raise exception 'Sign in first'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 80
    then raise exception 'Use 1 to 80 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||v_user::text,0));
  if not exists(select 1 from private.scheduled_posts p
    join private.scheduled_post_requests r on r.post_id=p.id and r.status='accepted'
    where p.id=p_post and p.status='matched'
      and p.starts_at + make_interval(mins=>p.duration_min)>now()
      and (p.author_id=v_user or r.user_id=v_user))
    then raise exception 'This chat is not available'; end if;
  if (select count(*) from private.scheduled_post_messages
      where user_id=v_user and created_at>now()-interval '1 minute')>=10
    then raise exception 'Please wait before sending more messages'; end if;
  insert into private.scheduled_post_messages(post_id,user_id,body)
    values(p_post,v_user,btrim(p_text));
end $$;
revoke all on function private.message_contains_phone(text),private.reject_phone_in_message() from public,anon,authenticated;
revoke all on function public.list_scheduled_messages(uuid),public.send_scheduled_message(uuid,text) from public,anon;
grant execute on function public.list_scheduled_messages(uuid),public.send_scheduled_message(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;

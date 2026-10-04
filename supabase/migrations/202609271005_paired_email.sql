begin;
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check
  check(kind in ('welcome_email','paired_email','welcome_push','meetup_push','trusted_email','friend_push'));
create function private.queue_paired_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if new.status<>'confirmed' or old.status=new.status then return new; end if;
  for recipient in select user_id from public.meetup_participants where meetup_id=new.id and status='reserved' loop
    insert into private.notification_jobs(user_id,event_key,kind,payload)
    values(recipient,'paired-email:'||new.id||':'||recipient,'paired_email',jsonb_build_object(
      'meetup_id',new.id,'expires_at',new.ends_at,
      'partner_name',(select p.display_name from public.meetup_participants mp join public.profiles p on p.id=mp.user_id where mp.meetup_id=new.id and mp.user_id<>recipient limit 1),
      'venue',(select name||', '||address from public.venues where id=new.venue_id)
    )) on conflict(event_key) do nothing;
  end loop;
  return new;
end $$;
create trigger queue_paired_email after update of status on public.meetups
for each row execute function private.queue_paired_email();
revoke all on function private.queue_paired_email() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

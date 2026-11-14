-- Invite both participants to leave feedback when a meetup completes.
begin;
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check
  check(kind in ('welcome_email','paired_email','feedback_email','welcome_push','meetup_push','trusted_email','friend_push'));

create function private.queue_feedback_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if new.status<>'completed' or old.status=new.status then return new; end if;
  for recipient in select user_id from public.meetup_participants where meetup_id=new.id and status='reserved' loop
    insert into private.notification_jobs(user_id,event_key,kind,payload)
    values(recipient,'feedback-email:'||new.id||':'||recipient,'feedback_email',
      jsonb_build_object('meetup_id',new.id))
    on conflict(event_key) do nothing;
  end loop;
  return new;
end $$;
create trigger queue_feedback_email after update of status on public.meetups
for each row execute function private.queue_feedback_email();
revoke all on function private.queue_feedback_email() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

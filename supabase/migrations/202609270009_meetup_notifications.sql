-- Matching alerts and opt-in trusted-contact emails use the existing durable outbox.
begin;
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in ('welcome_email','welcome_push','meetup_push','trusted_email','friend_push'));
alter table private.notification_jobs add column payload jsonb not null default '{}';
create or replace function public.begin_notification_delivery(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare first_attempt timestamptz; job_kind text;
begin
 select provider_attempted_at,kind into first_attempt,job_kind from private.notification_jobs where id=p_id and lease_token=p_lease and state='processing' for update;
 if not found then return false; end if;
 if first_attempt is not null and first_attempt<now()-(case when job_kind like '%email' then interval '23 hours' else interval '29 days' end) then return false; end if;
 update private.notification_jobs set provider_attempted_at=coalesce(provider_attempted_at,now()) where id=p_id;
 return true;
end $$;
create function private.queue_meetup_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetups; v_recipient uuid; v_expiry timestamptz;
begin
 select * into m from public.meetups where id=new.meetup_id;
 if m.status<>'draft' or new.user_id<>m.host_id then return new; end if;
 select proposal_expires_at into v_expiry from private.meetup_details where meetup_id=m.id;
 if tg_op='INSERT' then v_recipient:=m.host_id;
 elsif old.accepted_at is null and new.accepted_at is not null then select user_id into v_recipient from private.meetup_responses where meetup_id=m.id and user_id<>m.host_id;
 else return new; end if;
 insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_recipient,'offer:'||m.id||':'||v_recipient,'meetup_push',jsonb_build_object('title','A new UpCatch','text','You have a meetup offer. Open UpCatch to accept or pass.','expires_at',v_expiry)) on conflict do nothing;
 return new;
end $$;
create trigger queue_meetup_offer after insert or update of accepted_at on private.meetup_responses for each row execute function private.queue_meetup_offer();
create function private.queue_meetup_status() returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid; s private.member_settings; v_venue text; v_other text;
begin
 if new.status=old.status or new.status not in ('confirmed','cancelled','completed') then return new; end if;
 for v_user in select user_id from public.meetup_participants where meetup_id=new.id loop
  insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_user,'status:'||new.id||':'||new.status||':'||v_user,'meetup_push',jsonb_build_object('title','UpCatch '||new.status,'text',case new.status when 'confirmed' then 'Both people accepted. Your meetup is confirmed.' when 'completed' then 'Your meetup is complete. Leave your rating in UpCatch.' else 'Your meetup was cancelled. Open UpCatch for details.' end)) on conflict do nothing;
  select * into s from private.member_settings where user_id=v_user;
  if new.status='confirmed' and s.trusted_email is not null and coalesce((s.prefs->>'share')::boolean,false) then
   select name||', '||address into v_venue from public.venues where id=new.venue_id;
   select display_name into v_other from public.profiles where id=(select user_id from public.meetup_participants where meetup_id=new.id and user_id<>v_user);
   insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_user,'trusted:'||new.id||':'||v_user,'trusted_email',jsonb_build_object('to',s.trusted_email,'title','UpCatch meetup details','text','Your contact has agreed to meet '||v_other||' at '||v_venue||'. Scheduled start: '||new.starts_at::text)) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger queue_meetup_status after update of status on public.meetups for each row execute function private.queue_meetup_status();
revoke execute on function private.queue_meetup_offer(),private.queue_meetup_status() from public,anon,authenticated;
commit;

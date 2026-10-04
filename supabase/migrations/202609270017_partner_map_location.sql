-- Only the matched peer's rounded area is shared; exact device GPS is never stored.
begin;
alter table private.member_settings add column location_updated_at timestamptz;
create function public.my_partner_location() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 return (select jsonb_build_object('meetup_id',m.id,'latitude',s.approx_lat,'longitude',s.approx_lon,'updated_at',s.location_updated_at)
 from public.meetups m join public.meetup_participants own on own.meetup_id=m.id and own.user_id=auth.uid() and own.status='reserved'
 join private.meetup_responses peer on peer.meetup_id=m.id and peer.user_id<>auth.uid()
 join private.meetup_responses first_response on first_response.meetup_id=m.id and first_response.user_id=m.host_id
 join private.meetup_details d on d.meetup_id=m.id
 join private.member_settings s on s.user_id=peer.user_id
 join private.member_access access on access.user_id=peer.user_id and access.account_status='active'
 where m.status in ('draft','confirmed') and (m.status='confirmed' or d.proposal_expires_at>now())
 and (m.status='confirmed' or m.host_id=auth.uid() or first_response.accepted_at is not null)
 and s.approx_lat is not null and s.approx_lon is not null
 and not exists(select 1 from private.member_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=peer.user_id) or (b.blocker_id=peer.user_id and b.blocked_id=auth.uid())));
end $$;
revoke execute on function public.my_partner_location() from public,anon;
grant execute on function public.my_partner_location() to authenticated;
create or replace function public.save_member_settings(p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
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
  update private.member_settings set location_updated_at=now(),approx_lat=round((p_patch->>'latitude')::numeric,2),approx_lon=round((p_patch->>'longitude')::numeric,2) where user_id=v_user;
 end if;
 if p_patch ? 'trustedEmail' then
  if length(p_patch->>'trustedEmail')>254 or (p_patch->>'trustedEmail')!~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
  update private.member_settings set trusted_email=p_patch->>'trustedEmail' where user_id=v_user;
 end if;
 if p_patch->>'share'='true' and not exists(select 1 from private.member_settings where user_id=v_user and trusted_email is not null) then raise exception 'Add a trusted contact first'; end if;
 update private.member_settings set prefs=prefs||(p_patch-'age'-'interests'-'latitude'-'longitude'-'trustedEmail') where user_id=v_user;
end $$;
commit;

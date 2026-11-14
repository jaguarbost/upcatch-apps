-- Permit only viewers of a visible Wall invite to load its host photo.
begin;
create function public.scheduled_post_photo_path(p_post uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_path text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select p.home_city_id into v_city from public.profiles p
 join private.member_access access on access.user_id=p.id
 join public.cities city on city.id=p.home_city_id
 where p.id=v_user and p.onboarding_completed_at is not null
  and access.account_status='active' and access.id_status<>'revoked'
  and private.is_adult(p.id) and city.status='active';
 if v_city is null then return null; end if;
 select author.photo_path into v_path
 from private.scheduled_posts post
 join public.profiles author on author.id=post.author_id and author.home_city_id=post.city_id
 join private.member_access author_access on author_access.user_id=author.id and author_access.account_status='active'
 where post.id=p_post and post.city_id=v_city and post.starts_at>now()
  and (post.status='open' or (post.status='matched' and
    (post.author_id=v_user or exists(select 1 from private.scheduled_post_requests accepted
      where accepted.post_id=post.id and accepted.user_id=v_user and accepted.status='accepted'))))
  and not exists(select 1 from private.member_blocks b
    where (b.blocker_id=v_user and b.blocked_id=post.author_id)
       or (b.blocker_id=post.author_id and b.blocked_id=v_user));
 return v_path;
end $$;
revoke all on function public.scheduled_post_photo_path(uuid) from public,anon;
grant execute on function public.scheduled_post_photo_path(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

-- A member can have several future accepted Wall plans; expose each chat separately.
begin;
create function public.my_scheduled_plans() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(plan.details order by plan.starts_at,plan.post_id),'[]'::jsonb)
  from (
    select p.id post_id,p.starts_at,
      jsonb_build_object('post_id',p.id,'starts_at',p.starts_at,
        'ends_at',p.starts_at + make_interval(mins=>p.duration_min),
        'intent',p.intent,'note',p.note,'partner_name',partner.display_name,
        'is_mine',p.author_id=auth.uid()) details
    from private.scheduled_posts p
    join private.scheduled_post_requests r on r.post_id=p.id and r.status='accepted'
    join public.profiles partner on partner.id=case when p.author_id=auth.uid() then r.user_id else p.author_id end
    where p.status='matched' and p.starts_at + make_interval(mins=>p.duration_min)>now()
      and (p.author_id=auth.uid() or r.user_id=auth.uid()) and private.is_confirmed()
  ) plan;
$$;
revoke all on function public.my_scheduled_plans() from public,anon;
grant execute on function public.my_scheduled_plans() to authenticated;
notify pgrst, 'reload schema';
commit;

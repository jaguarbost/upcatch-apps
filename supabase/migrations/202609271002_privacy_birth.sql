begin;
create table private.birth_details (
 user_id uuid primary key references public.profiles(id), birth_month integer not null check(birth_month between 1 and 12),
 birth_year integer not null check(birth_year between 1900 and 9999)
);
alter table private.birth_details enable row level security;
revoke all on private.birth_details from public,anon,authenticated;
create function private.is_adult(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (make_date(birth_year,birth_month,1)+interval '18 years 1 month')::date <= (now() at time zone 'Europe/London')::date from private.birth_details where user_id=p_user),false);
$$;
revoke all on function private.is_adult(uuid) from public,anon,authenticated;
alter function public.save_profile(text,boolean,uuid) rename to save_profile_declared;
revoke all on function public.save_profile_declared(text,boolean,uuid) from public,anon,authenticated;
create function public.save_profile(p_name text,p_adult boolean,p_city uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_adult(auth.uid()) then raise exception 'Birth month and year confirming age 18 or older required'; end if;
 perform public.save_profile_declared(p_name,p_adult,p_city);
end $$;
create function public.save_profile_birth(p_name text,p_month integer,p_year integer,p_city uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
 if p_month is null or p_year is null or p_month not between 1 and 12 or p_year not between 1900 and extract(year from now())::integer then raise exception 'Enter a valid birth month and year'; end if;
 if (make_date(p_year,p_month,1)+interval '18 years 1 month')::date > (now() at time zone 'Europe/London')::date then raise exception 'UpCatch is for people aged 18 and over'; end if;
 if exists(select 1 from private.birth_details where user_id=auth.uid() and (birth_month<>p_month or birth_year<>p_year)) then raise exception 'Request a birth detail correction through privacy requests'; end if;
 insert into private.birth_details values(auth.uid(),p_month,p_year) on conflict(user_id) do nothing;
 perform public.save_profile(p_name,true,p_city);
 insert into private.member_settings(user_id,age) values(auth.uid(),least(99,extract(year from age((now() at time zone 'Europe/London')::date,(make_date(p_year,p_month,1)+interval '1 month')::date))::integer))
 on conflict(user_id) do update set age=excluded.age;
end $$;
create function public.my_birth_eligibility() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_confirmed() and private.is_adult(auth.uid());
$$;
create function private.guard_adult_participation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.is_adult(new.user_id) then raise exception 'Birth month and year confirming age 18 or older required'; end if;
 return new;
end $$;
create trigger adult_queue before insert or update on private.match_queue for each row execute function private.guard_adult_participation();
create trigger adult_participant before insert on public.meetup_participants for each row execute function private.guard_adult_participation();
delete from private.match_queue where not private.is_adult(user_id);
create function private.guard_adult_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.onboarding_completed_at is not null and (new.photo_path is distinct from old.photo_path or new.onboarding_completed_at is distinct from old.onboarding_completed_at) and not private.is_adult(new.id) then raise exception 'Birth month and year confirming age 18 or older required'; end if;
 if new.onboarding_completed_at is not null and (new.photo_path is distinct from old.photo_path or new.onboarding_completed_at is distinct from old.onboarding_completed_at) and not exists(select 1 from private.member_settings where user_id=new.id and approx_lat is not null and approx_lon is not null) then raise exception 'Location is required to complete onboarding'; end if;
 return new;
end $$;
create trigger adult_photo before update on public.profiles for each row execute function private.guard_adult_photo();
revoke all on function private.guard_adult_participation(),private.guard_adult_photo() from public,anon,authenticated;
revoke all on function public.save_profile(text,boolean,uuid),public.save_profile_birth(text,integer,integer,uuid),public.my_birth_eligibility() from public,anon;
grant execute on function public.save_profile(text,boolean,uuid),public.save_profile_birth(text,integer,integer,uuid),public.my_birth_eligibility() to authenticated;
create table private.privacy_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('access','portability','correction','erasure','restriction','objection')),
 status text not null default 'open' check(status in ('open','completed','declined')),
 created_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index privacy_request_open on private.privacy_requests(user_id,kind) where status='open';
alter table private.privacy_requests enable row level security;
revoke all on private.privacy_requests from public,anon,authenticated;
create function public.request_privacy_right(p_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
 insert into private.privacy_requests(user_id,kind) values(auth.uid(),p_kind) on conflict do nothing;
end $$;
create function public.my_privacy_requests() returns table(id uuid,kind text,status text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select r.id,r.kind,r.status,r.created_at from private.privacy_requests r where r.user_id=auth.uid() and private.is_confirmed() order by r.created_at desc;
$$;
revoke all on function public.request_privacy_right(text),public.my_privacy_requests() from public,anon;
grant execute on function public.request_privacy_right(text),public.my_privacy_requests() to authenticated;
commit;

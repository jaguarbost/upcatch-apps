-- Keep approximate coordinates private for radius matching; never return a partner's location.
begin;
drop function public.my_partner_location();
notify pgrst, 'reload schema';
commit;

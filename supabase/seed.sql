-- Manchester MVP catalogue. Researched 2026-09-26; see docs/manchester-venues.md.
-- Idempotent: rerunning never overwrites operator edits or review decisions.
begin;
insert into public.cities(country_code,slug,name,region_name,timezone,status,latitude,longitude)
values('GB','manchester','Manchester','Greater Manchester','Europe/London','active',53.4808,-2.2426)
on conflict(country_code,slug) do nothing;
insert into public.neighbourhoods(city_id,slug,name)
select c.id,n.slug,n.name from public.cities c cross join (values
('spinningfields','Spinningfields'),('deansgate','Deansgate'),('central','City Centre'),
('oxford-road','Oxford Road'),('ancoats','Ancoats'),('piccadilly','Piccadilly'),
('corn-exchange','Corn Exchange')) as n(slug,name)
where c.country_code='GB' and c.slug='manchester'
on conflict(city_id,slug) do nothing;
insert into public.venues(city_id,neighbourhood_id,slug,name,address,cuisine,website_url,source_url,source_checked_at,status)
select c.id,n.id,v.slug,v.name,v.address,v.cuisine,v.website,v.website,date '2026-09-26','listed'
from public.cities c
cross join (values
('dishoom-manchester','Dishoom Manchester','32 Bridge Street, Manchester, M3 3BT','Indian','spinningfields','https://www.dishoom.com/manchester/'),
('hawksmoor-manchester','Hawksmoor Manchester','184–186 Deansgate, Manchester, M3 3WB','Steak and seafood','deansgate','https://thehawksmoor.com/locations/manchester/'),
('the-ivy-spinningfields','The Ivy Spinningfields','The Pavilion, Byrom Street, Manchester, M3 3HG','British','spinningfields','https://ivycollection.com/restaurants-near-me/the-ivy-north-west/the-ivy-manchester/'),
('20-stories','20 Stories','No 1 Spinningfields, 1 Hardman Square, Manchester, M3 3EB','Modern British','spinningfields','https://20stories.co.uk/contact-us/'),
('el-gato-negro','El Gato Negro','52 King Street, Manchester, M2 4LY','Spanish tapas','central','https://www.elgatonegrotapas.com/manchester/'),
('san-carlo-manchester','San Carlo Manchester','40–42 King Street West, Manchester, M3 2WY','Italian','deansgate','https://sancarlo.co.uk/restaurants/manchester/san-carlo-manchester/'),
('the-refuge','The Refuge','Oxford Street, Manchester, M60 7HA','International','oxford-road','https://www.refugemcr.co.uk/'),
('the-french','The French','The Midland, 16 Peter Street, Manchester, M60 2DS','Modern British','central','https://www.themidlandhotel.co.uk/contact'),
('mana','mana','42 Blossom Street, Ancoats, Manchester, M4 6BF','Modern British','ancoats','https://manarestaurant.co.uk/pages/contact'),
('rudys-ancoats','Rudy’s Pizza Napoletana — Ancoats','9 Cotton Street, Ancoats, Manchester, M4 5BF','Neapolitan pizza','ancoats','https://www.rudyspizza.co.uk/location/ancoats/'),
('bundobust-piccadilly','Bundobust Manchester Piccadilly','61 Piccadilly, Manchester, M1 2AG','Indian vegetarian','piccadilly','https://bundobust.com/locations/manchester/'),
('mowgli-corn-exchange','Mowgli Manchester','Corn Exchange, Exchange Square, Manchester, M4 3TR','Indian street food','corn-exchange','https://mowglistreetfood.com/restaurants/manchester/'),
('fogo-de-chao-manchester','Fogo de Chão Manchester (formerly Fazenda)','The Avenue, Spinningfields, Manchester, M3 3AP','Brazilian steakhouse','spinningfields','https://fogodechao.uk/location/manchester/'),
('six-by-nico-deansgate','Six by Nico Manchester Deansgate','2 John Dalton Street, Manchester, M3 2BY','Tasting menus','deansgate','https://www.sixbynico.co.uk/manchester/'),
('blacklock-manchester','Blacklock Manchester','37 Peter Street, Manchester, M2 5GB','Steak and chops','central','https://theblacklock.com/restaurants/manchester/'),
('tattu-manchester','Tattu Manchester','3 Hardman Square, Gartside Street, Manchester, M3 3EB','Contemporary Chinese','spinningfields','https://tattu.co.uk/contact/'),
('gaucho-manchester','Gaucho Manchester','2a St Mary’s Street, Manchester, M3 2LB','Argentinian steakhouse','deansgate','https://gauchorestaurants.com/manchester-relaunch/'),
('sexy-fish-manchester','Sexy Fish Manchester','1 The Avenue, Spinningfields, Manchester, M3 3AP','Asian seafood','spinningfields','https://sexyfishmanchester.com/contact-us/'),
('canto','Canto','Cutting Room Square, Blossom Street, Ancoats, Manchester, M4 5DH','Mediterranean tapas','ancoats','https://www.cantorestaurant.com/book/'),
('honest-burgers-manchester','Honest Burgers Manchester','36 Bridge Street, Manchester, M3 3BT','Burgers','spinningfields','https://www.honestburgers.co.uk/locations/manchester/')
) as v(slug,name,address,cuisine,neighbourhood,website)
join public.neighbourhoods n on n.city_id=c.id and n.slug=v.neighbourhood
where c.country_code='GB' and c.slug='manchester'
on conflict(city_id,slug) do nothing;
commit;

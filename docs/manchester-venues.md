# Manchester MVP venues

Selected 26 September 2026. These are 20 well-known restaurants, not a measured “top 20” ranking. Names and addresses were checked against the linked restaurant/operator sources; mana's street number/postcode are also corroborated by [the Michelin Guide](https://guide.michelin.com/th/en/greater-manchester/manchester/restaurant/mana).

They are seeded as `listed`, with `reviewed_at = NULL`: a catalogue listing does not assert a partnership, ID verification, venue safety, live availability, or booking acceptance. No venue photos are copied from these sites. Coordinates remain NULL until entrance locations are checked; the MVP directory uses address-based directions instead of invented map pins. Cuisine labels are editorial categories.

Fazenda's official Manchester URL now redirects to Fogo de Chão, so the seed uses the current name with the former name for recognition. Six by Nico uses the current Deansgate location, not the older Spring Gardens address.

| Restaurant | Address | Source |
| --- | --- | --- |
| Dishoom Manchester | 32 Bridge Street, Manchester, M3 3BT | [Operator website](https://www.dishoom.com/manchester/) |
| Hawksmoor Manchester | 184–186 Deansgate, Manchester, M3 3WB | [Operator website](https://thehawksmoor.com/locations/manchester/) |
| The Ivy Spinningfields | The Pavilion, Byrom Street, Manchester, M3 3HG | [Operator website](https://ivycollection.com/restaurants-near-me/the-ivy-north-west/the-ivy-manchester/) |
| 20 Stories | No 1 Spinningfields, 1 Hardman Square, Manchester, M3 3EB | [Operator website](https://20stories.co.uk/contact-us/) |
| El Gato Negro | 52 King Street, Manchester, M2 4LY | [Operator website](https://www.elgatonegrotapas.com/manchester/) |
| San Carlo Manchester | 40–42 King Street West, Manchester, M3 2WY | [Operator website](https://sancarlo.co.uk/restaurants/manchester/san-carlo-manchester/) |
| The Refuge | Oxford Street, Manchester, M60 7HA | [Operator website](https://www.refugemcr.co.uk/) |
| The French | The Midland, 16 Peter Street, Manchester, M60 2DS | [Operator website](https://www.themidlandhotel.co.uk/contact) |
| mana | 42 Blossom Street, Ancoats, Manchester, M4 6BF | [Operator website](https://manarestaurant.co.uk/pages/contact) |
| Rudy’s Pizza Napoletana — Ancoats | 9 Cotton Street, Ancoats, Manchester, M4 5BF | [Operator website](https://www.rudyspizza.co.uk/location/ancoats/) |
| Bundobust Manchester Piccadilly | 61 Piccadilly, Manchester, M1 2AG | [Operator website](https://bundobust.com/locations/manchester/) |
| Mowgli Manchester | Corn Exchange, Exchange Square, Manchester, M4 3TR | [Operator website](https://mowglistreetfood.com/restaurants/manchester/) |
| Fogo de Chão Manchester (formerly Fazenda) | The Avenue, Spinningfields, Manchester, M3 3AP | [Operator website](https://fogodechao.uk/location/manchester/) |
| Six by Nico Manchester Deansgate | 2 John Dalton Street, Manchester, M3 2BY | [Operator website](https://www.sixbynico.co.uk/manchester/) |
| Blacklock Manchester | 37 Peter Street, Manchester, M2 5GB | [Operator website](https://theblacklock.com/restaurants/manchester/) |
| Tattu Manchester | 3 Hardman Square, Gartside Street, Manchester, M3 3EB | [Operator website](https://tattu.co.uk/contact/) |
| Gaucho Manchester | 2a St Mary’s Street, Manchester, M3 2LB | [Operator website](https://gauchorestaurants.com/manchester-relaunch/) |
| Sexy Fish Manchester | 1 The Avenue, Spinningfields, Manchester, M3 3AP | [Operator website](https://sexyfishmanchester.com/contact-us/) |
| Canto | Cutting Room Square, Blossom Street, Ancoats, Manchester, M4 5DH | [Operator website](https://www.cantorestaurant.com/book/) |
| Honest Burgers Manchester | 36 Bridge Street, Manchester, M3 3BT | [Operator website](https://www.honestburgers.co.uk/locations/manchester/) |

Apply `supabase/seed.sql` after the migrations. It can run repeatedly without duplicate rows and preserves later operator edits. Add other cities and their venues as data, using a city-specific slug and valid IANA timezone.

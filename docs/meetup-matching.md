# Matching and meetup closure

- Match the same activity within the same city. Friends means existing friends; Public means new people; Both allows either. Both members' audience choices must allow the pairing.
- Apply eligibility, blocks, radius and saved preferences before selecting the oldest eligible queued member. Do not silently broaden activity or audience.
- Pass or cancel restores both members' saved availability while it remains valid. Exclude the same pair for 30 minutes. Going offline and reporting/leaving remain explicit exits.
- After both members arrive and the scheduled end passes, either member can close the meetup with We met. Record who confirmed; release both reservations and count each completion once. Each member rates independently.

These changes require migration `202609271008_matching_lifecycle.sql`. Local database checks use PGlite; they do not verify hosted Supabase or notification delivery.

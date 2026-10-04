# Run UpCatch

The implemented slice is email-verified Supabase authentication, persistent profile/photo onboarding, an authenticated Manchester venue directory, and OneSignal/Resend/Vercel Cron foundations. Live matching and the ID-upload/review UI remain deferred; the database already contains the global three-meetup allowance foundation.

## 1. Local setup

Use Node 22 and pnpm 10.30.3 (the package manager version tested for this repository).

```powershell
pnpm install
# For first setup only; do not overwrite an existing .env.local
Copy-Item .env.example .env.local
```

Populate the required Supabase URL, publishable key, server secret key, and site URL in `.env.local`. Never send secret keys in chat or commit them. Leave optional OneSignal values blank until that service is configured. Use separate projects/credentials for development and production.

## 2. Supabase Free

Create a Free project in a region near the pilot. In the SQL Editor, run these files in order:

1. `supabase/migrations/202609260001_foundation.sql`
2. `supabase/migrations/202609260002_meetup_foundation.sql`
3. `supabase/migrations/202609260003_operational_guards.sql`
4. `supabase/seed.sql`

Migrations are versioned, one-time changes. The seed is repeatable and will not overwrite operator edits. For future releases use Supabase CLI migration history rather than rerunning old SQL. No live project has been migrated by this implementation.

The migration creates a **private** `profile-photos` bucket. Browser clients cannot upload directly or change a validated object: the authenticated server action validates/re-encodes the image and writes it using the server key. Raw files go into Storage; Postgres holds their paths.

Keep the `private` schema out of the Data API exposed schemas. Do not expose it to the browser. Only `public` functions explicitly granted to `authenticated` may be called by members. Do not add permissive catch-all policies to these tables or Storage.

## 3. Required email confirmation and Resend

In Supabase Authentication settings:

- Enable email/password and **Confirm email**.
- Require at least 12-character passwords.
- Disable anonymous signup and unused providers for this slice.
- Set Site URL to the exact app origin, e.g. `http://localhost:3000` locally.
- Allow only the local and deployed confirmation/reset callback origins you use.
- Connect Resend custom SMTP using a verified sending domain and sender.
- Configure provider sending limits and resend throttling.

Set the signup-confirmation email link template to:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

Set password recovery to:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

For email-change messages use the same path with `type=email_change`. The callback strips the token from the URL into a short-lived HttpOnly cookie, then redirects to a clean confirmation page. That page requires a button press before token consumption, reducing accidental consumption by email link scanners. The token is never rendered into the page.

Supabase owns tokens and confirmation state; Resend SMTP only delivers them. `RESEND_API_KEY` and `EMAIL_FROM` additionally enable the application's welcome email. They do not configure Supabase SMTP automatically. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend integration](https://supabase.com/partners/resend)

## 4. OneSignal web push

Create a Web Push app for the exact origin and configure its icon and service worker at `/OneSignalSDKWorker.js`. Set `NEXT_PUBLIC_ONESIGNAL_APP_ID`, server-only `ONESIGNAL_API_KEY`, and a stable random `ONESIGNAL_ALIAS_SECRET` of at least 32 characters. Use distinct apps for staging and production.

Push is opt-in from the completed account page. It is never required to finish onboarding. The server derives an unguessable external alias using HMAC, rather than exposing the account UUID as the alias. The frontend retrieves only its own alias from an authenticated endpoint. Do not log or disclose aliases.

**Current Web SDK limitation:** OneSignal JWT identity verification is not supported by its Web SDK. Do not enable its native-only JWT toggle or pretend this integration provides cryptographically verified web identity. Opaque aliases reduce guessing risk but are not equivalent to that feature; keep notification content generic. [OneSignal identity verification](https://documentation.onesignal.com/docs/en/identity-verification)

The account page rebinds the device and disconnects it on sign-out. Test account switching on a shared device before launch. iPhone/iPad web push requires supported iOS and Home Screen installation. [Web push setup](https://documentation.onesignal.com/docs/en/web-push-setup)

## 5. Vercel and cron

Set the same environment variables in Vercel with the correct HTTPS `NEXT_PUBLIC_SITE_URL`. Set a strong random `CRON_SECRET`. Vercel supplies it as a bearer token for cron invocations.

`vercel.json` schedules daily maintenance at 03:15 UTC. Jobs retry in bounded batches; expired leases can be reclaimed. There is no requirement for a paid minute-level schedule. On Hobby, scheduled execution can occur within the scheduled hour and each job is limited to daily runs. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Welcome email/push jobs are attempted immediately after their triggering action, within a bounded request. The daily cron handles recovery and photo cleanup. This is an MVP throughput setting, not a high-volume delivery SLA; monitor queue age before increasing traffic.

Resend's idempotency window is 24 hours. The app records the first provider attempt and refuses automatic replays outside a conservative 23-hour window, placing ambiguous outcomes in `failed` for operator review. A job delayed before its first provider attempt is still eligible. Check Resend's delivery log before manually retrying an ambiguous email. OneSignal also uses persistent UUID idempotency keys with a bounded replay window. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Operator queue inspection (SQL Editor only):

```sql
select id, kind, state, attempts, created_at, next_attempt_at, last_error
from private.notification_jobs
where state not in ('sent', 'skipped')
order by created_at;
```

Keep provider credentials server-side. Do not turn the cron endpoint into an unauthenticated public task runner.

## 6. Run and verify

```powershell
pnpm dev
pnpm typecheck
pnpm test:db
pnpm test:images
pnpm build
```

The database tests execute the real migrations/seed in embedded Postgres (PGlite), using minimal stand-ins for Supabase-owned Auth/Storage schemas. They test relational constraints, SQL functions and RLS; they do not prove hosted Auth, Storage HTTP behavior, SMTP delivery, OneSignal device delivery, or concurrent transactions on a remote database.

Before launch, test two real accounts end to end: confirmation and recovery emails, cross-device confirmation, denied unverified uploads, saved photos after reload, cross-account access, push permission/account switching, and authenticated cron. Also run simultaneous participant reservations against hosted Postgres when the meetup backend is connected.

The original mockup stays unchanged at `/`. The working integration starts at `/start`. Its login, onboarding, account and venue routes are separate. Original mockup fixtures never write to the real database. See AGENTS.md for the design-protection rules.

## Deployment boundaries

This implementation does not create vendor accounts, apply migrations to a remote database, change SMTP settings, or deploy the application. Those steps require the selected project credentials and sender-domain configuration.

The ID-upload/review UI and real meetup lifecycle are intentionally not yet exposed. Do not enable live meetup creation until server-side acceptance/completion, reporting, and the deferred manual ID-review flow are connected. Stored verification status defaults to not submitted, never approved.

## Google login and post-signup destination

Enable Google under Supabase Authentication → Providers and configure your Google OAuth client ID and secret. In Google Cloud, allow the callback URL displayed by Supabase. In Supabase, allow the app's /auth/callback URL in the redirect list. Keep the Google secret in the Supabase dashboard. The login and signup screens use Supabase OAuth with PKCE; verified users continue through /start to onboarding or /live.

Completed photo onboarding redirects to /live. This screen uses the saved profile and city. Apply migration 004 to enable its real matching lifecycle; it does not start the mockup's simulated meetups.

## Real matching lifecycle (migration 004)

Apply supabase/migrations/202609270004_real_matching.sql once to the existing project. Do not rerun bootstrap.sql. /live now supports real queueing and matching for the same city, activity and chosen venue. Members are queued for 30 minutes; proposals expire after five minutes. Both people must accept, confirm arrival and confirm completion after the scheduled end. Completion is transactional and updates the global allowance ledger. Cancellation releases both reservations. Stale confirmed meetups expire after 24 hours when the city next requests status. Ratings are private and apply to the latest completed meetup.

The current live slice does not provide chat, friends, push alerts for match changes, verified venue coordinates, distance-based matching, GPS attendance proof, or ID document review. Arrival and completion are participant declarations. The landing preview remains a demonstration; authenticated /live contains real account data. Browser polling refreshes active status every eight seconds while visible. No matching results are fabricated.

## Approved mockup wiring

/start sends incomplete members to /onboarding and completed members to /app. Both routes render the existing UpCatchApp with live profile data. The original name and photo controls save through server actions, then the existing map, create flow, incoming card, meetup sheet and rating screen use Supabase lifecycle RPCs. /live is a legacy redirect to /app, not an alternative dashboard. Signed-in use disables simulated friends, messages, matches and journey progress. Venue coordinates remain unknown where not reviewed, so no invented map pins or ETAs are shown. Apply migration 005 once after 004: it supports Free Now without choosing a venue, matches free members with hosts at their chosen venue, and supports all mockup intents. Unsupported preferences, notes, friends and messages return feedback through the existing toast.

### Venue-free online matching

For an existing database with migration 004, apply `202609270005_mockup_availability.sql`, then `202609270006_sequential_online_matching.sql` in the Supabase SQL editor. Do not rerun bootstrap on an existing database. Migration 006 pairs the city online pool FIFO regardless of activity choice, and gates the second proposal behind the first acceptance. It retains reservations, blocking and the global ID allowance. Each offer stage has a five-minute deadline.

### Apply migrations from this workspace

Set `SUPABASE_DB_URL` in ignored `.env.local` to the Supabase Session pooler URI (port 5432). Run `pnpm test:db`, then `pnpm db:check` to review pending files, and `pnpm db:migrate` to apply. Each migration and its checksum are recorded transactionally in `private.app_schema_migrations`. Existing migrations 001–004 are detected and recorded without replaying them. Run `node scripts/verify-database.mjs` after application. Bootstrap is for a fresh database only.

The app defaults to Manchester, requires browser location permission before going online, and provides a Friends/Public/Both audience selector. Public means new people; Both includes friends and new people. Eligible pairs are reserved city-wide, the oldest queued member accepts first, then the second member receives the offer. Both acceptances confirm the meetup. Saved matching radius uses private rounded coordinates when both members have supplied location.

Messages are limited to confirmed meetup participants and ten sends per minute. Profile settings, interests, trusted contact, blocking, and mutually accepted meetup friendships persist in private tables. QR scanning and My code are wired independently of meetups; see docs/qr-friends.md. Women-only matching remains unavailable until declared gender is collected; it is not inferred from names or photos. ID upload/review remains deferred, and the database blocks further participation at the three-meetup threshold until trusted approval.

Offer and lifecycle push jobs, friend alerts, and opt-in trusted-contact emails use the durable outbox. Delivery requires the provider environment variables and an opted-in device. The app requests delivery for the current member while polling; cron retries pending jobs. Local tests do not prove provider delivery or browser permission behaviour.

Presence history starts at migration 013. `public.my_presence_stats()` returns the signed-in member’s online/offline counters, manual-offline count, current status, and latest 50 events. Private append-only events record city, timestamp and manual/cancelled/expired/completed reasons. Repeated taps, queue updates and polling do not add transitions. No earlier usage is invented or backfilled.

Database scripts use verified TLS with the public Supabase Root 2021 CA in `scripts/supabase-ca.crt`, downloaded from Supabase’s official download bucket. The CA is public and contains no credentials. `.env.local` remains ignored.

Migration 016 unifies manual and auto initiation: `public.meetups.creation_type` is `manual` when a manually published plan contributes to the match, otherwise `auto`. Both use identical proposal, acceptance, arrival, completion, rating and ID-allowance rules. `public.go_online` clears stale plan metadata. Alerts sit at the top right; Create occupies the former bottom Alerts slot. Waiting availability and matched meetups appear together in My Meetups.

Migration 017 shares only a matched member’s two-decimal rounded area and last location update time through `my_partner_location()`. Second members receive no area until the first accepts. Unmatched, cancelled, blocked and unrelated accounts cannot read a partner’s area. The map uses an approximately 800 m circle around this rounded position; it is not an exact or continuously tracked GPS location. Your own marker uses browser GPS on your device.

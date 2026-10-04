# UpCatch implementation plan

Updated: 26 September 2026
Status: first implementation slice added locally. See docs/setup.md for configuration and verification boundaries.

## 1. Agreed scope

Use **Supabase Auth, Supabase Free Postgres, Supabase Storage, OneSignal, Resend, and Vercel Cron**. Storage is the file-upload part of the same Supabase project; photos and ID documents do not belong inside Postgres.

**The first implementation stops at verified-email onboarding and a real profile-photo upload**, with the requested email, push, and cron foundations. The three-meetup ID requirement is specified below for connection when real meetup usage exists. This does not expand the first implementation into rebuilding the entire meetup app.

Requirements from the latest instruction:

- Email verification is mandatory at first signup.
- Initial onboarding ends after basic profile details and photo upload.
- No ID upload, selfie verification, phone verification, interests questionnaire, or location prompt in initial onboarding.
- After three meetups, ask the member to upload ID for verification.
- Skip subscriptions, payments, managed chat, external identity-verification services, additional map providers, and separate background-job platforms.

Implementation assumptions: email/password sign-in; “three meetups” means three completed meetups, not requests or cancellations; ID approval is required before a fourth meetup. Without an external verification provider, ID review is manual. These choices make the requirement implementable and can be adjusted without changing the selected stack.

No idea/specification files were found in the checkout. This revision uses the user's explicit requirements and the inspected prototype as its source of scope.

## 2. Service responsibilities

| Service | Use |
| --- | --- |
| Supabase Auth | Signup, email confirmation, login, session refresh, password recovery |
| Supabase Free Postgres | Profiles, upload metadata, preferences, notification jobs; later meetup usage and ID-review decisions |
| Supabase Storage | Profile photos and, in the later verification milestone, private ID documents |
| Resend | Deliver Supabase authentication emails through custom SMTP; send application emails through its server API |
| OneSignal | Opt-in web push, browser subscriptions, delivery reporting |
| Vercel hosting and Cron | Run the existing Next.js app and scheduled cleanup/retry endpoints |

Keep the existing Next.js/React UI, Tailwind, and Leaflet. Use the Supabase SDK and SQL migrations directly. No new ORM or independent backend service is necessary.

Supabase Auth owns email verification tokens and confirmation status. Resend delivers the messages; the app does not build a second verification-token system. Configure Resend through the supported Supabase integration/custom SMTP path. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend integration](https://supabase.com/partners/resend)

## 3. First-time account flow

```text
Welcome
  -> Sign up with email + password
  -> Check your email
  -> Confirm email using Supabase link
  -> Basic profile details
  -> Upload profile photo
  -> Onboarding complete
```

Returning members sign in and resume the first unfinished step. A verified account does not need another verification email on every login. An email-address change follows Supabase's confirmation flow for the new address.

### Authentication

- Explicitly enable email confirmation in Supabase, including test configuration; do not rely on defaults.
- Provide signup, login, “check your email,” resend-confirmation, forgot-password, reset-password, and sign-out states.
- Configure a verified sending domain in Resend, sender identity, Supabase email templates, site URL, and narrowly allowed callback URLs.
- Implement the Supabase SSR confirmation callback and cookie session flow. Handle expired/used links and callbacks opened on another device.
- Use server-validated authentication and the authoritative confirmed-email state for protected operations. A client flag or editable user metadata cannot mark an email confirmed.
- An unconfirmed account cannot complete onboarding, upload files, or perform meetup actions.
- Apply resend cooldowns and provider rate limits, and use generic recovery responses.
- Keep authenticated pages and responses out of shared caches.

Use `@supabase/supabase-js` and `@supabase/ssr` with separate browser/server helpers and Next.js session-refresh integration. [Supabase email/password authentication](https://supabase.com/docs/guides/auth/passwords), [Next.js SSR setup](https://supabase.com/docs/guides/auth/server-side/nextjs)

### Basic profile and photo

Retain the current name step and basic age/18+ declaration if needed by the existing product. Self-declared age is not ID-verified age. End onboarding immediately after successful photo upload; collect optional interests and location only when their features are later used.

Replace the current timer that selects a demo image with a real file picker/camera input, preview, upload progress, retry, and replace/remove behavior.

Proposed upload policy:

- Accept JPEG, PNG, and WebP images, with a 5 MB input limit.
- Resize/re-encode profile photos to a maximum 1024-pixel longest edge and strip metadata; target a substantially smaller stored file.
- Validate file content, size, and dimensions server-side; browser checks are only convenience checks.
- Use a private `profile-photos` bucket with random versioned paths under the authenticated user's UUID.
- Store the object path in Postgres, not a temporary signed URL.
- During this slice, only the owner can read their photo. Introduce scoped profile-photo access for other members when real discovery is implemented.
- Finalize the profile only after verifying that the uploaded object belongs to the member and passes validation. Prevent overwriting validated files through another upload path.
- Update the profile reference before deleting a replaced image; periodically delete orphaned uploads.
- Derive onboarding completion from confirmed email, required details, and a finalized photo. Recheck those prerequisites rather than trusting a browser boolean.

Private Supabase buckets support authenticated access and time-limited signed URLs. [Storage access](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## 4. ID verification after three meetups

This is a deferred product rule, not a signup step. Implement it when actual server-recorded meetup participation is connected; seeded history and demo counters must never trigger it.

| Completed meetups / review state | Behavior |
| --- | --- |
| 0–2 completed | Can use meetups with confirmed email and completed photo onboarding |
| Third meetup completes | Show “You've completed 3 meetups. Upload your ID to continue meeting.” |
| 3 completed, no submission | Require ID submission before the fourth meetup |
| ID pending review | Show review status; new meetup participation remains gated |
| ID rejected | Show an appropriate reason and allow resubmission |
| ID approved | Allow further meetups; show an ID-reviewed badge |
| Review revoked | Gate future participation again |

An upload is **not** verification. Only an authorized reviewer can approve it. Profile photo upload does not establish face detection, liveness, phone verification, or document authenticity.

### Counting and enforcement

- Use durable participation/completion records with a unique `(user_id, meetup_id)` key.
- Count each completed meetup once for each eligible participant. Cancellations, declined requests, and no-shows do not count under this proposed definition.
- Validate completion against participant identity, an accepted meetup, valid timestamps, and a server-controlled lifecycle. Use both participants' completion acknowledgments or a staff resolution; do not let a local “end meetup” click define trusted completion.
- Enforce eligibility in every server/database path that publishes, joins, or accepts a meetup, including any future friend shortcut.
- Before ID approval, reserve remaining allowance for confirmed but unfinished meetups so a member cannot prebook several meetings before reaching three completions. Check and reserve atomically.
- Release reservations on valid cancellation; prevent repeated cancellation/rebooking from being recorded as completion.
- Do not let a client update counters, verification state, or reserved allowance.
- A gated member retains access to their account, existing meetup details, reporting, and support.

### Private upload and manual review

Use a separate private `identity-documents` bucket. The authenticated member can submit to their own verification request; ordinary members cannot list or read other submissions. Gate submission finalization on validated file type/size and ownership.

For the initial manual workflow, accept readable JPEG/PNG images, maximum 10 MB each, with front/back uploads only where needed for the selected document type. Do not add automated OCR, selfie matching, or an external verification service.

Create a small restricted review screen with pending submissions, short-lived document access, approve/reject decisions, reviewer identity, reason, and audit timestamp. Staff roles must be controlled server-side, never through editable profile metadata. Notify the member through the app and Resend; push is optional and contains no document details.

Before enabling this milestone, assign a reviewer, supported document types, and a review/retention policy. Proposed starting retention: delete raw documents within 30 days after the final decision; expire abandoned pending submissions after 30 days with a resubmission path. Apply deletion earlier on an applicable account-deletion request. Keep only the minimal decision/audit record needed by the product. This is a proposed operating policy, not a claim about legally required retention.

## 5. Minimal data model and authorization

| Table / resource | Scope and purpose |
| --- | --- |
| Supabase `auth.users` | Managed identity, email-confirmation state, passwords and sessions |
| `profiles` | `id` references `auth.users.id`; name, age declaration if retained, photo path, onboarding timestamps |
| `notification_preferences` | Member-owned push and application-email preferences |
| `notification_jobs` | Server-owned event key, recipient, channel, payload reference, state, attempts, next attempt, lease, expiry |
| `profile-photos` bucket | Actual profile images |
| Later: `meetup_participation` | Authoritative per-member meetup state/completion and trial reservations |
| Later: `id_verification_requests` | Owner, document paths, pending/approved/rejected/revoked state, decision metadata, deletion deadline |
| Later: `verification_audit` | Append-only review actions |
| Later: `identity-documents` bucket | Private document files |

Create profiles idempotently from the authenticated user UUID. Enable row-level security and explicit grants. Owners may update only approved profile/preference columns. Keep review decisions, job payloads, staff roles, and usage counters out of user-editable paths. Privileged server operations authenticate and authorize before using any server-only Supabase secret.

The later meetup tables depend on the actual meetup backend and are not part of the photo-upload-only implementation.

## 6. OneSignal push and Resend email

### Push foundation

- Register OneSignal's service worker on the app origin and integrate with the existing manifest.
- Bind push identity to the Supabase user UUID using provider-supported identity verification; detach/switch identity on sign-out/account changes.
- Offer push setup after onboarding, as an optional settings action. Permission is not a condition for onboarding completion.
- Persist preferences in Supabase and resolve recipients on the server.
- Start with an opt-in test/welcome notification. Add ID-required and review-result events when that workflow exists.
- Use authenticated deep links, generic message bodies, expiry, and deduplication keys. Never put ID images, document URLs, or verification tokens into push payloads.
- Handle denied permission and unsupported browsers without blocking the app.

On iPhone/iPad, web push requires iOS/iPadOS 16.4+ and Home Screen installation. Include install guidance when relevant. [OneSignal web push](https://documentation.onesignal.com/docs/en/web-push-setup)

### Email foundation

Supabase sends confirmation and recovery emails through Resend SMTP. Send a welcome email after photo onboarding completes using Resend's API. Later add “ID required,” submission-received, and review-result templates.

Keep authentication email sending under Supabase's retry/rate-limit behavior; do not duplicate confirmation sends in application jobs. Application email jobs must use trusted recipient addresses, deduplication, and appropriate preference rules. Do not attach ID files to emails.

## 7. Vercel Cron and delivery reliability

Use Vercel Cron exclusively for scheduled work. Implement protected Next.js cron routes and configure schedules in `vercel.json`. Validate `Authorization: Bearer <CRON_SECRET>` on every invocation.

The current Hobby plan allows each cron job to run only once daily, with hourly scheduling precision; Pro permits more frequent schedules. Keep the baseline daily and do not silently assume a paid upgrade. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

First-slice cron responsibilities:

- Retry pending application email/push jobs.
- Remove abandoned photo uploads and obsolete photo versions after a grace period.
- Prune old job records according to a bounded retention policy.
- Later, delete ID files whose retention deadline has passed.

For prompt delivery, record an application job alongside the triggering state change, then attempt delivery during the server request with a bounded timeout. Any unfinished attempt stays durably pending. Cron recovers pending jobs; on a daily schedule, a failed notification can be delayed until the next run. Authentication confirmation mail is sent by Supabase immediately and does not wait for this queue.

Use transactional job claiming, expiring leases, attempt counters, backoff, provider idempotency keys where supported, and a staff-visible exhausted state. Avoid relying on work continuing after an HTTP response. Cron invocations can overlap or fail; the handler must be safe to repeat. Vercel does not automatically retry a failed cron invocation. [Cron behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

No minute-precise meetup reminders are included in the daily-cron scope. Expiry and eligibility checks must use database timestamps on each operation, not depend on cleanup running.

## 8. Implementation sequence

| Stage | Deliverables | Acceptance |
| --- | --- | --- |
| 1. Supabase foundation | Free project configuration, versioned migrations, RLS, private photo bucket, environment setup | Two test accounts cannot read or modify each other's protected data |
| 2. Auth + Resend SMTP | Signup/login, confirmation callback, resend, recovery, cookie sessions | Unverified account is blocked; first email confirmation unlocks onboarding; returning login does not reverify |
| 3. Profile + photo | Persisted basic details, genuine upload, validation/replacement, resumable onboarding | Onboarding ends after photo upload; refresh/new-device login restores the profile |
| 4. Notifications + cron | OneSignal opt-in, welcome email, durable jobs, protected daily maintenance | Delivery tested; permission denial is harmless; repeated cron calls do not duplicate completed work |
| **First-slice finish** | **Auth, email verification, profile/photo, and requested notification infrastructure** | **No wider meetup-backend work is required to finish this slice** |
| Later: three-meetup gate | Real participation counting, allowance reservations, private ID upload, manual-review UI and outcome notices | Third completion prompts ID; fourth participation is blocked until approved; concurrency cannot bypass the gate |

The prototype's remaining meetup screens may remain demonstrable, but demo data must stay clearly separated from real profile data and usage counts. Production onboarding must not display simulated ID/phone/selfie badges or claim every member is already ID-verified.

### Planned files

- `lib/supabase/client.ts`, `server.ts`, and `proxy.ts`: Supabase clients and session handling.
- Root `proxy.ts`: Next.js auth/session integration.
- `app/auth/`: login/signup, confirmation, recovery, and related states.
- `components/upcatch/onboarding.tsx`: basic details and real photo upload; finish after photo.
- `components/upcatch/app-provider.tsx`: load/persist the authenticated profile; separate demo state.
- `components/upcatch/profile-screen.tsx`: accurate account/photo status and notification settings.
- `lib/server/uploads.ts`, `notifications.ts`, `email.ts`: validation and provider integration.
- `public/OneSignalSDKWorker.js`: web-push worker.
- `app/api/cron/maintenance/route.ts` and `vercel.json`: secured scheduled maintenance.
- `supabase/migrations/`, `supabase/tests/`, `.env.example`: schema, authorization tests, configuration names.
- Later: `app/verify-id/`, `app/admin/verifications/`, and meetup eligibility functions.

Use the existing pnpm lockfile. Document public configuration separately from server-only Supabase secrets, Resend API keys, OneSignal credentials, and the cron secret. Provision credentials in provider/Vercel settings rather than committing them.

## 9. Verification checklist

- [ ] Email confirmation is mandatory; direct URL/API requests cannot skip it.
- [ ] Expired/reused confirmation links and password recovery behave correctly.
- [ ] A second login does not repeat first-time email verification.
- [ ] Onboarding resumes correctly and finishes after a successful real photo upload.
- [ ] Invalid/oversized files and cross-user object paths are rejected.
- [ ] Photo replacement and orphan cleanup do not delete the current image.
- [ ] Profile writes cannot change protected verification or staff fields.
- [ ] Push subscription follows the signed-in member and clears on logout.
- [ ] Denied push permission does not prevent app use.
- [ ] Application email/push retries are bounded and deduplicated.
- [ ] Cron rejects missing/incorrect secrets and tolerates overlapping runs.
- [ ] Build, TypeScript, and critical auth/upload end-to-end checks pass.
- [ ] Later: 0/1/2/3 completions, reserved allowance, repeated completion, cancellation, and concurrent fourth-meetup attempts are tested.
- [ ] Later: ID upload remains pending until staff approval; document access and retention are tested.

## 10. Free-tier operating constraints

Use the Supabase **Free** plan as requested. Monitor database size, object storage, egress, and Auth quotas in the dashboard; do not enable paid features or automatically upgrade. Keep image sizes and job retention bounded. Storage has its own allowance and is not part of the Postgres database-size allowance. [Supabase plan limits](https://supabase.com/pricing)

Document free-project inactivity/availability limits and take periodic off-platform database exports plus a separate Storage-file backup if needed; a database backup does not include the uploaded file contents. Test recovery with non-sensitive test data. Do not assume paid backup/PITR features are included. [Supabase backups](https://supabase.com/docs/guides/platform/backups)

The free Supabase requirement does not imply unlimited free usage from Resend, OneSignal, or Vercel. Record their actual plan limits at setup. Keep daily cron compatible with the existing Vercel plan, and surface quota failures in the app rather than presenting false success.

**Next implementation target: Supabase signup -> first-time email confirmation through Resend -> persistent basic profile -> real photo upload.**

## Implementation update

Manchester is the initial active city, with 20 source-linked restaurant listings in supabase/seed.sql. The schema supports multiple cities and global member identity/meetup allowance. Authentication, confirmation, profile/photo onboarding, venue browsing, and notification/cron foundations are implemented locally. ID upload/manual review and the live meetup lifecycle remain deferred. Remote migration and real email/push delivery require provider configuration. See docs/database-architecture.md and docs/setup.md.

Design protection: AGENTS.md preserves original mockup files, theme, fonts and layout. The original mockup remains at /; live integration starts at /start and composes existing UI primitives.

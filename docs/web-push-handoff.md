# Prompt for the separate UpCatch web workspace

## Current request — anonymous nudge phone notifications — 21 November 2026

Implement this in the web workspace only. The user wants the phone notification to hide who nudged them so they return to the app. Keep the new blue timed Nudge screen identifying the sender after the user opens the app.

Use this exact push copy for selected and bulk nudges:

- Title: `A friend nudged you`
- Body: `Open UpCatch to see who wants to catch up.`

In `lib/server/notifications.ts`, sanitize at the final OneSignal delivery boundary, before constructing `headings` and `contents`. Recognize a nudge by `job.payload?.route === 'nudges'` or an existing `nudge_id`. Override both fields for every nudge; do not trust an old queued payload's title/text. This protects already queued jobs containing names without rewriting production rows. Keep `data.route: 'notifications'`, the existing app/web launch URLs, account aliases, opt-in, recipient-only dispatch, idempotency and the original 30-minute deadline. Do not put the sender's name or photo into other visible push fields. Keep non-nudge notification copy unchanged.

Add mocked OneSignal tests for a selected nudge and multiple bulk-recipient jobs whose stored payloads contain names. Assert the outgoing JSON's visible text contains neither name, receives the generic title/body above, retains notification tap routing and original expiry, and still sends only to eligible opted-in recipients. Test an old queued nudge payload too. Run relevant push/database tests, typecheck and build, then follow this workspace's deployment permissions. A Git push alone does not deploy this delivery fix.

The native workspace read-only check confirmed `202611200003_thirty_minute_nudges.sql` is now recorded and `my_sent_friend_nudges()` exists. The Capacitor client is being updated to the new rows/countdowns and preserves bearer dispatch plus native resume refresh. Do not reapply the migration. Inspect hosted status again before any backend action. No server deployment or production queue mutation was performed from the Capacitor workspace for this request; device privacy and delivery remain unverified until the updated backend and a real notification are tested.

## Confirmed follow-up findings, after native source push c136253

- Recent message and nudge jobs now fail with `Push provider returned 400`, while meetup offer jobs are sent. Web source `5e5cd5a:lib/server/notifications.ts` uses a top-level `url` for all pushes and additionally `app_url` for message/nudge pushes. OneSignal documents these as mutually exclusive: use `web_url` for browser destinations and `app_url` for mobile destinations, or `web_url` plus mobile Additional Data/click handling. Do not combine `url` with platform-specific URL fields. This source defect matches exactly which event types are rejected; the current sender only records HTTP status, not the provider's validation body.
- Native pushes should route inside the installed app, and browser subscriptions should retain their web destination. Offers/cancellations currently get the all-platform HTTPS `url`, which explains Safari opening. Prefer structured `data` and the existing native click listener for mobile. The native iOS follow-up sets `OneSignal_suppress_launch_urls=YES`, as documented by OneSignal, so the SDK does not independently open Safari. Preserve native click reporting and allowlisted destinations.
- Read-only production inspection confirmed cancellation pushes for meetups with zero accepted members. The status trigger treats draft → cancelled the same as confirmed → cancelled. Suppress cancellation pushes for unaccepted/rejected/expired offers while keeping genuine confirmed-meetup cancellations. A versioned database-trigger fix needs explicit approval before production application. Consider already queued draft-cancellation jobs too; do not send them blindly after registration is fixed.
- No backend payload changes, queue edits, migrations or deployment were performed from the native workspace. Implement and validate the web fix there; request approval for any required migration/deployment.
- Acceptance requirements: after both Go Live members accept, retain one confirmed-meetup push and durable inbox entry per eligible participant. First acceptance must still reveal the second offer only through the existing sequential flow. For scheduled requests, create equivalent deduplicated acceptance push/inbox entries for the host and accepted participant, preserving push opt-out while retaining in-app notifications. Existing message inbox triggers cover live, scheduled and friend chats; verify those entries independently of push delivery. The current scheduled response routine updates request/post status but does not itself queue an acceptance notification. Any missing scheduled trigger requires a separately reviewed versioned migration; do not apply it from the native workspace.

Primary references: [OneSignal platform-specific URLs](https://documentation.onesignal.com/docs/en/links) and [native deep-link handling / iOS URL suppression](https://documentation.onesignal.com/docs/en/deep-linking).

## Original investigation prompt

Investigate Safari-to-native UpCatch push delivery in the web project's own workspace. Do not change the approved web design. The native project must not deploy the web project. Push only to main, and obtain explicit permission before production database changes or deployment.

The native 2.0.2/build 6 update uses the existing backend, Supabase project, OneSignal app, bearer-authenticated mobile API and opaque account alias. Manual OneSignal notification delivery to TestFlight works according to the user, but an app-generated nudge from Safari did not arrive. Recent hosted nudge and message jobs report `No subscribed device was available`. OneSignal App IDs were confirmed to match by the user. Click reporting after tapping a notification also remains unverified.

Please:

1. Read current source and production configuration without exposing keys or account identifiers. Confirm the deployed backend uses the correct OneSignal app/key and the stable `ONESIGNAL_ALIAS_SECRET`. Do not rotate the alias secret.
2. Compare the intended recipient's backend-derived alias with the iOS subscription's External ID in OneSignal. Check push opt-in, native subscription ID, APNs token and subscription status. A device-targeted manual test does not prove account-alias targeting works. The native update now checks token, subscription ID and matching external alias before reporting successful opt-in.
3. Trace a new authorized two-account nudge/message through the database job, web dispatch, OneSignal response and target subscription. Check both `/api/notifications` and `/api/mobile/notifications`, including CORS and bearer auth, without disabling access controls. Preserve optional push preferences.
4. Preserve existing native deep links and SDK click handling. Anonymous nudges should open the notification/reveal flow; friend and scheduled message links must retain the correct conversation IDs. Investigate click telemetry separately from delivery and do not claim it fixed without an installed-device test.
5. Keep friend-online alerts limited to mutually online friends; offline users may still receive explicit nudges and messages. Respect blocks and push opt-outs.
6. The five `20261114000*_nudge*`/private-notification/cooldown migrations from web main are already applied. Check the migration journal before proposing changes; do not reapply or edit production migrations without approval.

Report local tests, read-only hosted findings and actual device delivery separately. Prepare any fix for review and explain precisely whether it requires a web deployment or new native build. Do not implement the deferred 15-minute meetup start change.

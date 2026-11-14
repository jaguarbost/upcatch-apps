# Prompt for the separate UpCatch web workspace

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

# Native 2.0.2, build 7: night mode, incoming profiles and nudges

Source reference: `jaguarbost/upcatch-brandnew` main at `7a76dc7` (Remove remaining timed nudge cooldowns), fetched read-only on 14 November 2026; rechecked main at `5e5cd5a`. Only the requested UI and nudge changes were adapted. The user subsequently authorized Auto night mode and a branded splash. Native authentication, deep links, private image loading, QR features and native permission integrations remain in place. The existing QR button locations and map behavior were retained rather than copying unrelated web changes.

## Included behavior

- Profile → Night mode offers Auto, Light and Dark. `upcatch:night-mode` in device-local WebView storage saves Auto/on/off. Auto follows the phone's appearance and rechecks it when returning to the app; it is the default on a device without an existing choice. Saved manual on/off choices remain intact. The scoped appearance wrapper uses the web reference's dark surfaces and preserves blue/yellow accents and the bundled Bricolage Grotesque/Figtree fonts. Global CSS and the root layout are unchanged.
- The native splash and session-restoration screen show the existing icon followed by the home UpCatch wordmark and the user's tagline, Never go alone. Splash generation uses the official TTF versions of the existing font families rather than a renderer fallback. The `--splash-only` generator flag preserves launcher and notification icons.
- Incoming Go Live offers have View profile, showing the existing privately loaded photo, blank Bio and interests. The same incoming-card deadline drives both countdown rings. Expiry closes the dialog; closing it does not reset the timer. Changing offers closes the previous profile.
- Friend, scheduled and Go Live chats show a small date/time beneath messages only when a valid persisted `created_at` is supplied. No device receipt time is substituted. `202611140006_chat_timestamps.sql` remains pending approval and was not applied or copied into this project's migration runner; Go Live timestamps remain absent until the backend supplies them. Existing friend/scheduled timestamps are preserved through their message mappings.
- Nudge is already directly left of Online/Offline in the native navigation. The server's eligible-friend ordering is retained, including friends without recent locations. Location refresh is optional.
- Received nudges and notification cards conceal the name/photo until Reveal & Chat with friend opens the existing friend conversation. Old inbox text is also rendered anonymously. Removed the obsolete timed-cooldown wording; existing pending nudges are still deduplicated.
- Mirrored the five already-applied nudge migrations from the web source into the local migration directory so isolated database tests use the same contracts. No production database changes were made for this update.
- Native push opt-in/restore now checks the OneSignal subscription ID and the requested external account alias as well as the APNs/FCM token. The app no longer reports successful registration based on a token alone, and its failure guidance applies to iOS as well as Android.
- The iOS follow-up sets `OneSignal_suppress_launch_urls` to true. OneSignal's SDK no longer automatically launches Safari for a notification URL; the existing click listener owns allowlisted in-app navigation. The existing custom scheme, auth callbacks and click reporting hooks are retained. This is documented in [OneSignal's native deep-link guide](https://documentation.onesignal.com/docs/en/deep-linking). It still requires an installed-device test.
- The proposed 15-minute meetup start change was deferred at the user's request. Acceptance timing and its displayed start/end times are unchanged.

## Local verification

Passed `pnpm typecheck`, `pnpm build`, `pnpm native:bundle`, `pnpm test:native` (46 checks), `pnpm test:push` (13 checks) and `pnpm test:db` (290 checks). The native suite exercises Auto/system/resume behavior, persisted timestamp parsing, and notification-link routing with mocks. Windows initially blocked the push runner and esbuild with EPERM; approved reruns passed. The generated splash was visually inspected. Vite emitted its existing client-directive and chunk-size warnings but completed successfully.

Version metadata is aligned at 2.0.2/build 7 for the iOS URL-routing follow-up, avoiding a duplicate if build 6 was uploaded to TestFlight. Local native sync/release checks precede the code push. Signed Android AAB/APK generation follows the source push using the existing upload key and `scripts/build-android-aab.ps1 -RequireExistingKey -IncludeApk`. No signed iOS archive, TestFlight upload, physical-device visual test or browser automation was performed. ADB listed no attached Android device, so actual theme changes, preview/countdown, timestamps and notification taps remain device acceptance items.

### Final signed Android artifacts

Built after source push on 15 November 2026 with the existing signing key. AAB signature verified with jarsigner; APK signature verified with apksigner. Bundletool validated the AAB and reported 2.0.2/build 7; aapt verified the APK version/package metadata.

| Artifact | Exact local path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Play release AAB | `C:\Users\dipti\upcatch-capacitor\android\app\build\outputs\bundle\release\app-release.aab` | 20,959,238 | `FA4458A9BCA3FD2D271787E371F999174B00A3FEB9525032EAA39634CD1C749C` |
| Signed release APK for testing | `C:\Users\dipti\upcatch-capacitor\android\app\build\outputs\apk\release\app-release.apk` | 19,614,904 | `5E414460D59A7091E3B3DA1062CDA53E960170EB28D026FA0C52465E93BE7026` |

No artifact was uploaded to Play Store. The APK has not been installed/tested on a device in this session.

## Read-only hosted findings

The migration journal confirms all five web nudge migrations are already applied. Recent message and nudge push jobs still report No subscribed device was available. This update does not establish that automatic push delivery or OneSignal click reporting is fixed. Manual OneSignal delivery was reported by the user; Safari-to-app nudge delivery was reported unsuccessful. See [web-push-handoff.md](web-push-handoff.md).

Later read-only checks found successful offer delivery, cancellation pushes for zero-acceptance draft offers, and HTTP 400 failures on new message/nudge sends. The web agent reports preparing a split `web_url`/`app_url` payload without the shared `url`; this is the correct documented approach but its deployment/device result was not verified here. Draft-cancellation suppression and missing scheduled-acceptance push/inbox triggers remain backend handoff items requiring the authorized web workflow and migration approval.

The dependency audit, run after source push `c136253`, reports 4 critical and 40 high findings across all dependencies; see [the complete audit](dependency-vulnerability-audit-20261114.md) for exact advisories, versions, paths and native/server exposure limits. No dependency fixes were applied as part of this release.

No website deployment, web-repository push, production environment update, notification send or production database mutation was made during this update. Native milestone completion stays at 25% (3/12) until device acceptance passes.

## Test on the next installed build

1. In Profile → Night mode, choose Dark. Visit map, messages, nudges and incoming profile; confirm blue/yellow accents and fonts. Close/reopen and confirm the choice persists. Choose Light, change the phone's theme and confirm the app retains Light. Choose Auto and verify the app follows theme changes, including after returning from the background and restarting. Verify the icon/UpCatch wordmark/Never go alone splash on a cold launch.
2. With two test accounts, create a real incoming Go Live offer. Open View profile and verify photo, blank Bio and interests. Return to the request and confirm time was not reset. Repeat and let it expire while the profile is open; the offer must remain unaccepted and the dialog must close.
3. Verify all eligible friends appear, including those without location permission or a recent location. Check recent nearby locations affect ordering. Send individual/bulk nudges and verify no outdated cooldown message appears. Pending requests should still be skipped.
4. Verify the nudge notification/inbox and received-nudge list show no sender identity until Reveal & Chat with friend is tapped. Confirm it opens the correct existing conversation and the other user's messages remain private.
5. After installing, turn Profile push notifications off/on and allow iOS notifications. If registration fails, retain the displayed error for diagnosis. If it succeeds, verify the OneSignal iOS subscription has the matching opaque External ID, then send a new nudge/message from a different account in Safari. Check foreground, background and closed-app delivery and notification taps. Old failed jobs are not delivery evidence.
6. Recheck sign-in and session persistence, confirmation/recovery/Google return links, QR scanning and camera permission, friend code sharing, location permissions and private profile photos. Do not reset the shared alias secret to troubleshoot one device.
7. Check small date/time labels in friend and scheduled chats against persisted messages after reloading. Check Go Live after its timestamp migration is approved/applied from the authorized web workflow; before that approval, missing times must stay absent. Test native notification taps into all three chat types and the anonymous reveal flow.

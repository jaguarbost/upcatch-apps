# Native release implementation — 25% milestones complete (3/12)

**Progress rule:** Count a milestone only after its acceptance check passes. Strike through its entire checklist line when complete, then update the heading percentage to `round(100 × completed / 12)`. Record device and hosted-service evidence separately from local checks. Keep this plan current whenever native release work changes.

**Design rule:** Keep the approved app screens, yellow/blue theme, Bricolage Grotesque and Figtree fonts, spacing, mobile widths, components and interactions. Reuse the existing UI in the packaged client. Any visual change needs a specific user request.

**Architecture:** Keep one deployed UpCatch backend and the existing Supabase project. The iOS and Android packages are separate clients of that backend; they must not create another database or copy server secrets into the binary. The current `CAPACITOR_SERVER_URL` setting is for device development only.

## Native meetup/profile adaptation — 2.0.3/build 9 — 2026-11-15

- Adapted the native-relevant screen changes from web commits `da32fa2` and `5bd23a1`. Added dedicated meetup Messages navigation, tappable real profiles, the yellow QR friendship footer, Not now wording, native photo replacement and hosted legal links. Preserved native startup, appearance, auth, permissions, QR and notification integrations; did not import marketing screens or metadata.
- Local typecheck, production build, native tests (52), image tests (4), push tests (13), Vite production bundle, Capacitor sync and native metadata/release checks passed. Version 2.0.3/build 9. See [native-meetup-profile-validation.md](native-meetup-profile-validation.md) for behavior and acceptance evidence.
- No Android device is attached; iOS archive/upload and device-level messaging, profile expiry, QR permissions, photo persistence after relaunch, legal links and appearance remain unverified. No database changes, web deployment or store upload. Milestones remain 25% (3/12).

## iOS upload correction — build 8 — 2026-11-15

- Added `NSLocationAlwaysAndWhenInUseUsageDescription` required by the installed Capacitor geolocation plugin, using the same nearby-member purpose as the existing When In Use description. Location requests and background modes are unchanged; background location is not enabled.
- Increased iOS build number and the aligned Android versionCode from 7 to 8 for the next upload; marketing version remains 2.0.2. Previously generated Android build 7 artifacts below are historical and have not been rebuilt for this correction.
- Local `pnpm native:check`, `pnpm native:release-check` and Info.plist XML parsing passed. The metadata check now requires both location purpose strings. Codemagic archive, Apple upload acceptance and device permission prompts remain unverified. Milestone completion remains 25% (3/12).

## Android signed release build 7 — 2026-11-15

- Source was pushed to Capacitor `main` first (`c136253`, then iOS URL-routing follow-up `226f777`). No web-repository push, website deployment, production database mutation or store upload was performed for this release.
- Reused the existing upload key with `scripts/build-android-aab.ps1 -Offline -RequireExistingKey -IncludeApk`. Both Gradle release targets passed. `jarsigner` verified the AAB and `apksigner` verified the release APK. Google bundletool 1.18.3 validated the final AAB and read version code `7`, version name `2.0.2`; `aapt` confirmed the APK has the same metadata and package `uk.co.upcatch.app`.
- **AAB:** `android/app/build/outputs/bundle/release/app-release.aab`, 20,959,238 bytes, SHA-256 `FA4458A9BCA3FD2D271787E371F999174B00A3FEB9525032EAA39634CD1C749C`.
- **APK:** `android/app/build/outputs/apk/release/app-release.apk`, 19,614,904 bytes, SHA-256 `5E414460D59A7091E3B3DA1062CDA53E960170EB28D026FA0C52465E93BE7026`.
- ADB listed no attached device. Actual Auto/resume behavior, incoming-profile countdown, chat timestamp appearance, notification navigation/delivery and QR/permission regressions remain device acceptance items. No iOS archive or TestFlight upload was produced from this Windows workspace. Milestones remain at 25% (3/12).

## Native 2.0.2/build 7: web UI adaptation — 2026-11-14

- Adapted the requested night mode, incoming View profile and nudge UI from web main `7a76dc7`, rechecked at `5e5cd5a`. Added Auto mode following the user's subsequent instruction, with device-local Auto/manual settings in Profile. Added the UpCatch home wordmark and Never go alone beneath the splash icon. Preserved native auth/deep links, QR behavior, private-image and permission bridges, fonts, blue/yellow accents, existing QR layout and map behavior. Nudge is already left of Online/Offline. Meetup start timing was explicitly deferred and remains unchanged.
- Native push registration now waits for a subscription ID and the signed-in account alias in addition to the push token. Real Safari-to-TestFlight delivery is still unverified; recent hosted jobs report `No subscribed device was available`. All five existing web nudge migrations were confirmed recorded through a read-only check and mirrored locally; none was applied from here.
- Small date/time labels use persisted `created_at` across chat views. The Go Live timestamp migration `202611140006_chat_timestamps.sql` remains pending approval and was not applied; missing backend timestamps are never fabricated. Profile now offers Auto/Light/Dark and rechecks Auto on native resume.
- **Local:** `pnpm typecheck`, `pnpm build`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check`, `pnpm native:release-check`, `pnpm test:native` (46), `pnpm test:push` (13) and `pnpm test:db` (290) passed. The generated splash was visually inspected. Version is 2.0.2/build 7 for the iOS URL-routing follow-up; signed Android AAB/APK generation follows the code push using the existing key. See [native-night-mode-validation.md](native-night-mode-validation.md) for acceptance steps and [web-push-handoff.md](web-push-handoff.md) for the separate web-workspace prompt.
- **Notification follow-up:** Source commit `c136253` was pushed before Android signing. Added the documented iOS URL-suppression setting so the native click listener controls navigation. Read-only inspection confirmed cancellation pushes for drafts with zero acceptances and HTTP 400 on new message/nudge pushes; the web agent is preparing separate `web_url`/`app_url` payloads. Missing scheduled-acceptance alerts and draft-cancellation suppression are documented for the web project, without changing its database or deployment here.
- **Security audit:** After code push, `pnpm audit --json` reported 4 critical/40 high; production-declared dependencies reported 4 critical/35 high. See [dependency-vulnerability-audit-20261114.md](dependency-vulnerability-audit-20261114.md). Server/tool dependency findings do not establish native runtime exploitability. No dependency upgrades were applied.
- **Release boundary:** No web deployment, production environment change or production database write for this update. Signed Android artifacts were subsequently verified as recorded above; no iOS archive, TestFlight upload or physical-device/UI acceptance was verified. Milestone completion remains 25% (3/12).

## Push availability rules and TestFlight investigation — 2026-11-14

- Friend-online push now queues one alert for each eligible friend only while both have unexpired Go Live availability in the same city, respecting friend preferences, push opt-in and blocks. Dispatch rechecks availability so delayed online alerts are skipped after either friend leaves. Existing new-message and explicit-nudge alerts remain eligible for offline recipients. The hourly per-friend deduplication remains in place. No approved UI or native binary was changed.
- **Local:** `pnpm typecheck`, `pnpm test:push` (9 checks), `pnpm test:db` (284 checks), and `pnpm build` passed. Added behavior checks for reciprocal online alerts, expired/offline/blocked/opted-out recipients, offline messages and offline nudges.
- **Hosted:** Confirmed the message, nudge and friend-online triggers are enabled. Applied and journaled only `202611140001_mutual_online_friend_push.sql`; the new eligibility RPC is restricted to `service_role`. The unrelated pending three-meetup-ID migration was not applied. Refreshed the linked Vercel Production settings and found both server push credentials empty; populated `ONESIGNAL_API_KEY` and the stable existing `ONESIGNAL_ALIAS_SECRET` from ignored local configuration without displaying values. Deployment remains to be verified.
- **Device/user evidence:** The user reports a manual OneSignal notification reached the TestFlight app and opened when tapped, but Total Clicks did not increase. A read-only check using the local app/alias configuration found no iOS subscription attached to the five push-enabled UpCatch account aliases. The user confirms the Codemagic App ID matches. After deployment, reopen the app and enable its notification toggle to bind the installed subscription, then test actual messages/nudges with two accounts. Automatic device delivery and click reporting remain unverified. Milestones stay at 25% (3/12).
- `.vercelignore` excludes local environment files, signing files and the local Mac archive from deployment uploads.

## Codemagic iOS guide — 2026-11-14

- Added [ios-codemagic-app-store-guide.md](ios-codemagic-app-store-guide.md), covering Git clone, personal-plan costs, Apple credentials/signing, a project-specific YAML template, TestFlight installation and public App Store release without local Xcode. Added the root `codemagic.yaml` so Codemagic can discover the workflow once its branch is pushed. Apple integration, signing files and public configuration must be set up in the dashboard before running it.
- **Documentation only:** Checked project identifiers, scripts, Swift Package Manager setup and current provider documentation. No Codemagic build, signing, Apple upload or device installation was verified. Milestone completion remains 25% (3/12).

## Android build 5 — 2026-11-09

- Android version code is 5 and app version is 2.0.1, aligned with `package.json` and the iOS project metadata. Capacitor Android, core, CLI and iOS are aligned at 8.6.0. Release R8 code optimization and resource shrinking are enabled with the optimized default ProGuard rules. The OneSignal small icon is explicitly retained for runtime lookup.
- **Local:** `pnpm typecheck`, `pnpm test:db` (268 checks), `pnpm test:images` (4 checks), `pnpm test:native` (37 checks), `pnpm test:push` (7 checks), `pnpm build`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check` and `pnpm native:release-check` passed. The signed AAB at `android/app/build/outputs/bundle/release/app-release.aab` is 20,859,823 bytes; SHA-256 `5074014791B6425F70D3ADFE88ABF460C8CB2694D5319229851B4447C0BE97ED`. `jarsigner` verified the signature; Google bundletool validated the AAB and reported version code 5, version name 2.0.1. R8 produced `mapping.txt` and no missing-rules file.
- **Hosted services and devices:** No Play Console upload, updated DEX optimization score, installed-device release test, or push delivery was verified. Milestone completion stays 25% (3/12).

## Push and Android navigation investigation — 2026-11-08

### Launcher icon update — 2026-11-09

- The user-provided root `appIcon.png` now generates the Android legacy and adaptive launcher icons at every density and the iOS app icon. The Android small notification icon remains monochrome. A generated 192-pixel Android icon was inspected and matches the supplied artwork.
- **Local:** `pnpm native:assets` and `pnpm native:check` passed. Android `assembleDebug --offline --quiet` passed. The rebuilt debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` (24,465,896 bytes; SHA-256 `7D64DC459B0C87C954D4AC04F702B2EF7028D6AA5140B40A0138B4E70DCC4ACC`). The signed AAB is `android/app/build/outputs/bundle/release/app-release.aab` (22,457,849 bytes; SHA-256 `E1023FB557FCE1A131CDFC3E692A93A40C87FBAC20598E3359B261357966384A`); `jarsigner -verify` passed.
- **Device/hosted:** No device install or launcher screenshot was available, so appearance on an installed phone remains unverified. No hosted push-delivery check was run. Milestone completion stays 25% (3/12).

- A shared notification inbox is implemented for web and bundled Android. Push taps open the inbox, where a member can open a saved event in its relevant app screen. The inbox stores meetup, nearby, friend, nudge and chat events, including nudges and chat when push is disabled. Future server-side notification streams can use the existing inbox destination without a binary update, provided they use supported destinations. Hosted migration, web deployment and real-device tap testing remain pending.
- Local database tests pass 268 checks, including inbox ownership and the three-meetup ID gate. Typecheck, Next build, image, push and native tests pass. The partner-location RPC test now reflects its intentional removal in the 2026-10-04 privacy migration. The previous artifact hashes below are historical until the Android packages are rebuilt.

- The current shared bottom navigation includes separate Wall and Messages buttons. The previous debug APK was built on 2026-10-25. A fresh 2.0.0 debug APK (build 4) was built on 2026-11-08 from the current native bundle and includes the shared navigation's `min-w-0` sizing fix. An installed-device screenshot is still needed to confirm the reported icon issue is resolved.
- The native client now accepts a constrained `nudges` notification route and preserves that destination across its post-tap account refresh. The shared app must implement `/app?view=nudges`, and the backend must send `data.route = "nudges"`; until then, this is routing preparation only.
- Read-only hosted push diagnostics found 4 failed and 1 pending `meetup_push` jobs from the past seven days. All five report `Push provider returned 401`. Six `friend_push` jobs were skipped. A Production Vercel environment pull confirmed that `ONESIGNAL_API_KEY` is present but has an empty value; the temporary diagnostic file was removed. Set a valid OneSignal App API key for the app identified by `NEXT_PUBLIC_ONESIGNAL_APP_ID`, redeploy Production, then verify a real subscribed device receives a push. No successful device delivery was verified.
- Existing database triggers queue meetup offer/status pushes and friend-online pushes. The latter are for friends who opted in, not every nearby member. The web/backend project must define and implement a city- and distance-scoped nearby-online alert with a once-per-window deduplication rule if that is the intended product behavior. The current Vercel maintenance cron runs daily, so time-sensitive jobs also need a prompt delivery path independent of that cron.
- Local `pnpm test:native` (37 checks), `pnpm test:push` (7 checks), `pnpm test:db` (268 checks), `pnpm test:images` (4 checks), `pnpm typecheck` and `pnpm build` pass. The missing journey props passed to `MapCanvas` were supplied without changing the approved layout. No Android device was attached for a visual or push test.
- The rebuilt debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` (24,092,098 bytes), package `uk.co.upcatch.app`, version `2.0.0` (code 4). A signed AAB was generated with the existing upload key at `android/app/build/outputs/bundle/release/app-release.aab` (22,239,744 bytes; SHA-256 `C1D908C8DF3D2BDF1E8729F9C99FF1CD6FEF473B619BEF25F42D10CE439115EC`); `jarsigner -verify` passed. These artifacts predate completion of the web nudge screen and need rebuilding once it is integrated. Neither artifact was installed or uploaded.

## Implementation milestones

1. ~~Generate the Capacitor iOS and Android projects, identifiers, foreground location permissions and iOS push entitlement files.~~ **Done:** both native folders and permissions are present; `pnpm native:sync` passed locally.
2. ~~Wire native coarse location and OneSignal push into the existing client flows, retaining browser fallbacks.~~ **Done:** adapters are present; local typecheck, push tests and Next build passed. Device delivery remains in milestone 9.
3. ~~Define the packaged client's API and authentication contract with the existing Next.js backend. Map every server action, cookie-dependent route and Supabase operation used by the approved app screens.~~ **Done:** `docs/native-api-contract.md` records endpoint, session, origin, data and secret boundaries. Implementation remains in milestones 4–8.
4. Build a locally bundled mobile client that reuses the approved UI and opens `/start` without `server.url`. **Acceptance:** an offline launch renders the bundled app shell; no setup placeholder or remote WebView URL is in release config.
5. Connect native sign-in, session restoration and sign-out to the same Supabase account and backend authorization. **Acceptance:** a member sees the same account on web and mobile; switching accounts clears the former member's state and push identity.
6. Connect native onboarding, profile photo, privacy and account settings through the production API contract. **Acceptance:** data and private image access obey the existing database rules across web and native.
7. Connect Go Live, matching, offers, arrival, completion, cancellation, history and ratings through the production API contract. **Acceptance:** two real accounts complete the full lifecycle against the same hosted database.
8. Add native return links for Google sign-in, email confirmation and password reset, using the system browser where required. **Acceptance:** cold and warm app launches return to the correct authenticated screen on both platforms.
9. Configure FCM and APNs in OneSignal, native notification icons and tap routing. **Acceptance:** push opt-in/out, account switching, offer expiry and foreground/background delivery pass on real Android and iOS devices.
10. Prepare app icons, splash assets, version/build numbers, privacy declarations and store listing material without changing the approved in-app design. **Acceptance:** release metadata matches the shipped binary and `package.json` version.
11. Run local checks and real-device regression tests for push, coarse location, authentication, photos, matching and store behavior. **Acceptance:** record local results and hosted-service/device results separately, with any failures resolved.
12. Sign Android AAB and iOS archive, verify release builds, and submit the final packages to Play Console and App Store Connect. **Acceptance:** both stores accept the uploaded packages for review.

## Immediate next work

The `native-client/` bundle now contains the approved UpCatch screens, native auth and return links, bearer-backed mobile APIs, private photos, push tap refresh, and in-app navigation. Local build, sync and checks passed on 2026-10-10. Next verify offline launch and real account flows on both platforms before closing any milestone. See `docs/native-release-operations.md` for release gates.

The bearer-token helper and all seven contracted mobile API routes are implemented locally. The bootstrap endpoint shares its data mapping with the web app; the photo upload route shares its validation, private Storage write, finalization and cleanup with the web action. A mobile API transport attaches bearer tokens, retries once after refresh, and discards in-flight responses when accounts change. The native-only Supabase client uses secure platform storage, and a session manager verifies restored accounts, clears old state and push identity, and signs out locally. The native client now assembles the approved UI locally without `server.url`; its build, offline device launch, push delivery and two-account meetup flow remain acceptance gates.

## Verification record — 2026-10-04

- **Local:** `pnpm typecheck`, `pnpm test:native` (19 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), and `pnpm build` passed. The build includes the seven `/api/mobile/*` routes.
- **Hosted services and devices:** No hosted Supabase, email, push, deployment, offline launch, or Android/iOS device acceptance check was run for this change. Milestones 4–12 remain open.

## Verification record — 2026-10-05

- **Local:** `pnpm typecheck`, `pnpm test:native` (27 checks), and `pnpm build` passed. `pnpm native:sync` found and synced the secure-storage plugin to Android and iOS. Android backup XML parsed and excludes the plugin's encrypted preferences from legacy backup, cloud backup and device transfer. This machine has Java 8, so an Android Gradle build was not run.
- **Hosted services and devices:** No hosted account, push delivery, offline launch, Android package, or iOS archive was verified. Milestones 4–12 remain open.

## Work toward milestones 8–12 — 2026-10-07

- **8:** Android and iOS custom callback registration, constrained return-link parser, system-browser auth flow, cold/warm listener and native account screens are implemented locally. Native Supabase redirects/templates are not configured and device acceptance has not passed.
- **9:** Notification tap hook, minimal route payload and native notification icon are implemented. FCM/APNs configuration and real-device delivery remain unverified.
- **10:** Native icons and splash use the existing UpCatch mark and palette. A version/build consistency check, release-bundle guard, camera usage descriptions and store-listing draft exist. Privacy declarations and final binary metadata remain pending.
- **11:** Local checks for the native-client development pass passed on 2026-10-10. Hosted services and real-device regression remain open.
- **12:** No release signing, AAB/archive verification or store submission occurred.

## Verification record — 2026-10-07

- **Local:** `pnpm typecheck`, `pnpm test:native` (34 checks), `pnpm test:push` (7 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), `pnpm build`, `pnpm native:check` and `pnpm native:sync` passed. Sync found the App and Browser plugins on Android and iOS. The metadata check matched `package.json` 1.1.0 with both native version strings and build number 1. `pnpm native:release-check` failed as designed because the production bundle still contains a setup placeholder.
- **Hosted services and devices:** No Supabase redirect or email delivery, OneSignal FCM/APNs delivery, offline launch, Android/iOS device regression, signed binary or store acceptance was verified. Milestones 4–12 remain open; completion remains 25% (3/12).

## Development status — 2026-10-10

The packaged client source, native navigation adapter, camera permission descriptions, release signing inputs and stricter bundle guard are implemented. The local verification below passed. Milestones 4–12 remain open until their device and hosted acceptance evidence exists.

## Verification record — 2026-10-10

- **Local:** `pnpm native:bundle`, `pnpm native:sync`, `pnpm typecheck`, `pnpm test:native` (34 checks), `pnpm test:push` (7 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), `pnpm build`, `pnpm native:check` and `pnpm native:release-check` passed. The synced Android and iOS assets match the local bundle; both native configs omit `server.url`. Version strings are 1.1.0 and build numbers are 1. Vite emitted nonblocking "use client" and large-chunk warnings.
- **Hosted services and devices:** No hosted Supabase redirect or email delivery, OneSignal FCM/APNs delivery, offline installed-app launch, Android/iOS device regression, signed binary or store acceptance was verified. Completion remains 25% (3/12).

## Development status — 2026-10-11

Native profile sign-out now uses the session manager for push identity and private-state cleanup. Password recovery checks the same Google sign-in policy as the web app. Native return links close the system browser after returning, and pending Google Terms acceptance is applied only to a Google-linked identity. The release guard also checks local bundled assets for configured server secret values without printing them. Supabase email redirect instructions and the local Android toolchain gaps are recorded in `docs/native-release-operations.md`. Final local checks for these edits follow; no hosted or device acceptance is implied.

## Verification and deployment coordination — 2026-10-17

- **Local:** `pnpm typecheck`, `pnpm test:native` (34 checks), `pnpm test:push` (7 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), `pnpm build`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check` and `pnpm native:release-check` passed after the 2026-10-11 edits.
- **Hosted database:** `pnpm db:check` connected to the configured hosted Postgres and reported all 29 migrations recorded, with no pending migration. It was a dry run and applied nothing.
- **Hosted web:** The existing `www.upcatch.co.uk` site returned HTTP 200, but `/api/mobile/session` returned HTTP 404 when checked before the parallel primary-web deployment. A separate Vercel preview of this workspace completed in project `upcatch-brandnew`; it was not promoted to production. The preview mobile endpoints and real account flows have not been verified.
- **Devices and stores:** No installed offline launch, FCM/APNs delivery, Android/iOS device regression, signed package or store acceptance has been verified. Milestones 4–12 remain open; completion stays 25% (3/12).

## Domain change observed 2026-10-17

The production domain is now `upcatch.uk`; the apex redirects to `https://www.upcatch.uk`. The native bundle default API origin was updated to the final `www` host so bearer requests use one HTTPS origin. A direct unauthenticated `GET https://www.upcatch.uk/api/mobile/session` returned HTTP 404 earlier on 2026-10-17, while the home page returned HTTP 200. The primary web project's production `siteUrl`, auth redirects, canonical URLs and provider settings should also be reconciled with the new host; no primary deployment was made from this workspace.

## Production API follow-up — 2026-10-17

- **Hosted web:** After the primary web deployment, all seven `/api/mobile/*` routes returned JSON `401` to an unauthenticated request from `capacitor://localhost`, including the upload and private-photo routes. `OPTIONS /api/mobile/session` returned `204` with the expected Capacitor origin, `GET` method and authorization header; a request from `https://example.org` returned JSON `403`. This confirms route reachability and basic CORS/auth rejection only. Authenticated responses, production data parity, image access, upload, push delivery and meetup commands remain unverified.
- **Hosted database:** `pnpm db:check` connected to the configured Postgres and found all 29 local migrations recorded, with none pending. This was a dry run; it did not exercise member accounts or change data.
- **Local:** `pnpm typecheck`, `pnpm test:native` (34 checks), `pnpm test:push` (7 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), `pnpm native:bundle`, `pnpm native:sync`, `pnpm build`, `pnpm native:check` and `pnpm native:release-check` passed. The native bundle produced Vite directive and chunk-size warnings; the release guard confirmed local assets and no remote WebView URL.
- **Devices and stores:** `adb devices` showed no attached Android device. Offline installed-app launch, two-account hosted flows, authentication return links, FCM/APNs delivery, signed packages and store acceptance remain unverified. Milestones 4–12 stay open; completion remains 25% (3/12).

## Android packaging progress — 2026-10-24

- **Local:** Installed JDK 21 and used the existing SDK 36 to run `android/gradlew.bat assembleDebug` successfully. The rebuilt debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` (24,083,894 bytes). `aapt` reports package `uk.co.upcatch.app`, version `1.1.0` (code 1), minimum SDK 24, target SDK 36, and coarse location, camera and notification permissions. `pnpm native:release-check` passed against the synced local bundle. This is a debug build, not a signed store AAB.
- **Emulator:** The rebuilt APK installed on an API 30 emulator with Wi-Fi and mobile data disabled, and the sign-in shell opened ([screenshot](native-evidence/android-api30-offline-unstyled.png)). Its bundled Android System WebView is Chrome 83; it does not apply the CSS layer rules used by the approved design, so this is **not** an accepted visual/offline launch. The app bundle now uses root-based `/assets/` links so navigation to `/auth/login` cannot resolve CSS under `/auth/assets/`; `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and the rebuilt `assembleDebug --offline` passed. An API 36 image was installed, but that emulator cannot start with this machine's HAXM hypervisor; it requires WHPX. `pnpm typecheck` and all 34 `pnpm test:native` checks passed. A modern WebView device/emulator check remains open.
- **Hosted services and stores:** No real-account sign-in, location permission flow, push delivery, signed AAB, or store acceptance was verified. Milestones 4–12 remain open; completion remains 25% (3/12).

## Store graphics progress — 2026-10-25

Generated and inspected Play Console's 512 × 512 full-square icon and 1024 × 500 RGB feature graphic, plus a 1024 × 1024 RGB iOS icon reference, from existing UpCatch assets. `pnpm native:store-assets` reproduces the files and checks their dimensions, channels, and Play icon size limit. `docs/native-store-listing.md` records upload locations and remaining screenshot work. No store upload, final device screenshot, or binary metadata acceptance occurred, so milestone 10 and overall completion remain open at 25% (3/12).

## Android Google return investigation — 2026-10-25

A tester reported that Google sign-in remained in the system browser. The APK's Android intent filter resolved `uk.co.upcatch.app://auth/callback` in both warm and cold emulator launches; cold launch opened `uk.co.upcatch.app/.MainActivity`. Supabase's redirect allow list was reported corrected after the initial failure. The app is expected to use the system browser for Google OAuth and return by that custom scheme. Real Google sign-in after the hosted setting change is awaiting a device retest; no authenticated session was verified, and milestone 8 remains open.

## Native login visual update — 2026-10-25

At the user's request, the native login screen alone now uses the existing `public/landing/cafe-lunch.png` as a sharp, opaque background behind an opaque form card. The approved shared account component, other screens, fonts, and theme files were not changed. `pnpm typecheck`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and `android/gradlew.bat assembleDebug --offline` passed. The updated debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`; visual inspection on a modern Android WebView and the Google return test remain open.

The user then requested that the photo remain visible behind the heading and links. The full white card was removed; only the Google/email/password/sign-in controls have a compact dark translucent backdrop, while the heading, account links, and legal links use white text over the sharp image. This native client change was synced to both Android and iOS. Local typecheck, bundle, sync, release check, and Android debug APK build passed. Real-device visual review and the Google browser return remain open.

The user then reported `Failed to fetch` after Google login. The native API CORS allowlist omitted Android's default WebView origin, `https://localhost`; that exact origin has now been added. The change requires deployment through the primary web project before it affects production. No deployment or device retest has been performed, so native authentication acceptance remains open.

The revised Android debug APK from this visual pass is 24,207,819 bytes, SHA-256 `2EE7CE45301AA62F5B9F13FA0C18E5A8172ECB8DFF1005182B627681643AC04B`.

## Android OAuth fetch fix — 2026-10-25

The reported `Failed to execute 'fetch' on 'Window': Illegal invocation` came from `MobileApi` storing the browser `fetch` function and invoking it as an instance method. Bind the default transport to `globalThis`; add a regression case that asserts the browser global is the receiver. `pnpm typecheck` and all 35 native tests passed. The fixed bundle synced to Android and iOS, `pnpm native:release-check` passed, and `assembleDebug --offline` succeeded. Updated Android debug APK: 24,320,040 bytes, SHA-256 `FAC7734AAFE4B6E73E3E03CD274627B9EF7EE54D541DA44D0E602EC26DB53D76`. Real Google sign-in on the user's phone remains to be retested.

## Android push pilot — 2026-10-25

For the requested web-versus-Android two-account check, the native push switch now reflects whether this device restored a subscription and waits for an FCM token before reporting notifications enabled. `pnpm typecheck`, all 7 focused push checks, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and Android `assembleDebug --offline` passed locally. The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` (24,320,249 bytes, SHA-256 `332F3C641A6ED8706A71E07823D03DF4EF91B9A8157A6786B9AC8351DA752DD9`). A production preflight with `Origin: https://localhost` returned HTTP 403, so the primary web deployment must receive the Android CORS fix before the account-based push check can proceed. Android FCM configuration in the OneSignal dashboard and a real-device notification remain unverified. No Android device was attached by ADB. Milestones 5, 8, 9 and 11 stay open; overall completion remains 25% (3/12).

## Android login and production CORS follow-up — 2026-10-25

The primary web CORS commit initially reached a feature branch while production `main` still served the old allowlist. After `main` moved and Vercel deployed it, hosted `OPTIONS` requests from `https://localhost` returned HTTP 204 for mobile session, bootstrap and push, with matching `Access-Control-Allow-Origin`; an unauthenticated session GET returned HTTP 401 with that header. These checks prove route reachability and CORS behavior, not successful Google login or an authenticated session. The native API now converts a raw fetch `TypeError` into a clear connection message. Local `pnpm typecheck`, all 5 focused mobile API checks, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and Android `assembleDebug --offline --quiet` passed. Updated debug APK: 24,320,325 bytes, SHA-256 `2CA15958C205A5E277CD49728C2D8D4ABAD412A99FF3E89367F9B117C985F5A0`. Real Android and iOS authentication, push delivery and store checks remain open; milestone completion stays 25% (3/12).

## Android session and location follow-up — 2026-10-25

After a tester reported repeated returns to sign-in and a location failure, Android session setup stopped using a WebView install marker to erase app-scoped secure auth storage; iOS retains its uninstall guard. A mobile API 403 no longer signs out a valid token. Temporary restore failures now show a retry screen while preserving the account. Native authenticated routing replaces the login history entry, and foreground refresh no longer remounts the whole app for the same member. Android location requests allow 30 seconds and show distinct guidance for denied permission, disabled phone location, timeout and Play services errors. The location dialog uses phone-settings wording in native builds. `pnpm typecheck`, 9 focused native auth/session checks, all 36 native checks, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, Android `assembleDebug --offline --quiet`, and `pnpm build` passed locally. Updated debug APK: 24,207,818 bytes, SHA-256 `CCA968142F54A7989362A859F87883A2382849334420DBD6B5D51C77AB434952`. The exact phone location error and real session persistence have not been observed on a connected device; milestones 5, 8, 9 and 11 remain open and completion stays 25% (3/12).

## Native regression audit — 2026-10-25

The native share sheet now uses the configured public UpCatch origin instead of the WebView's `https://localhost` origin for live share links. Notification tap listener initialization runs independently of account restoration, so a stalled OneSignal SDK cannot hold the authenticated startup screen. A failed foreground refresh now enters the retry/sign-in flow; when the session is gone, it clears the previous member's rendered data. The approved screen layout and theme were not changed.

**Local:** `pnpm typecheck`, all 36 `pnpm test:native` checks, `pnpm build`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and Android `assembleDebug --offline --quiet` using JDK 21 and the installed Android SDK passed. The Android debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` (24,207,819 bytes; SHA-256 `5BE6967A4B34AA6C1D54BA92D08CE52E59CFF3725D50A4821BC047A1EEB49F2D`). iOS source and bundled assets were synced, but no iOS archive was built on this Windows machine.

**Hosted services and devices:** No phone was attached via ADB. Real sign-in return, restart persistence, location save, private photos, two-account matching, notification delivery, and offline launch remain to be verified on installed builds. Milestones 4–12 remain open; completion stays 25% (3/12).

## Native startup screen — 2026-10-25

An installed app with a saved session previously showed the login form while secure session restoration and backend bootstrap ran. The native client now keeps the existing login photo and centered UpCatch logo visible until the initial account check completes. It then displays the signed-in app, the login form if no session exists, or the reconnect screen for a recoverable failure. This transitional screen was requested by the user; the existing login and app layouts were not altered. Device visual and timing acceptance remain open.

**Local:** `pnpm typecheck`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and Android `assembleDebug --offline --quiet` passed. The updated debug APK is 24,321,087 bytes with SHA-256 `2D4F57B49C4B97A6F22CEFCCCD58636C3D8C4D57D1FF9D71079BCAFF44EED5F7`. iOS assets were synced; Android and iOS device appearance remain unverified. Milestone completion stays 25% (3/12).

## Google Play upload preparation — 2026-10-31

`docs/android-play-upload-guide.md` records the Android package ID, version/build values, Play graphics, signed `.aab` path, first internal-test upload steps, and disclosure/device gates. The prepared icon and feature graphic exist and their PNG dimensions were checked locally. A new private upload key was created outside the project in `C:\Users\dipti\UpCatch-release-keys`; its password was not displayed or committed. `pnpm typecheck`, `pnpm native:bundle`, `pnpm native:sync`, and `pnpm native:release-check` passed. The first offline `bundleRelease` failed because a OneSignal dependency was not cached; a second build downloaded it and succeeded. `jarsigner -verify` reported `jar verified`. The signed AAB is `android/app/build/outputs/bundle/release/app-release.aab` (22,232,471 bytes; SHA-256 `7398B82B51A68C09130365742E4A39CB5C5BB38AFFB4964FA7E4A72517D10A7C`). The release merged manifest reports package `uk.co.upcatch.app`, version code `1`, version name `1.1.0`, and target API `36`. No Play Console upload or new device acceptance was performed. Milestones 4–12 remain open; completion remains 25% (3/12).

## Hosted push diagnosis — 2026-10-31

**Hosted service read-only check:** `node scripts/diagnose-push.mjs` connected to the configured hosted database and reported 14 recent pending or failed push jobs with `Push provider returned 401`. Eleven meetup pushes and one welcome push reached the five-attempt failure limit. Two friend-online pushes remained due but had already expired, so they are not suitable for delivery after the fix. The last recorded meetup push failure was on 25 October; the current OneSignal key has not been verified by a new successful delivery. Five of 14 members had push enabled. No notification was sent by this diagnostic.

**Required hosted fix and acceptance:** Verify that Vercel Production `ONESIGNAL_API_KEY` holds the actual App API key value for the OneSignal app named by `NEXT_PUBLIC_ONESIGNAL_APP_ID` (not its dashboard Key ID), then redeploy. Keep `ONESIGNAL_ALIAS_SECRET` stable so existing device aliases remain valid. With an opted-in Android subscription, create a fresh pairing or friend-online event and confirm the new job is `sent` and the device receives it in the background. Repeat on iOS after APNs setup. This remains open under milestone 9; overall completion stays 25% (3/12).

**Play Console warning:** Version code 1 uses `minifyEnabled false`, so no R8 mapping file exists. The deobfuscation warning does not block this AAB and does not explain push failures.

## Open testing release validation — 2026-10-31

The user reports Play Console errors that the Open testing draft adds or removes no app bundles and cannot upgrade existing users. The signed local bundle has version code `1`; the Play Console library and track version codes have not been verified. First inspect the draft's Added/Included rows and App bundle explorer. Select version code `1` from the library or promote its existing track release if this is the first Open testing release. If a track already serves a higher code, build a new signed bundle with a code above it. No Open testing rollout or Play-installed device acceptance is claimed; milestone 12 remains open and completion stays 25% (3/12).

## Android version-code-2 release bundle — 2026-10-31

At the user's request, prepared a new Android bundle with version code `2` and version name `1.1.1`, using the existing private upload key. `package.json`, Android Gradle, and both iOS Xcode build/version settings now agree. `pnpm native:check`, `pnpm typecheck`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and `pnpm build` passed locally. Gradle `bundleRelease` passed and `jarsigner -verify` reported `jar verified`. The release merged manifest reports `uk.co.upcatch.app`, code `2`, version `1.1.1`, target API `36`. The new `android/app/build/outputs/bundle/release/app-release.aab` is 22,232,431 bytes, SHA-256 `91BE867B2F534DCF2710C0BBB1E0D9A79E9F24D212D7E371F34BC305688C0BD0`. iOS assets were synced but no iOS archive was built on Windows. No Play upload or device check was performed; push provider authentication remains unresolved. Milestones 4–12 remain open; completion stays 25% (3/12).

## Android version-code-3 Production bundle — 2026-11-01

At the user's request, prepared a new signed AAB for a Production release draft with version code `3` and version name `1.1.2`, reusing the existing private upload key. Android Gradle, `package.json`, and both iOS Xcode version/build settings agree. `pnpm native:check`, `pnpm typecheck`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:release-check`, and `pnpm build` passed locally. Gradle `bundleRelease` passed, and `jarsigner -verify` reported `jar verified`. The release merged manifest reports `uk.co.upcatch.app`, code `3`, version `1.1.2`, target API `36`. The AAB at `android/app/build/outputs/bundle/release/app-release.aab` is 22,232,442 bytes, SHA-256 `E8C8FEFBCF8128E68FA93C4E0131E196925E7D2038035C9DC1C5AE46B021DEF8`. iOS assets were synced; no iOS archive was built on Windows. Play Console upload, Production acceptance, real-device checks, and push delivery remain unverified. Milestones 4–12 remain open; completion stays 25% (3/12).

## UpCatch 2.0.0 release verification — 2026-11-08

- **Local:** `pnpm test:native` (36 checks), `pnpm test:push` (7 checks), `pnpm test:db` (269 checks), `pnpm test:images` (4 checks), `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check`, and `pnpm native:release-check` passed. The source and synced Android/iOS assets use version `2.0.0`, build `4`. The release guard found a bundled client and no remote WebView URL. `pnpm typecheck` and `pnpm build` fail because `components/upcatch/upcatch-app.tsx` passes a `live` object without `themStart`, `themInitials`, and `themProgress` required by `MapCanvasProps` in `components/upcatch/map-canvas.tsx`.
- **Devices and hosted services:** `adb devices -l` listed no Android device. This Windows environment cannot build or test an iOS archive. Nearby-invite notification delivery/taps into the Wall, scheduled chat, cancellation, and cold/warm app links were not exercised on devices or hosted accounts. Code inspection found the server sends `data: {route: 'app'}` for push jobs, so the Wall-specific tap path is not selected by those jobs. The local push test covers the generic route only. No store submission or repository push was made.
- **Android artifact:** The offline `bundleRelease` run reused the existing private upload key. `jarsigner -verify` reported `jar verified`. The merged release manifest reports package `uk.co.upcatch.app`, version code `4`, version name `2.0.0`, minimum API `24`, and target API `36`. The AAB is `android/app/build/outputs/bundle/release/app-release.aab` (22,238,190 bytes; SHA-256 `8682C222DBF9D01B23289A8345DAC9DC199A0835F62A203F60A12F5361F2E230`). Store and device acceptance remain open; keep milestones 4–12 open and completion at 25% (3/12).

## iOS package preparation — 2026-11-09

- **Local:** With `CAPACITOR_SERVER_URL` unset, `pnpm install --frozen-lockfile`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check`, `pnpm native:release-check`, `pnpm typecheck`, `pnpm test:native` (37 checks), `pnpm test:push` (7 checks), `pnpm test:db` (268 checks), `pnpm test:images` (4 checks), and `pnpm build` passed. The release guard reports version `2.0.0`, build `4`, a bundled client entry, and no remote WebView URL. Synced iOS assets are ready for Mac-side Xcode signing and archive preparation.
- **Devices and hosted services:** No iOS archive, installed-device offline launch, APNs delivery, or App Store Connect upload was performed on this Windows machine. Milestones 4–12 remain open; completion stays 25% (3/12).

## OneSignal production configuration check — 2026-11-14

- Pulled the linked `upcatch-brandnew` Vercel Production environment into an ignored local file. `NEXT_PUBLIC_ONESIGNAL_APP_ID` is populated, while `ONESIGNAL_API_KEY` and `ONESIGNAL_ALIAS_SECRET` are empty. The local `.env.local` also has no OneSignal API key. No credential values were printed or committed.
- **Local:** `pnpm test:push` passed all 7 mocked checks.
- **Hosted read-only:** `scripts/diagnose-push.mjs` found 17 notification preference rows, 5 with push enabled, and 7 pending or failed push jobs from the past seven days categorized as `Push provider returned 401`. No notification was sent, and device delivery remains unverified. Populate the Production OneSignal App API key and stable alias secret for the configured app, redeploy, then test a fresh notification on a subscribed device. Milestone 9 and overall completion remain unchanged at 25% (3/12).
- **Local key follow-up:** The operator added an App API key to `.env.local`. Its app ID matches the fetched Production app ID. A read-only OneSignal `GET /notifications` request authenticated with HTTP 200, and `pnpm test:push` again passed all 7 mocked checks. The fetched Production API key remains empty; no push was sent or delivered to a device.

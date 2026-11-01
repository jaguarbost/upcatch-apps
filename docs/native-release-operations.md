# Native release operations and acceptance record

The native client source is in `native-client/`. Build it with `pnpm native:bundle`, then copy it into both platforms with `pnpm native:sync`. Until the final build and offline device checks pass, do not upload a package. This runbook records the external work and evidence needed for milestones 8–12. Use the deployed Next.js backend and existing Supabase project; keep provider keys and signing material outside this repository.

## 8. Authentication return links

- Android and iOS register `uk.co.upcatch.app://auth/callback`. `lib/native/return-links.ts` parses only that callback and listens to cold and warm opens. `lib/native/auth-flow.ts` initiates Google OAuth in the system browser, carries explicit Terms acceptance across a cold return, and offers signup, resend, recovery and explicit token-hash confirmation methods. `native-client/main.tsx` connects the flow to native account screens and the approved app UI.
- In Supabase Auth, allow `uk.co.upcatch.app://auth/callback` and `uk.co.upcatch.app://auth/callback?next=reset` as redirect URLs. Native signup and resend pass the first URL; recovery passes the second. Keep the web callback URLs allowed as well. The signup template link should use `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=signup`; the recovery template link should use `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery`. These separators match the current redirect URLs on web and native. Keep the confirmation action in the app/web UI so mail scanners cannot consume the token hash. A template hard-coded to `{{ .SiteURL }}` will not return to the app. [Supabase's email-template variables and token-hash guidance](https://supabase.com/docs/guides/auth/auth-email-templates) explain the two variables.
- Use the same native Supabase client's PKCE storage for OAuth initiation and code exchange. Register the listener before reading the launch URL. Route successful sign-in/confirmation to `/start` and recovery to `/auth/reset-password`; show an error for expired codes. Test installed Android and iOS builds when cold and warm for Google, signup confirmation and recovery. Record the account ID and screen reached, without recording tokens.
- A custom scheme is registered but domain-verified Universal/App Links are not configured. Add domain association files only after the operator confirms the production domain and Apple team/Android signing fingerprints.

## 9. OneSignal push

- Configure Android FCM credentials and iOS APNs key in the existing OneSignal app for the production package and bundle ID `uk.co.upcatch.app`. Keep FCM and APNs private files/keys out of the repository. Android's Gradle project applies the Google services plugin only when `google-services.json` is present; OneSignal's Capacitor setup documents Android FCM credentials in the OneSignal dashboard. The iOS release target already has production push entitlement.
- `pnpm native:assets` generates a monochrome `ic_stat_upcatch` notification icon. The server sends that icon name, the blue accent and a minimal `route: app` payload. The bundled client starts `listenForNativePushTaps` without blocking session restoration and refreshes its authorized live data on tap; notification data is never an authorization source.
- On both real platforms: opt in, opt out, sign out, switch accounts, receive an active offer in foreground/background, tap into the current account, and verify an expired offer cannot be accepted. Record device OS, app version/build, provider receipt and backend meetup state. A successful OneSignal API response alone does not prove delivery.

## 10. Store metadata

- Run `pnpm native:assets`, `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check` and `pnpm native:release-check` with `CAPACITOR_SERVER_URL` unset. The release check rejects a setup placeholder, missing or stale local scripts, and a remote WebView URL. Verify the installed app opens offline and check icons and splash on device. `docs/native-store-listing.md` contains draft copy and a data inventory. Finish store privacy forms using the final binary, privacy notice and provider settings.
- Keep `package.json`, Android `versionName` and iOS `MARKETING_VERSION` equal. Increment both native build numbers for each binary uploaded. Update `package.json` only when a release is actually made, following the version rule in `AGENTS.md`.

## 11. Regression evidence

- Local: run `pnpm typecheck`, `pnpm test:native`, `pnpm test:push`, `pnpm test:db`, `pnpm test:images`, `pnpm build`, `pnpm native:check` and `pnpm native:sync` after the production bundle exists. Save command results and build identifiers.
- Hosted/devices: two real accounts on web and each native platform; email confirmation and reset; Google return; photos and denied cross-account reads; coarse location; live queue, sequential offers, expiry, arrival, completion, cancellation, history and ratings; push states; offline launch; app background/resume; store policy and account deletion paths. Record each platform and service separately. Resolve failures before signing.

## 12. Signing and submission

- Android: use a private upload key held by the operator or CI secret store. The Gradle release variant reads `UPCATCH_ANDROID_KEYSTORE_FILE`, `UPCATCH_ANDROID_KEYSTORE_PASSWORD`, `UPCATCH_ANDROID_KEY_ALIAS` and `UPCATCH_ANDROID_KEY_PASSWORD` from the environment; never put them in a tracked file. Produce a signed AAB only after the bundled client passes the above gates. Inspect package ID, version/build, permissions and assets, then upload through Play Console internal testing before production review.
- iOS: on a Mac with the operator's Apple team, configure distribution signing and APNs capability, archive the Release scheme in Xcode, inspect bundle ID, version/build, entitlements and assets, then upload to App Store Connect/TestFlight. Submit for App Review only after the same device checks pass.
- Capture both store processing and acceptance receipts. Do not mark milestone 12 complete for a successful local build or an upload that has not been accepted for review.

## Evidence as of 2026-10-10

The native client Vite bundle, platform sync, typecheck, native/push/database/image checks, Next build, metadata check and release bundle check passed locally. The release check confirms matching local web assets and no `server.url`; it does not prove an installed offline launch. No hosted account/device acceptance record, FCM/APNs setup confirmation, signed AAB/archive or store submission receipt exists in this workspace.

## Local release prerequisites observed 2026-10-11

As of 2026-10-24, JDK 21 and SDK 36 are installed. `assembleDebug` passed and produced an installable debug APK. The API 30 emulator has WebView 83 and cannot render the approved CSS layer based design. An API 36 emulator image is installed but requires WHPX; this machine currently uses HAXM. A modern Android device or WHPX enabled emulator is needed for the visual, location permission, and sign-in acceptance checks. `android/app/google-services.json` and the four Android signing environment variables are absent. iOS archive and APNs checks need a Mac, Apple team access and provider configuration. These are environment and hosted-service gaps, not release passes.

## Deployment coordination observed 2026-10-17

The workspace was locally linked to the existing Vercel `upcatch-brandnew` project and a preview deployment completed at `https://upcatch-brandnew-9thvs93cc-upcatchuk-6527s-projects.vercel.app`. No production promotion was made. A separate deployment of the primary web app is in progress, so do not deploy this workspace to production or reassign its domain until that work is reconciled. Before that parallel deployment, the public site served `/` but returned 404 for `/api/mobile/session`; the native client needs those production API routes before hosted acceptance can start. The preview route itself has not been tested.

## Domain change observed 2026-10-17

The production domain is now `upcatch.uk`; the apex redirects to `https://www.upcatch.uk`. The native bundle default API origin was updated to the final `www` host so bearer requests use one HTTPS origin. A direct unauthenticated `GET https://www.upcatch.uk/api/mobile/session` returned HTTP 404 earlier on 2026-10-17, while the home page returned HTTP 200. The primary web project's production `siteUrl`, auth redirects, canonical URLs and provider settings should also be reconciled with the new host; no primary deployment was made from this workspace.

## Production mobile API verification — 2026-10-17

The primary deployment now serves all seven mobile route paths. Unauthenticated requests from `capacitor://localhost` returned JSON `401` for `GET session`, `GET bootstrap`, `POST profile-photo`, `GET push`, `POST notifications`, `GET member-photo` and `GET friend-photo`. The session preflight allowed the Capacitor origin, `GET` and `Authorization`; a foreign-origin request returned `403`. These checks did not use a member token or exercise Supabase data, Storage, OneSignal or email. Continue with real-account and device checks in milestone 11 before treating the backend contract as accepted.

`pnpm db:check` connected to the configured hosted Postgres and found all 29 migrations recorded with none pending. The check applied no migration and did not change member data.

## Android login fetch failure — 2026-10-25

The reported `Failed to fetch` after Google sign-in is consistent with Android WebView's default `https://localhost` origin being absent from the native API CORS allowlist. The server allowlist now includes that exact origin alongside the existing iOS and development origins. This backend source change must reach the primary production web deployment before an installed app can use it. Do not promote this separate workspace to production; deployment coordination recorded above still applies. The existing debug APK already contains the client-side fetch binding fix, so this CORS change does not require a new APK. After the primary backend deploys it, retest Google sign-in and the authenticated session on Android and iOS; neither hosted deployment nor device acceptance has been verified here.

On 2026-10-25, a production `OPTIONS /api/mobile/session` request with `Origin: https://localhost` returned HTTP 403. The primary web deployment still needs the Android CORS fix before the web-versus-Android two-account notification check. The native push UI now verifies an FCM token before reporting success and reflects the current device's subscription after restoring an account. For the pilot: enable notifications on the Android account, confirm its OneSignal subscription says Subscribed, background the app, then use the web account to generate a meetup offer. Check the phone notification, tap it, and confirm the current offer in the app. An expired offer must remain unavailable.

Later the same day, after the primary web `main` moved and production deployed, `https://www.upcatch.uk` returned 204 for Android-origin preflights on session, bootstrap and push, and 401 plus `Access-Control-Allow-Origin: https://localhost` for an unauthenticated session GET. Retry real Android sign-in before proceeding to the two-account push test; these unauthenticated checks do not prove device login or delivery.

The next installed Android pass should check sign-in, force-close and relaunch to the same account, background and resume without resetting the current app screen, and the Android Back button without exposing the login form. For location, try with phone Location on and UpCatch allowed approximate permission, then try a denied-permission and a phone-Location-off path. Record the exact message if coordinate retrieval or the subsequent database save fails. Only after those checks pass should the two-account offer and push delivery be treated as release evidence.

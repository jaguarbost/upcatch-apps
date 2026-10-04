# Capacitor device builds

The `android/` and `ios/` folders are development projects for the existing Next.js app. The screens stay on the hosted Next.js server; the Capacitor WebView loads `/start` from `CAPACITOR_SERVER_URL`. Native plugins provide foreground approximate location and OneSignal push. The browser app keeps its existing browser APIs.

## Run a device build

Install Node 22 and pnpm 10.30.3. For Android, install Android Studio and an Android SDK. For iOS, use a Mac with Xcode. Configure the web server using `docs/setup.md` and give the device access to it through HTTPS.

```powershell
pnpm install
$env:CAPACITOR_SERVER_URL = 'https://your-test-upcatch-host.example'
pnpm native:sync
pnpm native:android
```

On macOS, set `CAPACITOR_SERVER_URL` in the shell, run `pnpm native:sync`, then `pnpm native:ios`. Run the app from Android Studio or Xcode. `CAPACITOR_SERVER_URL` is a build-time development setting. Sync again after changing it. Without it, the native project opens a setup page instead of the live app. Local `http://localhost` is accepted for simulator experiments, but a physical device needs a reachable HTTPS origin.

## Native configuration still required

- Use the same OneSignal App ID for the configured Web, Android and iOS platforms, or separate staging and production apps. Keep the API key and alias secret on the Next.js server. Add Firebase Cloud Messaging credentials for Android and APNs credentials for iOS in OneSignal.
- In Xcode, select the `App` target and set its signing team. The project includes Push Notifications and remote-notification background capability settings, debug/release APNs entitlements, and `handleApplicationNotifications: false` for OneSignal. Confirm Xcode signs each configuration with the matching APNs environment. Add a Notification Service Extension and App Group if rich notifications, confirmed receipts or OneSignal badges are needed.
- The Android manifest requests coarse location and notification permission. The iOS plist contains the When In Use location explanation. Check the exact permission wording and store declarations with the product owner before release.
- The generated native IDs are `uk.co.upcatch.app`. Confirm the final bundle ID, signing profiles and app icons before distributing a build.

## Test on real devices

Sign in with email and password, allow location, go online, enable push, receive an offer, tap it, disable push, then sign out and test a second account on the same device. Test denied and later restored permissions. Check OneSignal subscriptions and deliveries separately for Android and iOS. Google OAuth and email links currently return to the website; native return links need a dedicated deep-link flow before relying on them in the installed app.

Capacitor documents `server.url` as a live-reload feature and does not recommend it for production. This Next.js app uses server actions and cannot be exported as static assets. A store-ready native release needs a bundled client that talks to the hosted backend, or another reviewed production architecture. Do not ship the current remote-URL configuration as a store build.

## Technical release to-do

1. Keep the existing Supabase project and versioned migrations as the data source. Deploy the Next.js backend with the same Supabase URL and keys; put server secrets only in the hosting environment. The native binary contains no database credentials beyond the existing public Supabase configuration in web assets.
2. Replace the development `server.url` approach with a reviewed production client architecture. The current server actions, server rendering and same-origin cookies mean a plain static export is insufficient. Preserve the approved components and UI when separating the client from the backend.
3. Configure Android FCM and iOS APNs in the existing OneSignal app, then verify the same alias and server preference across web and mobile subscriptions. Keep push TTL and generic notification content. Add native notification icons and check notification taps reopen the correct authenticated app screen.
4. Add native return links for Google sign-in and email confirmation/reset, including system-browser OAuth, Android App Links and iOS Universal Links. Test cold-start, warm-start and expired links.
5. Build and test on current Android Studio/JDK/SDK and macOS/Xcode. Test coarse-location denial and restoration, permission changes, push opt-in/out, account switching, foreground/background delivery, and offers expiring while offline.
6. Align package, Android and iOS versions for each release. Complete app icons, signing, privacy declarations and store review. Test the hosted Supabase, OneSignal, email and cron services separately from local tests.

OneSignal is optional. Direct APNs and FCM delivery would require a device-token table and RLS, authenticated token registration and removal, Apple/Google credentials, separate provider transports, retry and expiry handling, token cleanup and delivery monitoring. The existing OneSignal alias flow already handles device subscriptions without a new token table, so it is the smaller change for the first native release.

# Capacitor client builds

`native-client/` packages the approved UpCatch screens with Vite. The installed app uses the existing hosted Next.js API and Supabase project. Its Supabase URL, publishable key, OneSignal app ID and API origin are public client configuration; server keys stay on the hosted backend. The release bundle has no `server.url`.

## Prepare a local package

Use Node 22 and pnpm 10.30.3. Android needs Android Studio, an SDK and a supported JDK. iOS needs a Mac with Xcode and the operator's signing team. Copy `.env.example` to ignored `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and, when push is configured, `NEXT_PUBLIC_ONESIGNAL_APP_ID`. Set `MOBILE_API_BASE_URL` only when the deployed backend differs from `https://www.upcatch.uk`.

```powershell
pnpm install
pnpm native:assets
pnpm native:bundle
pnpm native:sync
pnpm native:check
pnpm native:release-check
```

Leave `CAPACITOR_SERVER_URL` unset for those commands and for release builds. `native:bundle` requires public Supabase configuration and creates `capacitor-web/`; `native:sync` copies that bundle into both native projects. The release check confirms the copied entry and script exist locally and neither platform has a remote WebView URL. It cannot prove offline launch or native device behavior; run those checks on installed builds.

`pnpm native:android` opens the Android project. On a Mac, `pnpm native:ios` opens the iOS project. Android release signing reads the `UPCATCH_ANDROID_KEYSTORE_FILE`, `UPCATCH_ANDROID_KEYSTORE_PASSWORD`, `UPCATCH_ANDROID_KEY_ALIAS`, and `UPCATCH_ANDROID_KEY_PASSWORD` environment variables. Keep signing files and secrets out of this repository.

## Device development

`CAPACITOR_SERVER_URL` remains available for a reachable HTTPS development host. Set it before `pnpm native:sync` and unset it before creating a release. It is a live development route; the locally bundled client is the release route.

## External setup and acceptance

- Allow `uk.co.upcatch.app://auth/callback` in the same Supabase Auth project. Configure email templates to return native confirmation and recovery links while preserving web links. Test Google, confirmation and reset returns on cold and warm Android and iOS launches.
- Configure Android FCM and iOS APNs in OneSignal for `uk.co.upcatch.app`. OneSignal's Capacitor setup requires the Android FCM service account in the OneSignal dashboard. If this Android app also uses a Firebase client configuration, put its `google-services.json` in the ignored `android/app/` location; do not put the FCM service account key in the binary. Configure the Apple team and push capability in Xcode. Keep provider credentials out of the app bundle.
- Verify coarse location, optional camera and notification permissions on both platforms. Android declares coarse location, camera and notifications; iOS declares When In Use location and camera explanations. The existing app UI requests camera for a photo or QR scan only after a user action.
- Run two-account hosted regressions for auth, profile photo authorization, Go Live, offer expiry, meetup lifecycle, push opt-in/out, account switching and offline launch. Record web, Android and iOS evidence separately from local checks.
- Match `package.json`, Android and iOS version strings, and increment the native build numbers for each uploaded binary. Finish store privacy declarations and listings against the final binary. See `docs/native-release-operations.md` and `docs/native-release-plan.md`.

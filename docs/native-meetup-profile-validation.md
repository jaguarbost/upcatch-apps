# Native meetup and profile adaptation — 2.0.3/build 9

## Scope and comparison

Read web commits `da32fa2ee5da383a42a3cfd41923429bc871ede8` and `5bd23a18a7bb9ced15de42dedb37afd19eba256f` from `jaguarbost/upcatch-brandnew` into this repository for comparison only. No other repository was modified or pushed.

- Adapted the meetup panel and profile dialog from `da32fa2`. The blue **Msgs X** button opens the current live meetup conversation; X is `state.messages.length`, the loaded count. Timestamps remain sourced from persisted `created_at`. Venue suggestions and quick replies are now in that conversation, not in the meetup panel.
- Incoming avatar/name and paired meetup avatar/name open the existing real participant profile. Kept the native incoming-profile identity reset and absolute deadline. The incoming profile disappears on expiry; a paired profile receives no countdown.
- Added the yellow friendship footer using the existing `openFriends('show', person)` flow. Profile's existing **My code** and **Scan**, native QR flow and permissions remain intact. Received nudge dismissal is labelled **Not now** with its original handler.
- Added Profile photo replacement and legal links. Native Vite resolves `PhotoUpload` to a native editor, not the Next.js component/server action. The editor reuses onboarding's file input/camera capture and image preparation, then the bearer-authenticated mobile API uploads multipart field `photo` to `POST /api/mobile/profile-photo`. Success reloads the native bootstrap; the provider synchronizes the new signed photo URL into shared user state without resetting other profile data. The persisted backend profile is also loaded on cold launch through the existing bootstrap path.
- Native legal links open the hosted Terms/Privacy through Capacitor Browser, preserving the signed-in screen. They do not navigate the WebView into website marketing pages.
- Kept native onboarding/startup, Auto/Light/Dark storage and system/resume handling, fonts, blue/yellow tokens, sharing/deep links, OneSignal, safe areas, keyboard handling, authentication and meetup lifecycle. No global CSS, root layout, original `app/page.tsx`, metadata or sharing implementation was changed. Hosted `upcatch-share.jpg` remains the website's responsibility.
- From `5bd23a1`, adapted only the applicable nearby-area wording, and added nearby-first/city-wide scheduled discovery wording to the existing help. No matching parameters changed. No marketing landing, `/why` or `/archive/landing` was imported or used as native startup.
- Package version is **2.0.3**; Android versionCode and both iOS build configurations are **9**. The existing iOS purpose-string and OneSignal launch-URL safeguards are preserved.

## Local checks

- `pnpm typecheck` and `pnpm build`: passed. This is a local production compilation, not a website deployment.
- `pnpm test:native`: 52 passed, including mocked component interactions for live chat navigation/count, QR footer, real profile input, request timer/expiry, persisted timestamps, venue suggestions/quick replies, photo preparation/upload/refresh, hosted legal navigation, and existing auth, session, app-link and appearance tests.
- `pnpm test:images`: 4 passed. `pnpm test:push`: 13 passed. Initial sandbox worker-spawn errors were rerun outside the sandbox successfully.
- `pnpm native:bundle`, `pnpm native:sync`, `pnpm native:check`, `pnpm native:release-check`: passed. Vite retained its existing ignored `use client`/sourcemap and large-chunk warnings; output was generated successfully.
- Inspected the source diff for unintended protected-file changes. No database/schema/migration or production data changes. No dependency or lockfile changes.

## Device and hosted acceptance still needed

ADB reported no attached Android device. No physical iOS device or macOS/Xcode archive was available. Automated component tests use mocked hooks/events, not a rendered device or browser.

- On device, open **Msgs X** from a paired meetup; check the correct partner, loaded count, scrolling, persisted timestamps, venue suggestions, quick replies, send and keyboard dismissal.
- Open an incoming profile using both photo and name; wait for expiry and confirm closure. Open a paired profile and confirm no countdown.
- Test the yellow QR footer, **My code**, **Scan**, camera permission allow/deny and reciprocal friendship confirmation.
- Replace a photo from the library and camera; test cancel, invalid file, network failure and retry. Confirm Profile, own meetup avatar and QR screens refresh, then force-close/relaunch and confirm the saved photo persists. This real authenticated write was not performed from this workspace.
- Open Terms and Privacy, close the hosted browser, and confirm return to the same signed-in screen.
- Check Auto across system theme changes and resume, then saved Light/Dark after relaunch, on actual iOS and Android devices.
- Native push delivery/tap navigation and hosted link-preview rendering were not tested in this change. Prior missing server notification cases are not claimed fixed by this UI adaptation.

No production database changes, hosted deployment, app-store upload or app-store publication was performed.

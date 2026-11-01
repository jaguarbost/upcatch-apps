# UpCatch — Google Play upload guide

**Updated 1 November 2026.** Use this as the working sheet for the Android release. It records what is in this workspace; it is not evidence that Google Play has accepted a release.

## What Play Console is asking for

The **App bundles → Upload app bundles** box expects a **signed Android App Bundle (`.aab`)**. The installed `app-debug.apk` is for phone testing and is **not** the file to upload. The “2 of 3 enhancements active” message is a Play App Signing status indicator, not the bundle file itself. [Google's release instructions](https://support.google.com/googleplay/android-developer/answer/9859348) and [Play App Signing guide](https://support.google.com/googleplay/android-developer/answer/9842756) explain these steps.

**Current status (1 November 2026):** A new signed `.aab` with version code `3` has been built and its JAR signature verified. The user reports that an earlier bundle went into testing and now wants to create a Production release; the Play library and track state have not been independently verified. Google sign-in return, push delivery, location, and the full two-account meetup flow still need testing on a Play-installed build before Production rollout.

## Values to check in Play Console

| Field | Current project value | Where it comes from |
| --- | --- | --- |
| App type | App | Choose **App**, not Game. |
| Store name | UpCatch (draft) | The visible store name can differ from the identifier. |
| Package name | `uk.co.upcatch.app` | Must match the Play app record before its first bundle upload. This is the permanent Android identity. |
| Version name | `1.1.2` | `package.json` and `android/app/build.gradle`. |
| Version code | `3` | `android/app/build.gradle`. This must be higher than the app's existing active code in Play. |
| Minimum Android version | Android 7.0 / API 24 | `android/variables.gradle`. |
| Target API | API 36 | `android/variables.gradle`; recheck Play's current target API rule when uploading. |
| Release track | Production draft requested | Finish phone acceptance checks before rollout. |

**Before the first upload, check the package name shown in Play Console.** A different store name is fine. A different package name means this bundle will not match that app record. Once an artifact is uploaded, Play fixes the package name for that app. [Google's internal testing guidance](https://support.google.com/googleplay/android-developer/answer/9845334).

## Files and copy already prepared

| Play Console field | Prepared item | Status |
| --- | --- | --- |
| Main store listing → App icon | `store-assets/android/play-icon-512.png` | Present; 512 × 512 PNG with alpha. |
| Main store listing → Feature graphic | `store-assets/android/feature-graphic-1024x500.png` | Present; 1024 × 500 PNG without alpha. |
| App name | **UpCatch** | Draft; use your preferred public name. |
| Short description | **Meet new friends nearby, one real conversation at a time.** | Draft. |
| Full description | See `docs/native-store-listing.md` | Draft; review against the final app. |
| Privacy policy | `https://www.upcatch.uk/privacy` | Check that the live page is complete and accurate before submission. |
| Terms | `https://www.upcatch.uk/terms` | Check the live page. |
| Phone screenshots | Capture from the final installed app | Still needed. Include login, Go Live, an offer, a confirmed meetup, and profile where possible; hide real member details. |
| Signed app bundle | `android/app/build/outputs/bundle/release/app-release.aab` | **Ready locally:** 22,232,442 bytes; SHA-256 `E8C8FEFBCF8128E68FA93C4E0131E196925E7D2038035C9DC1C5AE46B021DEF8`. Code `3`; Play validation pending. |

Google's [preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151) apply to the icon, graphic, and screenshots. The prepared PNG dimensions were checked locally. Screenshots must match the shipped interface; do not use mockup data as proof of actual meetups.

## Prepare the signed bundle

1. Check the release candidate on a real device, including offline launch and basic navigation. Test saved login, Google browser return, approximate location, profile photo, notifications, and a two-account meetup on the **Play-installed** build after the internal upload, because Play signing can differ from the debug APK.
2. Choose and securely back up a **private upload keystore**. Keep its file and passwords outside this repository. For a new Play app, Google can manage the app signing key while your upload key signs each `.aab`. Keep the upload key for future updates. [Android signing guide](https://developer.android.com/studio/publish/app-signing).
3. Configure the release build's `UPCATCH_ANDROID_KEYSTORE_FILE`, `UPCATCH_ANDROID_KEYSTORE_PASSWORD`, `UPCATCH_ANDROID_KEY_ALIAS`, and `UPCATCH_ANDROID_KEY_PASSWORD` in a secure local or CI environment. Do not paste their values into this guide, source files, chat, or a tracked `.env` file.
4. Confirm `CAPACITOR_SERVER_URL` is unset. Build and sync the final client with `pnpm native:bundle` and `pnpm native:sync`; run `pnpm native:release-check`. The release check confirms the local bundle and absence of a remote WebView URL, but a phone must still prove offline launch.
5. Build the signed release bundle with Gradle's `bundleRelease` task. Verify the output at `android/app/build/outputs/bundle/release/app-release.aab`, its package ID, version code, certificate, and SHA-256 hash. Do not upload if the bundle is unsigned or the package ID differs from the Play record.
6. If Google sign-in or other Google services use an Android OAuth client, check its package name and the **Play app signing certificate** fingerprints after Play processes the bundle. The Play-installed app may have a different signature from a local debug install.

The current Gradle project reads those four signing variables in `android/app/build.gradle`. The build script `scripts/build-android-aab.ps1` created a private upload key and password file in `C:\Users\dipti\UpCatch-release-keys`, outside this project, and reuses them on later runs. **Back up both files together in a secure place.** Do not upload the debug APK in place of the AAB. The new release bundle's merged manifest reports package `uk.co.upcatch.app`, version code `3`, version name `1.1.2`, and target API `36`.

## Upload in Play Console

**Deobfuscation warning:** This bundle has `minifyEnabled false` in `android/app/build.gradle`, so R8 did not obfuscate Java/Kotlin code and did not produce a `mapping.txt` file. Play Console's missing deobfuscation file message is a non-blocking warning for this build. There is no mapping file to upload. If shrinking is enabled for a future release, preserve that release's mapping file; Play normally collects it from an AAB built with a recent Android Gradle plugin. This warning is unrelated to push delivery. [Google Play's deobfuscation guidance](https://support.google.com/googleplay/android-developer/answer/9848633).

**Open testing draft says no app bundles were added or removed:** On **Test and release → Latest releases and bundles / App bundle explorer**, check whether version code `1` exists and which track already uses it. In the Open testing draft, inspect **App bundles → Added** and **Included**. If version code `1` is in the library but is missing from **Added**, use **Add from library** to select it, or use **Promote release** from its existing track. If the Open testing track already includes that same code and no bundle changes, this draft has no release change; discard the duplicate draft rather than submitting it again. If an existing eligible track has a higher version code, create a new signed bundle with a greater code and add that new bundle to the draft. Google requires successive releases to increase the version code for upgrades. [Play release setup](https://support.google.com/googleplay/android-developer/answer/9859348), [Android versioning](https://developer.android.com/studio/publish/versioning).

1. Open **Test and release → Production → Create new release** or edit the current Production draft. Confirm the page heading says **Production** before adding the bundle.
2. Complete the Play App Signing prompts if this is the first release. In **App bundles**, choose **Browse files** and select the verified, signed `.aab` above.
3. Review Play's package name, version code, permissions, device support, warnings, and generated app size. Fix any blocking issue before saving.
4. Suggested test release notes: **“UpCatch Android test: sign in, profile setup, nearby matching and meetup flow.”** Adjust this to features actually working in that bundle.
5. Before Production rollout, install **from Play** through a testing track and check login after relaunch, Google return, location, push while the app is in the background, and the full meetup flow. [Google's testing guidance](https://support.google.com/googleplay/android-developer/answer/9845334).

## Other Play Console forms to finish

- **Store listing:** final app name, descriptions, category, icon, feature graphic, phone screenshots, support email, and any required website/contact details.
- **App content:** privacy policy, Data safety, content rating, target audience, app access instructions and reviewer test account, and account deletion URL. Answer from the final binary and actual Supabase, OneSignal, Resend, and analytics configuration; `docs/native-store-listing.md` is a worksheet, not a completed disclosure. Google requires accurate [Data safety](https://support.google.com/googleplay/android-developer/answer/10144311) and an external deletion resource when users can create accounts ([policy](https://support.google.com/googleplay/android-developer/answer/18265346)).
- **Release evidence:** retain the signed bundle hash, upload certificate fingerprint, Play processing result, installed build version, and tester outcomes. Do not mark the native release milestone complete until the acceptance checks in `docs/native-release-plan.md` pass.

## Immediate next action

Upload the new signed bundle at `android/app/build/outputs/bundle/release/app-release.aab` to the **Production** draft and confirm it appears under **Added** as version code `3`. If Play says code `3` is already used or below an active bundle, check **App bundle explorer** for the highest code before creating another build. Back up the upload key and password file, and test the Play-installed build before Production rollout.

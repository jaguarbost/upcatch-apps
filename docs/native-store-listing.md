# Native store listing draft

This is copy and a disclosure inventory for the first iOS and Android release. It is not a submitted listing. The release version comes from `package.json`; Android `versionName` and iOS `MARKETING_VERSION` must match it. Increment Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` for every uploaded binary, including retries.

## Public copy

**Name:** UpCatch

**Short description:** Meet new friends nearby, one real conversation at a time.

**Full description:** UpCatch helps adults make platonic friendships and arrange in-person meetups. Set your availability in Manchester, choose who you would like to meet, and decide together whether to accept a match. Chat to agree on a public meeting place, check in when you arrive, and share feedback afterwards. Your profile, preferences and meetup history stay with your UpCatch account across web and mobile. Location is used for nearby matching; notifications are optional.

**Category proposal:** Social networking. **Age proposal:** Adults 18+. Confirm both classifications in the store questionnaires before submission.

**Support and policy links:** `https://www.upcatch.uk/privacy`, `https://www.upcatch.uk/terms`, plus an operator-controlled support URL and email before submission.

**Screenshots:** Capture the approved login, onboarding, Go Live, offer, confirmed meetup and profile screens on supported iPhone and Android sizes from release builds. Do not use mockup fixtures as evidence of real participation.

## Prepared store graphics

Run `pnpm native:store-assets` to regenerate these files from the approved UpCatch mark and existing cafe image. They are listing assets; they do not alter the in-app UI.

| Store asset | File | Upload use |
| --- | --- | --- |
| Google Play icon | `store-assets/android/play-icon-512.png` | 512 × 512, 32-bit PNG, full square. Upload in Play Console **Main store listing → Graphics → App icon**. Play applies its own corner mask. |
| Google Play feature graphic | `store-assets/android/feature-graphic-1024x500.png` | 1024 × 500, RGB PNG with no alpha. Upload in **Main store listing → Graphics → Feature graphic**. Alt text: "Two people meet over coffee, beside a blue and yellow connection graphic." |
| Apple app icon reference | `store-assets/ios/app-icon-1024.png` | 1024 × 1024, RGB PNG with no alpha. The App Store icon is supplied by the iOS asset catalog in the uploaded build; use this file to review the artwork. |

**Still to capture:** Real screenshots from an installed, fully styled release candidate. Google Play requires at least two screenshots across device types; four phone screenshots at 1080 px or higher are recommended for broader placements. App Store Connect requires at least one iPhone screenshot and accepts up to ten; supported pixel sizes vary by iPhone class. Capture the approved UI with real test accounts, remove personal details, and verify each image matches the shipped app. Do not submit the API 30 emulator screenshot in `docs/native-evidence/`: its WebView did not render the approved design.

Specifications: [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151), [Google Play icon design](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [Apple screenshot sizes](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), and [Apple app icon submission](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/).

## Disclosure worksheet to complete in each store console

| Data or permission | Current product use | Store review action |
| --- | --- | --- |
| Email, Supabase user ID and Google basic profile if selected | Authentication and account recovery | Declare account data and account creation. Verify account deletion request wording. |
| Display name, birth month/year, photo, city, interests and preferences | Profile, age gate and matching | Declare user-provided profile data and photo handling. |
| Messages, meetup history, ratings, reports, blocks and presence | Meetup delivery and safety | Declare user content, activity and safety processing as applicable. |
| Coarse location | Requested when going online; rounded coordinates saved for matching | Declare location use and verify the release binary requests only the stated permission. |
| Push token and OneSignal identifier | Optional notifications | Declare device identifier and notification processing as applicable. |
| Vercel analytics | Optional and consent controlled | Verify native collection behavior before answering tracking and analytics questions. |

The actual Apple privacy labels and Google Data safety answers must be checked against the final binary and the Supabase, OneSignal, Resend and Vercel configurations. The website privacy notice currently lacks the operator's legal identity, confirmed transfer safeguards and a final retention schedule; resolve those facts before store submission. Store screenshots, support contact, content rating and reviewer credentials require the operator's final approval and console access.

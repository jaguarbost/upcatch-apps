# Native onboarding — 2.0.4/build 10

Adapted the client contract from web `2a2b545` (web release 2.1.9), read-only. No web repository push, website deployment, production database change or store publication from this workspace.

## Behavior

- Four real stages: name/birth details, existing native location flow, photo, then Bio/interests. Existing completed accounts stay completed; saved-photo/pending-about accounts resume stage 4 on relaunch.
- Onboarding photo requests use authenticated multipart `/api/mobile/profile-photo`, field `photo`, with `onboardingVersion=2`. Profile-photo replacement retains the unflagged existing-account flow. Advancement requires `photoSaved: true` and a supported `nextStep`. Ambiguous failures check authenticated bootstrap before retrying; an explicit validation/authentication error never advances.
- Bio is trimmed and requires 1–500 characters. At least three distinct supported interests are required; the choices match the inspected web commit. The bearer-authenticated JSON `/api/mobile/onboarding/about` request contains only Bio/interests, never an account ID. HTTP 200 and `completed: true` are required before native account refresh. Failure preserves the fields and saved photo; retrying Bio never uploads the photo again.
- Fixed the native post-upload dead end: provider state now synchronizes server-confirmed completion without requiring a component remount. Refreshed bootstrap Bio/interests/photo populate shared user state; Profile shows the saved Bio.
- Onboarding header uses the existing native safe-area inset plus 24 px. The content scrolls independently; the footer remains separate with bottom-inset spacing. No global CSS changes.
- Startup runs the independent server identity checks together and still verifies member identity and accepted terms before private bootstrap. Identity checks and API requests have finite deadlines. API stalls show retry errors; late superseded account refreshes cannot replace newer UI state. This is a code-path improvement, not a measured device startup benchmark.
- How it works uses the three supplied images as an image-only, full-screen manual slider. No additional visible captions. Includes icon navigation, swipe, dots, close and an FAQ control. First-use persistence is retained and the slider yields to active meetup requests. Profile's existing help button reopens it.
- Compressed the complete 853 × 1844 artwork, without cropping or resizing, from 4,662,994 bytes to 298,986 bytes (93.6% smaller): 109,868 / 93,310 / 95,808 bytes. Original PNG sources stay in `howitworks/`, outside the native public asset directory. Only compressed WebP images ship in the app.
- At the user's explicit request to stage all code, this release also includes the existing local iOS QR permission bridge and its scanner changes. See the QR section of the native release plan. It does not change Android permission handling.

## Verification

- Typecheck and native production bundle passed. All 70 native tests passed, covering completion handoff, photo failure/retry and strict success, ambiguous upload recovery, saved-photo relaunch, Bio validation and failed-save retry, completed accounts, denied location, startup identity gates, finite API deadlines, persisted appearance, authentication/deep links, and image-only slider navigation/persistence/meetup interruption.
- Image tests: 4 passed. Push tests: 13 passed. QR permission/lifecycle tests are run separately. These are local automated tests, not device delivery or camera tests.
- An isolated build checkout was used to verify the onboarding changes independently while QR work was in progress. After the user requested all code, the final release bundle was rebuilt from the combined workspace. Turbopack rejected the isolated dependency junction, so that isolated production check uses `pnpm build --webpack`; this is an environment limitation, not a source compilation result.
- Hosted read-only check: the new About endpoint returned HTTP 204 to a native-origin OPTIONS preflight. No authenticated photo/Bio write, database mutation, email delivery or push delivery was tested against production.

## Device checks still required

No attached Android device or iOS/macOS build environment was available. Check real photo camera/library selection, timeout/retry, relaunch into stage 4, Bio save persistence, denied/granted location, notched/compact screen safe areas, keyboard-open footer reachability, iOS camera permission/settings return, actual startup duration and slider swiping on devices. Swift compilation and TestFlight acceptance require Codemagic/macOS. Existing native authentication, deep links and OneSignal are preserved, but real delivery/navigation was not retested here.

Email confirmation still uses the native custom scheme for native signup; app-first HTTPS confirmation with web fallback is a separate web/association setup and was not implemented in this change.

# Native release implementation — 25% milestones complete (3/12)

**Progress rule:** Count a milestone only after its acceptance check passes. Strike through its entire checklist line when complete, then update the heading percentage to `round(100 × completed / 12)`. Record device and hosted-service evidence separately from local checks. Keep this plan current whenever native release work changes.

**Design rule:** Keep the approved app screens, yellow/blue theme, Bricolage Grotesque and Figtree fonts, spacing, mobile widths, components and interactions. Reuse the existing UI in the packaged client. Any visual change needs a specific user request.

**Architecture:** Keep one deployed UpCatch backend and the existing Supabase project. The iOS and Android packages are separate clients of that backend; they must not create another database or copy server secrets into the binary. The current `CAPACITOR_SERVER_URL` setting is for device development only.

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

The verified bearer-token helper, `GET /api/mobile/session` and `GET /api/mobile/bootstrap` are implemented locally. The bootstrap endpoint shares its data mapping with the web app. Next verify native session restoration, account switching and sign-out, then connect the remaining native endpoints and bundle the approved UI without `server.url`. The current app cannot be turned into a static Capacitor bundle by changing `webDir` alone. Real-device push and two-account meetup checks remain completion gates.

# Native client and backend contract

This is the implementation contract for milestone 3 of `docs/native-release-plan.md`. It describes the intended production boundary. The session and bootstrap endpoints are implemented locally; the remaining native endpoints are planned. The approved UpCatch screens and their theme remain the UI source. Web and native clients use the same Supabase project, migrations, account IDs, city data, meetup records and hosted Next.js backend.

## Client origin and session

- Bundle the mobile UI and visual assets locally. The binary uses a public `MOBILE_API_BASE_URL` (the HTTPS origin of the deployed Next.js backend) and the same public Supabase URL/publishable key as the web app. It contains no Supabase secret key, OneSignal API key, alias secret or Resend key. Release builds omit `server.url`.
- Use one native Supabase Auth client for session persistence and refresh. Email/password, confirmation, reset and Google sign-in belong to that client. The native client must preserve the current email-confirmed and Google-account policies before enabling app participation. Persist its refresh session in a platform secure store; clear it and the OneSignal identity on sign-out or account switch.
- Native calls to the Next.js backend send `Authorization: Bearer <Supabase access token>`. A new server helper verifies the token with Supabase Auth, checks confirmed email and `my_signin_policy`, then derives the member ID from that verified token. It never trusts a member ID or alias supplied by the client. The current cookie-based `requireMember()` remains for the web app. [Supabase token validation](https://supabase.com/docs/reference/javascript/auth-getuser).
- Native API endpoints return JSON errors and `401` for missing/invalid/expired tokens, `403` for an authenticated but ineligible member, and `503` for unavailable dependencies. Refresh once on `401`; then return to sign-in if refresh fails. Do not redirect API requests to HTML login pages.
- `GET /api/mobile/session` verifies a restored native token and returns the authenticated member ID, email, display name and onboarding state. The client uses the member ID to clear cached state when accounts change. This endpoint is implemented; the other native endpoints below remain planned.
- Permit only the exact Capacitor app origins in CORS for native endpoints, with `Authorization` and `Content-Type` headers and `GET`, `POST`, `OPTIONS` methods. CORS is not authorization: every protected request still requires a verified bearer token. Keep the existing same-origin and cookie protections on web routes.

## Existing behavior to retain

| Current entry point | Packaged-client contract |
| --- | --- |
| `app/auth/actions.ts`: sign-up, sign-in, resend, reset, Google, terms and sign-out | Native Auth adapter uses Supabase Auth and the same terms metadata and `my_signin_policy`. Keep provider checks that require server authority behind a narrow, rate-limited endpoint with non-enumerating responses. Use system-browser Google OAuth and app return links; do not embed Google sign-in in the WebView. |
| `app/auth/callback/route.ts` | Keep web callback behavior. Add a native callback path and Universal/App Links for confirmation, recovery and OAuth. Preserve explicit user confirmation before consuming email token hashes. Handle cold and warm launches. [Capacitor deep links](https://capacitorjs.com/docs/guides/deep-links). |
| `components/account/member-app.tsx` | `GET /api/mobile/bootstrap` returns the existing `LiveBootstrap` shape from authenticated profile, city, venues, signed own-photo URL, `my_meetup_access`, `my_birth_eligibility` and push preference. Both use `loadLiveBootstrap` so their data mapping stays aligned. Cache privately and refresh on account change. |
| `app/onboarding/actions.ts` save details | Call `save_profile_birth` through the native user's RLS-scoped Supabase client after reading the active pilot city. Keep age and city checks in Postgres. |
| `app/onboarding/actions.ts` photo upload | `POST /api/mobile/profile-photo` accepts multipart image plus bearer token. Share the existing size check, upload reservation, image normalization, private Storage write, finalization, cleanup and welcome-job handling. Never upload raw bytes directly to private Storage from the app. |
| `app/privacy/requests/actions.ts` | Call `request_privacy_right` and `my_privacy_requests` through the native user's RLS-scoped client. Keep operator review and current error wording. |
| `app/api/push/route.ts` | `GET/POST /api/mobile/push` uses verified bearer identity and the existing preference/alias service. The server derives the opaque alias; native never computes it. Keep the web route and its origin check. |
| `app/api/notifications/route.ts` | `POST /api/mobile/notifications` uses verified bearer identity and the existing job dispatcher. Its result is an acknowledgement, not proof of delivery. |
| `app/api/member-photo/route.ts` and `app/api/friend-photo/route.ts` | Native equivalents accept bearer auth, retain participant/QR authorization, stream private JPEG with `no-store`, and never put tokens in URLs. The native client fetches bytes and revokes temporary object URLs when no longer used. |

## Live data path

The packaged UI may continue calling these public RLS-protected Supabase RPCs directly with the native user's session: `my_live_state`, `my_partner_location`, `save_member_settings`, `go_online`, `update_matching_search`, `complete_meetup_feedback`, `rate_meetup`, `meetup_command`, `publish_availability`, `report_current_meetup`, `send_meetup_message` and `remove_friend`. The existing client polling and ordered command behavior stays intact. Postgres continues to enforce matching, city and meetup eligibility. Do not copy private-schema queries or service-role access into the app.

## Implementation sequence and checks

1. Add a shared server member service that accepts either the current verified web session or a separately verified native bearer token. Expose only the listed native endpoints and keep response shapes typed.
2. Build a platform data/auth adapter consumed by the approved UI. Move Next-only imports (`next/navigation`, server actions, cookie client and relative `/api` fetches) behind it without changing components' presentation.
3. Implement and test native session storage, token refresh, account switching and deep links. Supabase's [native redirect guidance](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) covers confirmation and OAuth return flows.
4. Verify with two real accounts against the hosted project: web/native data equivalence, denied cross-account reads, rejected unconfirmed participation, photo access, push preference, matching and sign-out. Run local database/image/push checks separately from hosted-device tests.

The current `CAPACITOR_SERVER_URL` build is only for device development. The session and bootstrap endpoints are implemented locally; a bundled production client and the other planned endpoints are not yet complete.

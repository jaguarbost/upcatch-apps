# Production domain and privacy operations

Production origin: https://upcatch.co.uk. Production auth callbacks and canonical URLs use this origin. Local development remains on localhost.

## Hosted configuration required
- Add upcatch.co.uk and www.upcatch.co.uk to the existing Vercel project. Follow the DNS records Vercel supplies; redirect www to the apex. Main is the production branch.
- Set NEXT_PUBLIC_SITE_URL=https://upcatch.co.uk in Vercel production.
- Supabase Auth Site URL: https://upcatch.co.uk. Allow https://upcatch.co.uk/auth/callback (including reset query) for confirmation, recovery and OAuth. Keep localhost callbacks limited to development.
- Verify upcatch.co.uk in Resend and use the verified sender hello@upcatch.co.uk. SMTP remains configured separately in Supabase.
- OneSignal production Web Push origin: https://upcatch.co.uk; worker /OneSignalSDKWorker.js.
- Configure PRIVACY_CONTROLLER_NAME, PRIVACY_CONTROLLER_ADDRESS and PRIVACY_CONTACT_EMAIL with confirmed operator details. Do not publish publicly until these, retention and transfer arrangements are confirmed.

## Privacy requests
Apply migration 202609271002_privacy_birth.sql with the established migration runner. The private privacy_requests table is RLS-protected and accessible to members only through owner-scoped RPCs. Requests are durable records, not automatic exports or account deletion. Operators must monitor open requests daily in Supabase SQL Editor, respond within the applicable deadline and record completion using privileged SQL. No email alert is implemented.

Review requests across Auth, Postgres, Storage, notification jobs, provider records and backups. Foreign keys and safety/participation ledgers require reviewed erasure or anonymisation; do not blindly delete auth users. Document retention periods, legitimate-interest assessments, provider agreements, regions, international-transfer safeguards, incident response and ICO registration/fee obligations before launch.

Birth month/year is held privately. Eligibility starts in the month after the 18th birthday month because the birth day is not collected. Existing members must supply month/year before further participation; no birth date is inferred from an old age declaration. Eligibility is a declaration, not ID approval.

Analytics is blocked until optional consent; rejection and acceptance have equal controls and can be changed. The only root-layout change mounts the requested privacy control in place of unconditional Analytics, preserving fonts, CSS and app layout.

Guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/

Onboarding asks for required location and optional camera/notifications before photo completion. Only rounded coordinates are saved. Camera streams are stopped immediately after permission is granted.

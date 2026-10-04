# UpCatch project instructions

## Preserve the approved design

The existing mockups are the visual source of truth. Keep the theme, UI, fonts, layout, spacing, colours, responsive behaviour, and interactions intact unless the user explicitly requests a specific design change.

- Do not redesign, simplify, restyle, replace, or “clean up” existing mockups during backend or feature work.
- Preserve `app/page.tsx` as the original mockup entry point.
- Preserve `app/globals.css`, `app/layout.tsx`, `app/manifest.ts`, existing `components/upcatch/**`, `components/ui/**`, `lib/upcatch-data.ts`, and existing visual assets in `public/`.
- Preserve the mockup's yellow (`live`) and blue (`primary`) theme. Do not introduce a replacement palette.
- Keep Bricolage Grotesque for display text and Figtree for body text. Reuse the existing font variables, design tokens, component variants, icons, animation styles, and mobile widths.
- Reuse existing UI primitives such as `PrimaryButton`, `PersonAvatar`, `Chip`, and existing form/card patterns when creating new screens. Compose or wrap them without modifying their mockup source.
- Wire real authentication, profile data, matching, Go Live, meetup actions, and ratings into the approved mockup screens and existing interactions. Backend wiring is not permission to replace those screens with new integration forms or dashboards.
- Routes such as `/start` and `/live` may handle routing and authentication, but must render the approved mockup UI for the corresponding flow. Do not introduce an alternative app design.
- Keep demo fixtures separate from live account/database state. Change data sources, handlers, and state management as necessary without changing the approved visual presentation.
- Any change to theme, fonts, layout, spacing, navigation, screen composition, or visual hierarchy requires an explicit user request for that specific change. The previously requested landing redesign applies only to the landing page and does not authorize changes to the app screens.
- Do not change global CSS or the root layout to accommodate a new screen. Scope any necessary new styles to the new component and use existing tokens.
- Before finishing, inspect the diff for accidental edits to protected mockup files. Restore only your own accidental edits; never discard the user's changes.
- If a requirement cannot be delivered without changing a protected mockup, explain the concrete change needed. Do not infer permission to redesign from “implement,” “fix,” or “make scalable.”

## Current implementation scope

- Supabase Auth, Supabase Free Postgres, Supabase Storage, OneSignal, Resend, and Vercel Cron only.
- Signup requires email confirmation. Initial onboarding ends after basic details and profile-photo upload.
- ID review is required after three completed meetups, before further participation; uploading a document alone is not approval.
- The user has authorized the real meetup lifecycle: city/intent/venue matching, mutual acceptance, arrival, completion, cancellation, history and ratings. ID-upload/review UI remains deferred. Implement the lifecycle through the approved mockup components and flows.
- Manchester is the initial city. Maintain a global account model and city-scoped neighbourhoods/venues/meetups. Adding a city must be a data operation, not a frontend rewrite.
- Existing mockup fixtures never count as real participation or verification.

## Database and credentials

- Keep schema changes in versioned Supabase migrations. Enable RLS and explicit grants.
- Enforce city relationships and meetup allowance at the database boundary, not only in the UI.
- Store image bytes in private Supabase Storage and paths in Postgres.
- Never display or commit credentials. Use ignored `.env.local`; keep `.env.example` blank of real values.
- Do not expose the private schema or server-only credentials to browser code.
- See `docs/setup.md`, `docs/database-architecture.md`, and `docs/manchester-venues.md`.

## Release version

- Show the app version at the end of the profile, sourced from `package.json`.
- Update the version with every release. Use 1.0 through 1.9 for regular releases; reserve 2.0, 3.0, and later whole-number major versions for big changes.

## Native release progress

- Maintain `docs/native-release-plan.md` during iOS and Android product packaging. Strike through a milestone only after its acceptance check passes, and update the completion percentage in the file heading using the rule in that plan.
- Preserve the approved theme, fonts, screens and interactions in the packaged apps. Use the same deployed backend and Supabase project; never place server credentials in a native binary.

## Verification

Use pnpm and preserve its lockfile. Run relevant checks:

- `pnpm typecheck`
- `pnpm test:db` for migrations/access control
- `pnpm test:images` for upload handling
- `pnpm build`

Report hosted-service tests separately from local tests. Do not claim migrations, email delivery, push delivery, deployment, or browser testing succeeded unless actually verified.

## Authorized Go Live behaviour

- Adapt Go Live screens for desktop while retaining the yellow/blue theme, existing fonts, components and mobile mockups.
- Going online never requires choosing a venue. Pair eligible online members within their city, oldest queued member first, then present the offer to the second member only after the first accepts. Both must accept before confirmation.

import Link from 'next/link'
import { AccountShell } from '@/components/account/shell'
import { PrivacySettingsButton } from '@/components/privacy/consent'
import type { Metadata } from 'next'
export const metadata:Metadata={title:'Privacy notice',description:'How UpCatch uses personal data and how to exercise your privacy rights.',alternates:{canonical:'https://www.upcatch.co.uk/privacy'}}
export default function PrivacyPage(){
 const contact=process.env.PRIVACY_CONTACT_EMAIL
 return <AccountShell title="Your privacy at UpCatch" description="Last updated 27 September 2026">
 <section className="space-y-3 text-sm leading-relaxed">
 <h2 className="font-display text-xl font-bold">Who handles your data</h2>
 <p>UpCatch operates at upcatch.co.uk. {process.env.PRIVACY_CONTROLLER_NAME ? 'Data controller: '+process.env.PRIVACY_CONTROLLER_NAME+'.' : 'The service operator has not yet supplied their legal identity for this notice.'} {process.env.PRIVACY_CONTROLLER_ADDRESS}</p>
 {contact&&<p>Privacy contact: <a href={'mailto:'+contact} className="text-primary underline">{contact}</a>.</p>}
 <h2 className="font-display text-xl font-bold">What we use and why</h2>
 <p>We process your email, authentication identifiers, display name, birth month and year, profile photo, city, interests, preferences, friendships, messages, meetup history and ratings to provide your account and arrange meetups (contract). UpCatch is for adults 18 and over; we do not need your full birth date.</p>
 <h2 className="font-display text-xl font-bold">Signing in with Google</h2>
 <p>If you choose Google sign-in, Google shares your account identifier, email address and basic profile information, such as your name and profile picture, with our authentication provider, Supabase. We use this information to authenticate you and create or connect your UpCatch account. We do not request access to your Gmail messages, contacts, calendar or Drive files. We do not sell Google account data or use it for advertising.</p>
 <p>You can remove UpCatch&apos;s access in your <a href="https://myaccount.google.com/connections" className="text-primary underline">Google Account connections</a>. Removing access does not itself delete your UpCatch account; use our data request page to request deletion.</p>
 <h2 className="font-display text-xl font-bold">Location, safety and optional features</h2>
 <p>Location permission is required for going online. We keep rounded coordinates for matching; matched members may see an approximate area after the relevant acceptance stage. Your own precise map marker uses browser location on your device. Birth month and year are private and are not shown to other members.</p>
 <p>We use account restrictions, reports, blocks, verification status, presence events and operational logs for safety, fraud prevention and service security (legitimate interests). You can object to this processing; we assess your request against necessary safety and legal obligations. ID document upload and review are not currently available.</p>
 <p>Analytics, push notifications and trusted-contact sharing are optional. Analytics uses your consent; you can withdraw it through Privacy settings. Push can be disabled in your profile and browser settings. Camera access is optional; you can upload an existing profile photo. Only add a trusted contact who expects these emails and let them know about this notice.</p>
 <h2 className="font-display text-xl font-bold">Storage and sharing</h2>
 <p>Supabase provides authentication, Postgres and private photo storage; Vercel hosts the site and optional analytics; Resend delivers service emails; OneSignal provides opted-in push. Other members receive only the profile and meetup information needed for the interaction. We do not sell personal data.</p>
 <p>These providers may process information outside the UK. Provider locations and the applicable international transfer safeguards have not yet been confirmed for this notice. You can request information about transfers and safeguards through the data request page.</p>
 <h2 className="font-display text-xl font-bold">Cookies and device storage</h2>
 <PrivacySettingsButton />
 <p>Supabase authentication cookies and short-lived confirmation cookies support sign-in and email verification. We store your analytics choice locally on your device until you change it or clear site data. Optional analytics is disabled until you accept. OneSignal is used for opted-in notifications and may use device storage. Essential authentication storage cannot be disabled while using an account.</p>
 <h2 className="font-display text-xl font-bold">Retention and your rights</h2>
 <p>Account data is kept while needed to provide your account. Safety records may need to be retained for investigations or legal claims. Erasure requests are reviewed individually, including photos, backups and provider records. Retention depends on whether your account remains active, an unresolved safety report or legal claim requires the record, and applicable legal obligations. A final retention schedule has not yet been confirmed; no automatic deletion period is promised here.</p>
 <p>You can request access and a portable copy of your data, correction, erasure, restriction or objection. Consent can be withdrawn without affecting earlier lawful processing. Use the authenticated request page below. We aim to respond within one month; identity verification or legally permitted extensions may apply.</p>
 <p>Matching uses city, queue order and your preferences. You can decline offers or stop going online. Contact the operator to challenge a restriction or request human review.</p>
 <Link href="/privacy/requests" className="block rounded-xl bg-primary p-4 text-center font-bold text-primary-foreground">Request access, correction or deletion</Link>
 <p>You can complain to the <a href="https://ico.org.uk/make-a-complaint/" className="text-primary underline">Information Commissioner&apos;s Office</a>.</p>
 <p>See also our <Link href="/terms" className="text-primary underline">terms of use</Link>. We will update this notice when our handling of personal data changes and bring material changes to your attention.</p>
 </section></AccountShell>
}

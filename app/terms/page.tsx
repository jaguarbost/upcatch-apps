import Link from 'next/link'
import type { Metadata } from 'next'
import { AccountShell } from '@/components/account/shell'

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms for using UpCatch and meeting other members.',
  alternates: { canonical: 'https://www.upcatch.co.uk/terms' },
}

export default function TermsPage() {
  const operator = process.env.PRIVACY_CONTROLLER_NAME?.trim()
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim()
  const address = process.env.PRIVACY_CONTROLLER_ADDRESS?.trim()

  return <AccountShell title="Terms of use" description="Last updated 29 September 2026">
    <article className="space-y-4 text-sm leading-relaxed">
      <h2 className="font-display text-xl font-bold">About UpCatch</h2>
      <p>UpCatch helps adults make platonic friendships and arrange in-person meetups in supported cities. These terms cover your use of upcatch.co.uk and your UpCatch account. Please read them alongside our <Link href="/privacy" className="text-primary underline">privacy notice</Link>.</p>
      {operator && <p>Service operator: {operator}. {address}</p>}
      {contact && <p>Contact: <a href={'mailto:' + contact} className="text-primary underline">{contact}</a>.</p>}

      <h2 className="font-display text-xl font-bold">Your account</h2>
      <p>You must be at least 18 to use UpCatch. Give accurate information, including your birth month and year, and use a profile photo you have permission to share. Keep your sign-in details secure. Do not impersonate another person, share your account or create accounts to bypass a restriction.</p>
      <p>Complete the required onboarding before participating. Location permission is required for nearby matching and going online. Notifications and camera access are optional; you can upload an existing photo.</p>

      <h2 className="font-display text-xl font-bold">Treat people with respect</h2>
      <p>Do not harass, threaten, discriminate against, deceive or exploit other members. Do not use UpCatch for sexual solicitation, scams, spam, illegal activity or unwanted commercial promotion. Respect boundaries and consent. Do not publish another person&apos;s private information or share their photos or conversations without permission.</p>
      <p>Only upload content you are entitled to use. You keep ownership of your content and allow UpCatch to store, process and display it as needed to provide and protect the service, as described in the privacy notice.</p>

      <h2 className="font-display text-xl font-bold">Meetups and safety</h2>
      <p>A meetup is confirmed only after both members accept. Keep arrangements accurate and cancel promptly if you cannot attend. Do not falsely mark arrival or completion, and give honest ratings.</p>
      <p>Meet in a public place, make your own travel arrangements and leave if you feel unsafe. UpCatch facilitates introductions; it cannot guarantee another member&apos;s conduct, attendance or the suitability or availability of a venue. A profile photo or verification status is not a guarantee of safety. Contact emergency services if there is immediate danger.</p>
      <p>We recommend meeting only at public venues, such as a cafe or restaurant open to the public. If members choose a private place or another non-public setting, they make that arrangement independently; UpCatch does not suggest, inspect or monitor that location. You remain responsible for deciding whether to attend, and you can cancel or leave if you feel unsafe. This guidance does not limit any rights or protections you have under law.</p>
      <p>Further participation after three completed meetups requires approved identity review. Uploading a document alone does not count as approval. If review is unavailable, further participation may remain restricted.</p>

      <h2 className="font-display text-xl font-bold">Restrictions and service changes</h2>
      <p>We may restrict or suspend access where reasonably necessary to investigate misuse, protect members, enforce these terms or comply with law. Where lawful and appropriate, we will explain the reason and provide an opportunity to challenge a decision. We may need to act immediately for urgent safety or security concerns.</p>
      <p>Features may change or be temporarily unavailable for maintenance, security or operational reasons. We will give reasonable notice of material changes where practicable. Changes to these terms will be shown here with an updated date; material changes will be brought to members' attention before taking effect where practicable.</p>

      <h2 className="font-display text-xl font-bold">Leaving UpCatch and your rights</h2>
      <p>You can stop using UpCatch at any time and <Link href="/privacy/requests" className="text-primary underline">request deletion of your account and personal data</Link>. Retention and any exceptions are explained in the privacy notice.</p>
      <p>Nothing in these terms excludes or limits liability for fraud, death or personal injury caused by negligence, or anything else that cannot lawfully be excluded or limited. Your statutory consumer rights remain unaffected.</p>
      <p>These terms are governed by the laws of England and Wales, without taking away mandatory protections available where you live. You retain any right to bring a claim in your local courts.</p>
    </article>
  </AccountShell>
}

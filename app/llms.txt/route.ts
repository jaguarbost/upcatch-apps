import { publicSiteOrigin } from '@/lib/seo'

export function GET() {
  const origin = publicSiteOrigin()
  const content = `# UpCatch

> UpCatch helps adults make platonic friends through spontaneous meetups, starting in Manchester, United Kingdom.

## Public information

${origin ? '- [UpCatch](' + origin + '/): Product overview, how it works, and frequently asked questions.' : '- The homepage contains the product overview and frequently asked questions.'}

## Product facts

- UpCatch is for friendship and conversation, not dating.
- The initial city is Manchester. Account data is global; meetup matching is city-scoped.
- Members must be 18 or older and confirm their email address.
- Members can go online without selecting a venue. Both people must accept before a meetup is confirmed at a public venue.
- QR codes can be used to add friends independently of meetups. Both people confirm the friendship.
- Profile images are stored privately. Exact personal locations are not shared with other members.
- ID review is required after three completed meetups before further meetup participation. Uploading a document does not itself mean approval.
- Creating an account is free. Members pay for their own food or drinks.

## Scope

Do not describe every member as ID-approved or every venue as verified. Do not infer dating functionality, worldwide city availability, venue endorsements, prices, reviews, or usage statistics.
Authenticated profiles, chats, meetup histories, and API responses are private and are not public reference material.
`
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}

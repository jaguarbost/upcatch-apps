import { Check, ChevronDown, Clock, HeartHandshake, ShieldCheck, Smartphone, X } from 'lucide-react'
import type { ReactNode } from 'react'

const PRINCIPLES = [
  {
    icon: Smartphone,
    title: 'Real life beats screen time',
    body: 'Success is time spent across a table, not minutes spent in the app.',
  },
  {
    icon: Clock,
    title: 'Spontaneous by default',
    body: 'Free now? Meet now. No calendars, no week-long back-and-forth.',
  },
  {
    icon: HeartHandshake,
    title: 'Friendship, not dating',
    body: 'Company for coffee, lunch or a walk. No swiping, no scoring.',
  },
  {
    icon: ShieldCheck,
    title: 'Safety is the product',
    body: 'Verified people, public venues and only an approximate location.',
  },
]

const IS = [
  'A coffee with a fellow designer',
  'Lunch with someone new to the city',
  'A walk around the park between meetings',
  'A pint after work with a fellow climber',
]

const IS_NOT = ['A dating app', 'Endless chat', 'Sharing where you live', 'Another feed']

const FAQS = [
  {
    q: 'Is UpCatch a dating app?',
    a: 'No. UpCatch is for friendly, platonic meetups. Profiles focus on interests, not looks, and there is no swiping. Anyone who treats it like a dating app can be reported.',
  },
  {
    q: 'Can people see where I am?',
    a: 'Never exactly. Others only see a rough ~300 m area while you are free. The only precise place anyone sees is the public venue you both agree on.',
  },
  {
    q: 'What if I change my mind?',
    a: 'That is fine. You can cancel before you meet, and the other person is told kindly. If something feels off at the venue, you can leave and let us know.',
  },
  {
    q: 'Does it cost anything?',
    a: 'Creating an account and meeting people is free. You just pay for your own coffee.',
  },
]

export function LandingStory() {
  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      <WhySection />
      <BeliefsSection />
      <ExamplesSection />
      <TeamNote />
      <FaqSection />
    </div>
  )
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-sm font-bold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="font-display text-3xl leading-tight font-extrabold text-balance lg:text-4xl">
        {title}
      </h2>
    </div>
  )
}

function WhySection() {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-10 flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className="flex flex-col gap-5">
        <p className="font-display text-sm font-bold tracking-wide text-primary uppercase">Why we built UpCatch</p>
        <h2 id="why-title" className="font-display text-3xl leading-tight font-extrabold text-balance lg:text-5xl">
          Cities are full of people. Most of us still eat lunch alone.
        </h2>
        <p className="leading-relaxed text-pretty text-muted-foreground lg:text-lg">
          {"Plans get stuck in group chats until everyone's too busy. Social apps are built to keep you scrolling, not to get you out of the door."}
        </p>
        <p className="leading-relaxed text-pretty text-muted-foreground lg:text-lg">
          {"So we flipped it. Take the free hour you already have, and use it to meet someone nearby at a public spot. Quick, simple and real."}
        </p>
      </div>
      <figure className="overflow-hidden rounded-[2rem] bg-card shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/cafe-lunch.png"
          alt="Two people chatting over lunch at a small table in a bright café"
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </figure>
    </section>
  )
}

function BeliefsSection() {
  return (
    <section aria-labelledby="beliefs-title" className="flex flex-col gap-8">
      <SectionHeading eyebrow="What we believe" title="Four things we won't compromise on." id="beliefs-title" />
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm lg:p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <h3 className="font-display text-base leading-snug font-bold text-balance lg:text-lg">{title}</h3>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ExamplesSection() {
  return (
    <section aria-labelledby="examples-title" className="flex flex-col gap-8">
      <SectionHeading eyebrow="What an UpCatch looks like" title="Small plans. Real people. Nearby." id="examples-title" />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-5">
        <ExampleList label="It is" tone="is">
          {IS.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="font-semibold">{item}</span>
            </li>
          ))}
        </ExampleList>
        <ExampleList label="It isn't" tone="not">
          {IS_NOT.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <X className="size-4" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="font-semibold text-muted-foreground line-through decoration-2">{item}</span>
            </li>
          ))}
        </ExampleList>
      </div>
    </section>
  )
}

function ExampleList({ label, tone, children }: { label: string; tone: 'is' | 'not'; children: ReactNode }) {
  return (
    <div className={tone === 'is' ? 'flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm lg:p-7' : 'flex flex-col gap-4 rounded-3xl bg-secondary p-5 lg:p-7'}>
      <h3 className="font-display text-sm font-bold tracking-wide text-muted-foreground uppercase">{label}</h3>
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  )
}

function TeamNote() {
  return (
    <section aria-labelledby="note-title" className="lg:mx-auto lg:w-full lg:max-w-3xl">
      <article className="flex flex-col gap-4 rounded-[2rem] bg-primary p-6 text-primary-foreground shadow-lg shadow-primary/30 lg:gap-5 lg:p-12">
        <p className="font-display text-sm font-bold tracking-wide uppercase opacity-80">A note from the team</p>
        <h2 id="note-title" className="font-display text-2xl leading-tight font-extrabold text-balance lg:text-4xl">
          We started UpCatch after one too many lunches at our desks.
        </h2>
        <p className="leading-relaxed text-pretty opacity-90 lg:text-lg">
          {"We moved to Manchester surrounded by thousands of people and somehow knew almost none of them. Every app we tried wanted more of our attention, not less. We wanted something that got us off our phones and into a café with someone interesting."}
        </p>
        <p className="leading-relaxed text-pretty opacity-90 lg:text-lg">
          {"Success, for us, isn't how long you spend in UpCatch. It's how quickly you close it, and who you end up sitting across from."}
        </p>
        <p className="font-display font-bold">The UpCatch team, Manchester</p>
      </article>
    </section>
  )
}

function FaqSection() {
  return (
    <section aria-labelledby="faq-title" className="flex flex-col gap-8 lg:mx-auto lg:w-full lg:max-w-3xl">
      <SectionHeading eyebrow="Good questions" title="Before you catch someone." id="faq-title" />
      <div className="flex flex-col gap-3">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group rounded-3xl bg-card shadow-sm">
            <summary className="press flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="px-5 pb-5 leading-relaxed text-pretty text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Coffee, HeartHandshake, MapPin, QrCode, Sparkles, X } from 'lucide-react'
import { PrimaryButton } from './primitives'
import { useUpCatch } from './app-provider'

const SEEN = 'upcatch:quick-start:v1'
const HelpContext = createContext<(() => void) | null>(null)
const STEPS = [
  { icon: Coffee, title: 'Pick your kind of catch-up', text: 'Coffee, dining or drinks? Choose your activity and who you want to meet, then go online.' },
  { icon: Sparkles, title: 'A little hello comes your way', text: 'We look for someone who fits your choices. Accept if it feels right, or pass and keep looking.' },
  { icon: MapPin, title: 'Both say yes. Time to meet!', text: 'Use the chat to agree on a public meeting spot. Head over, tap I’m here, and enjoy your catch-up.' },
  { icon: QrCode, title: 'Good chat? Stay connected', text: 'Show your QR code or scan theirs. Once you both confirm, they’re in your friends network.' },
]
const FAQ = [
  ['Who can I match with?', 'Friends matches existing friends, Public matches new people, and Both allows either. Both people’s choices must agree. We match the same activity in the same city, with your distance and preference filters.'],
  ['Will I always get a match?', 'A match depends on eligible people being online. You may need to wait or try again later. Passing does not guarantee another suggestion immediately.'],
  ['What happens when I pass or cancel?', 'You return to matching with your original choices while your availability is still valid. We avoid offering the same pair again for 30 minutes. Use the online toggle to stop looking.'],
  ['Why do offers appear one at a time?', 'The person who has been waiting longest gets the first offer. After they accept, the second person gets 30 seconds to respond. Your meetup is confirmed only when both accept.'],
  ['Where do we meet?', 'UpCatch does not select a venue. Once both accept, use the meetup chat to agree on a public place. Never share a private home address.'],
  ['How do I finish a meetup?', 'After both people confirm arrival and the scheduled time ends, either of you can tap We met! to close it for both. You can then rate the catch-up independently.'],
  ['How do QR friends work?', 'Open Friends in your profile to show your code or scan someone else’s. Both members confirm the connection. You can also do this outside a meetup.'],
  ['Why is location needed?', 'Location helps match people within their chosen distance. We save an approximate area, not your exact position. If access is blocked, use the location help to change browser and phone settings, then retry.'],
  ['Do I need to install the app?', 'On Android Chrome, notifications can work in the browser without installation. On iPhone or iPad, open UpCatch as a Home Screen app to enable push notifications. Notifications are optional.'],
  ['What about safety and verification?', 'Meet in public and use the safety centre to report or block someone. Email confirmation and a profile photo do not mean ID approval. After three completed meetups, approved ID review is required before further participation.'],
]
export function HowItWorksProvider({ children }: { children: ReactNode }) {
  const { state } = useUpCatch()
  const [view, setView] = useState<'quick' | 'full' | null>(null)
  const checked = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!state.live || !state.onboarded || checked.current) return
    checked.current = true
    try { if (localStorage.getItem(SEEN)) return } catch {}
    if (state.phase === 'idle') setView('quick')
  }, [state.live, state.onboarded, state.phase])
  useEffect(() => {
    if (view && dialog.current && !dialog.current.open) {
      previousFocus.current = document.activeElement as HTMLElement
      dialog.current.showModal()
    }
  }, [view])
  function close() {
    try { localStorage.setItem(SEEN, '1') } catch {}
    dialog.current?.close(); setView(null)
    previousFocus.current?.focus()
  }
  return <HelpContext.Provider value={() => setView('full')}>
    {children}
    {view && <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="how-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[2rem] border-0 bg-card p-5 text-foreground shadow-2xl backdrop:bg-foreground/50">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-bold text-primary">A little less scrolling. A little more hello.</p><h2 id="how-title" className="mt-2 font-display text-3xl font-extrabold">{view === 'quick' ? 'Your next catch-up, made simple' : 'How UpCatch works'}</h2></div>
        <button type="button" onClick={close} aria-label="Close how it works" className="press grid size-11 shrink-0 place-items-center rounded-full bg-muted"><X className="size-5" /></button>
      </div>
      <ol className="my-5 space-y-3">{STEPS.map(({ icon: Icon, title, text }, index) => <li key={title} className="flex gap-3 rounded-2xl bg-muted p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-live text-live-foreground"><Icon className="size-5" aria-hidden="true" /></span>
        <div><h3 className="font-display font-bold">{index + 1}. {title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>
      </li>)}</ol>
      {view === 'full' && <section aria-label="Frequently asked questions" className="mb-5 space-y-2"><h3 className="font-display text-xl font-bold">A few things you might wonder</h3>{FAQ.map(([question, answer]) => <details key={question} className="rounded-2xl bg-muted p-3"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}</section>}
      <PrimaryButton onClick={close} className="w-full"><HeartHandshake className="size-5" aria-hidden="true" /> {view === 'quick' ? 'Let’s find a catch-up' : 'Got it'}</PrimaryButton>
      {view === 'quick' && <button type="button" onClick={() => setView('full')} className="mt-3 min-h-11 w-full text-sm font-bold text-primary">Learn more & FAQs</button>}
    </dialog>}
  </HelpContext.Provider>
}
export function LearnMoreButton() {
  const open = useContext(HelpContext)
  return <button type="button" onClick={() => open?.()} className="press min-h-11 rounded-full bg-card px-4 text-sm font-bold text-primary">How it works · Learn more</button>
}

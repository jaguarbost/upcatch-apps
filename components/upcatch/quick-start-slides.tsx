'use client'

import { ArrowLeft, ArrowRight, Check, CircleHelp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  { image: '/onboarding/how-it-works-1.webp', alt: 'Step 1: Go live. Choose your activity and audience, then turn yourself on to find nearby people.' },
  { image: '/onboarding/how-it-works-2.webp', alt: 'Step 2: Meet and become friends. Share your friendship QR code or scan your friend’s code to stay connected.' },
  { image: '/onboarding/how-it-works-3.webp', alt: 'Step 3: Nudge for future catch-ups. Reveal and chat with a friend, nudge everyone or nudge a specific friend.' },
] as const

export function QuickStartSlides({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const [step, setStep] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const last = step === SLIDES.length - 1
  return <dialog ref={dialog} aria-label="How UpCatch works" onCancel={event => { event.preventDefault(); onClose() }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-background p-0 text-foreground">
    <div className="mx-auto flex h-full max-w-lg flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button type="button" onClick={onHelp} aria-label="Read frequently asked questions" className="press grid size-11 place-items-center rounded-full bg-card"><CircleHelp className="size-5" aria-hidden="true" /></button>
        <button type="button" autoFocus onClick={onClose} aria-label="Skip how it works" className="press grid size-11 place-items-center rounded-full bg-card"><X className="size-5" aria-hidden="true" /></button>
      </header>
      <div className="flex min-h-0 flex-1 justify-center px-2 py-2"
        onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY } }}
        onTouchEnd={event => {
          const start = touch.current
          touch.current = null
          if (!start || !event.changedTouches.length) return
          const dx = event.changedTouches[0].clientX - start.x
          const dy = event.changedTouches[0].clientY - start.y
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) setStep(current => Math.max(0, Math.min(SLIDES.length - 1, current + (dx < 0 ? 1 : -1))))
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={step} src={SLIDES[step].image} alt={SLIDES[step].alt} draggable={false} className="h-full w-full object-contain" />
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-1">
        <button type="button" disabled={step === 0} onClick={() => setStep(current => current - 1)} aria-label="Previous step" className="press grid size-12 place-items-center rounded-full bg-card disabled:opacity-30"><ArrowLeft className="size-5" aria-hidden="true" /></button>
        <nav aria-label="Walkthrough steps" className="flex gap-2">
          {SLIDES.map((slide, index) => <button key={slide.image} type="button" aria-label={`Go to step ${index + 1}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} className="press grid size-8 place-items-center rounded-full"><span className={`h-2 rounded-full ${index === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'}`} /></button>)}
        </nav>
        <button type="button" onClick={() => last ? onClose() : setStep(current => current + 1)} aria-label={last ? 'Finish how it works' : 'Next step'} className="press grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">{last ? <Check className="size-5" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />}</button>
      </footer>
    </div>
  </dialog>
}

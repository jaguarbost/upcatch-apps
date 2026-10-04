'use client'

import { BadgeCheck, Car, ChevronLeft, Footprints, X } from 'lucide-react'
import { useEffect } from 'react'
import { haptic } from '@/lib/haptics'
import { INTENTS, VENUES, intentById } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { BottomSheet, Chip, PrimaryButton } from './primitives'

const DURATIONS = [15, 30, 45, 60, 90]
const WINDOWS = [
  { v: 30, label: 'Next 30m' },
  { v: 60, label: 'Next hour' },
  { v: 120, label: 'Next 2h' },
]
const RADII = [{ v: 0.804672, label: '0.5 mi' }, { v: 1.609344, label: '1 mi' }, { v: 3.218688, label: '2 mi' }, { v: 4.828032, label: '3 mi' }]
const NOTE_IDEAS = ['Between meetings', 'New to the area', 'Talk design', 'Need a break']
const PREFS = ['Verified ID only', 'Similar age', 'Shared interests', 'Women only']

export function venuesForIntent(intent: string | null) {
  if (!intent) return VENUES
  const list = VENUES.filter((v) => v.intents.includes(intent as never))
  return list.length ? list : VENUES
}

export function CreateFlow() {
  const { state, actions } = useUpCatch()
  const step = state.createStep
  const d = state.draft

  if (step === 3) return <VenuePicker />

  return (
    <div className="uc-create-panel absolute inset-0 z-40 flex flex-col bg-background animate-in fade-in slide-in-from-bottom-10 duration-300">
      <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
        <button
          type="button"
          onClick={() => (step === 1 ? actions.closeCreate() : actions.setCreateStep(1))}
          aria-label={step === 1 ? 'Close' : 'Back'}
          className="press grid size-11 place-items-center rounded-full bg-card shadow-sm"
        >
          {step === 1 ? <X className="size-5" aria-hidden="true" /> : <ChevronLeft className="size-5" aria-hidden="true" />}
        </button>
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3].map((s) => (
            <span key={s} className={cn('h-1.5 flex-1 rounded-full', s <= step ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <span className="w-11" />
      </header>

      {step === 1 && (
        <div key="s1" className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-4 pb-8 [&>*]:shrink-0 animate-in fade-in slide-in-from-right-6 duration-300">
          <h2 className="font-display text-4xl leading-[1.05] font-extrabold text-balance">What are you up for?</h2>
          <div className="grid grid-cols-2 gap-3">
            {INTENTS.map((intent, i) => {
              const Icon = intent.icon
              const active = d.intent === intent.id
              return (
                <button
                  key={intent.id}
                  type="button"
                  onClick={() => {
                    haptic('select')
                    actions.updateDraft({ intent: intent.id })
                    window.setTimeout(() => actions.setCreateStep(2), 180)
                  }}
                  aria-pressed={active}
                  className={cn(
                    'press flex min-h-28 flex-col items-start justify-between gap-3 rounded-3xl p-4 text-left transition-colors',
                    active ? 'bg-foreground text-background' : 'bg-card',
                    i === INTENTS.length - 1 && 'col-span-2 min-h-20 flex-row items-center',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-12 place-items-center rounded-2xl',
                      active ? 'bg-live text-live-foreground' : 'bg-muted',
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className={cn(i === INTENTS.length - 1 && 'flex-1')}>
                    <span className="block font-display text-xl font-bold">{intent.label}</span>
                    <span className={cn('block text-sm', active ? 'opacity-70' : 'text-muted-foreground')}>{intent.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div key="s2" className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-4 pb-6 [&>*]:shrink-0 animate-in fade-in slide-in-from-right-6 duration-300">
            <div className="flex items-center gap-3">
              <IntentBadge />
              <h2 className="font-display text-3xl leading-tight font-extrabold">A few details</h2>
            </div>

            <Field label="Say something (optional)">
              <input
                value={d.note}
                onChange={(e) => actions.updateDraft({ note: e.target.value })}
                maxLength={60}
                placeholder="e.g. 30 mins before my next call"
                className="h-14 rounded-2xl bg-card px-4 text-base outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {NOTE_IDEAS.map((n) => (
                  <Chip key={n} active={d.note === n} onClick={() => actions.updateDraft({ note: n })}>
                    {n}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="How long?">
              <Segmented
                options={DURATIONS.map((v) => ({ v, label: `${v}m` }))}
                value={d.durationMin}
                onChange={(v) => actions.updateDraft({ durationMin: v })}
              />
            </Field>

            <Field label="When are you free?">
              <Segmented options={WINDOWS} value={d.windowMin} onChange={(v) => actions.updateDraft({ windowMin: v })} />
            </Field>

            <Field label="How far will you go?">
              <Segmented
                options={RADII}
                value={d.radiusKm}
                onChange={(v) => actions.updateDraft({ radiusKm: v })}
              />
            </Field>

            <Field label="Preferences (optional)">
              <div className="flex flex-wrap gap-2">
                {[...PREFS, ...state.user.interests.slice(0, 3)].map((p) => (
                  <Chip
                    key={p}
                    active={d.prefs.includes(p)}
                    onClick={() =>
                      actions.updateDraft({
                        prefs: d.prefs.includes(p) ? d.prefs.filter((x) => x !== p) : [...d.prefs, p],
                      })
                    }
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
          <footer className="border-t border-border bg-card px-5 pt-3 pb-safe">
            <PrimaryButton onClick={() => state.live ? actions.publish() : actions.setCreateStep(3)} className="mb-3 w-full">
              {state.live ? 'Go online' : 'Pick a venue'}
            </PrimaryButton>
          </footer>
        </>
      )}
    </div>
  )
}

function IntentBadge() {
  const { state } = useUpCatch()
  const intent = intentById(state.draft.intent ?? 'coffee')
  const Icon = intent.icon
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-live text-live-foreground" aria-label={intent.label}>
      <Icon className="size-6" aria-hidden="true" />
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Segmented<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-muted p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => {
            haptic('select')
            onChange(o.v)
          }}
          className={cn(
            'press min-h-12 flex-1 rounded-xl text-sm font-bold transition-colors',
            value === o.v ? 'bg-card shadow-sm' : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function VenuePicker() {
  const { state, actions } = useUpCatch()
  const venues = state.liveVenues ?? venuesForIntent(state.draft.intent)
  const selected = state.draft.venueId

  useEffect(() => {
    if (!selected || !venues.some((v) => v.id === selected)) actions.updateDraft({ venueId: venues[0]?.id ?? null })
  }, [selected, venues, actions])

  useEffect(() => {
    if (!selected) return
    document.getElementById(`venue-card-${selected}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selected])

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <header className="pointer-events-auto absolute inset-x-4 top-[max(env(safe-area-inset-top),1rem)] flex items-center gap-3 rounded-3xl bg-card p-2 pr-4 shadow-xl animate-in fade-in slide-in-from-top-4">
        <button
          type="button"
          onClick={() => actions.setCreateStep(2)}
          aria-label="Back"
          className="press grid size-11 place-items-center rounded-full bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-extrabold">Pick a public spot</p>
          <p className="text-sm text-muted-foreground">{state.live ? 'Choose a public venue for your meetup' : 'Tap the map or a card · verified venues only'}</p>
        </div>
      </header>

      <div className="absolute inset-x-0 bottom-0">
        <BottomSheet className="pb-safe">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-3 pb-3 no-scrollbar" role="radiogroup" aria-label="Venues">
            {venues.map((v) => {
              const active = v.id === selected
              return (
                <button
                  key={v.id}
                  id={`venue-card-${v.id}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    haptic('select')
                    actions.updateDraft({ venueId: v.id })
                  }}
                  className={cn(
                    'press flex w-60 shrink-0 snap-center flex-col overflow-hidden rounded-3xl border-2 text-left transition-colors',
                    active ? 'border-primary' : 'border-transparent bg-muted',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.image || '/placeholder.svg'} alt="" className="h-24 w-full object-cover" />
                  <div className="flex flex-col gap-1 p-3">
                    <p className="flex items-center gap-1 truncate font-display font-bold">
                      {v.name}
                      {v.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified venue" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.kindLabel} · {v.safety}
                    </p>
                    <p className="flex items-center gap-3 text-sm font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <Footprints className="size-3.5" aria-hidden="true" /> {state.live ? '—' : v.walkMin+' min'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Car className="size-3.5" aria-hidden="true" /> {state.live ? '—' : v.driveMin+' min'}
                      </span>
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-4 pb-3">
            <PrimaryButton onClick={actions.publish} disabled={!selected} className="w-full text-xl">
              Create UpCatch
            </PrimaryButton>
          </div>
        </BottomSheet>
      </div>
    </div>
  )
}

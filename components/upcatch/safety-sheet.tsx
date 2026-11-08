'use client'

import { Ban, Flag, PhoneCall, Share2, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useUpCatch } from './app-provider'
import { BottomSheet, Chip, PrimaryButton, Switch } from './primitives'

export type SheetKind = 'safety' | 'cancel' | 'report'

const CANCEL_REASONS = ['Running late', 'Plans changed', 'Feeling unsure', 'Other']
const REPORT_REASONS = ['Didn’t show up', 'Made me uncomfortable', 'Fake profile', 'Inappropriate messages', 'Other']

export function SafetySheet({ kind, onClose, partnerName }: { kind: SheetKind; onClose: () => void; partnerName: string }) {
  const { state, actions } = useUpCatch()
  const [view, setView] = useState<SheetKind>(kind)
  const [reason, setReason] = useState<string | null>(null)
  const [sharing, setSharing] = useState(true)

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-foreground/40 animate-in fade-in duration-200">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <BottomSheet className="pb-safe">
        <div className="flex items-center justify-between px-5 pt-3">
          <h2 className="font-display text-2xl font-extrabold">
            {view === 'safety' ? 'Safety centre' : view === 'cancel' ? 'Cancel this UpCatch?' : `Report ${partnerName}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="press grid size-11 place-items-center rounded-full bg-muted">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {view === 'safety' && (
          <div className="flex flex-col gap-3 px-5 pt-4 pb-6">
            <p className="flex items-start gap-2 rounded-2xl bg-primary/10 p-3 text-sm leading-relaxed text-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Your location is never shared with other members. {partnerName} only sees your arrival confirmation and the public venue you agree on.
            </p>
            <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
              <Share2 className="size-5" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">Share status with trusted contact</p>
                <p className="text-sm text-muted-foreground">{state.live ? (state.trustedEmail??'Add a trusted contact email') : 'Jess sees venue + who you’re meeting'}</p>
              </div>
              <Switch checked={state.live ? Boolean(state.memberSettings.share) : sharing} onChange={v=>{if(!state.live){setSharing(v);return}if(v&&!state.trustedEmail){const email=window.prompt('Trusted contact email');if(email)actions.setTrustedContact(email)}else actions.saveSetting('share',v)}} label="Share with trusted contact" />
            </div>
            <a
              href="tel:999"
              className="press flex h-16 items-center justify-center gap-2 rounded-2xl bg-destructive font-display text-lg font-bold text-destructive-foreground"
            >
              <PhoneCall className="size-5" aria-hidden="true" /> Call emergency services
            </a>
            <div className="grid grid-cols-2 gap-2">
              <PrimaryButton variant="soft" onClick={() => setView('report')} className="h-14 text-base">
                <Flag className="size-4" aria-hidden="true" /> Report
              </PrimaryButton>
              <PrimaryButton
                variant="soft"
                onClick={() => {
                  onClose()
                  state.live ? actions.reportMeetup('Blocked by member',true) : actions.cancelMeetup(`${partnerName} blocked. You’re safe to leave.`)
                }}
                className="h-14 text-base"
              >
                <Ban className="size-4" aria-hidden="true" /> Block & leave
              </PrimaryButton>
            </div>
          </div>
        )}

        {(view === 'cancel' || view === 'report') && (
          <div className="flex flex-col gap-4 px-5 pt-4 pb-6">
            <p className="text-sm text-muted-foreground">
              {view === 'cancel'
                ? 'Cancelling after pairing will lower your show-up score. Repeated cancellations may limit future meetups on UpCatch. Your partner will see that this meetup was cancelled.'
                : state.live ? 'Reports are private and saved for review.' : 'Reports are private and reviewed by our safety team within minutes.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {(view === 'cancel' ? CANCEL_REASONS : REPORT_REASONS).map((r) => (
                <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <PrimaryButton
              variant={view === 'report' ? 'ink' : 'danger'}
              disabled={view==='report' && !reason}
              onClick={() => {
                onClose()
                if(state.live && view==='report'){actions.reportMeetup(reason??'Other');return}
                actions.cancelMeetup(
                  view === 'report' ? 'Report sent. Our team is on it — thanks for keeping UpCatch safe.' : undefined,
                )
              }}
              className="w-full"
            >
              {view === 'cancel' ? 'Cancel UpCatch' : 'Send report & leave'}
            </PrimaryButton>
            {view === 'cancel' && <button type="button" onClick={onClose} className="press min-h-12 w-full rounded-2xl bg-muted text-sm font-bold">Keep meetup</button>}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

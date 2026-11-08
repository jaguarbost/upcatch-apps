'use client'

export function CancellationWarning({ onKeep, onCancel, paired = true }: { onKeep: () => void; onCancel: () => void; paired?: boolean }) {
  return <div className="absolute inset-0 z-[80] grid place-items-center bg-foreground/55 p-5" role="presentation" onClick={onKeep}>
    <div role="dialog" aria-modal="true" aria-labelledby="cancel-warning-title" className="w-full max-w-sm rounded-3xl bg-card p-6 text-foreground shadow-2xl" onClick={event => event.stopPropagation()}>
      <h2 id="cancel-warning-title" className="font-display text-2xl font-extrabold">Cancel this meetup?</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{paired
        ? 'Cancelling after pairing will lower your show-up score. Repeated cancellations may limit future meetups on UpCatch.'
        : 'This invite has not been paired yet. Removing it will take it off the Wall.'}</p>
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" onClick={onKeep} className="press min-h-12 rounded-2xl bg-muted font-bold">Keep meetup</button>
        <button type="button" onClick={onCancel} className="press min-h-12 rounded-2xl bg-destructive font-bold text-destructive-foreground">Go ahead and cancel</button>
      </div>
    </div>
  </div>
}

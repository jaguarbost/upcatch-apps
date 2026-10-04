'use client'

import { BadgeCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

export function PersonAvatar({
  photo,
  initials,
  size = 56,
  ring = false,
  className,
}: {
  photo?: string | null
  initials: string
  size?: number
  ring?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo || '/placeholder.svg'}
          alt=""
          className={cn(
            'size-full rounded-full object-cover',
            ring && 'ring-4 ring-live ring-offset-2 ring-offset-card',
          )}
        />
      ) : (
        <div className="grid size-full place-items-center rounded-full bg-muted font-display text-lg font-bold">
          {initials}
        </div>
      )}
      <span
        className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-card bg-foreground px-1.5 font-display text-[10px] font-bold leading-4 text-background"
        aria-hidden="true"
      >
        {initials}
      </span>
    </div>
  )
}

export function Verified({ label = 'Verified', className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary',
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}

export function Chip({
  children,
  active,
  onClick,
  className,
  highlight,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  highlight?: boolean
}) {
  const base = cn(
    'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold',
    highlight
      ? 'bg-live/30 text-foreground'
      : active
        ? 'bg-foreground text-background'
        : 'bg-muted text-foreground',
    className,
  )
  if (!onClick) return <span className={base}>{children}</span>
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        haptic('select')
        onClick()
      }}
      className={cn(base, 'press min-h-11')}
    >
      {children}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  size = 'md',
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  size?: 'md' | 'lg'
  disabled?: boolean
}) {
  const lg = size === 'lg'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic(checked ? 'tap' : 'success')
        onChange(!checked)
      }}
      className={cn(
        'press relative shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60',
        lg ? 'h-12 w-22' : 'h-8 w-14',
        checked ? (lg ? 'bg-live' : 'bg-primary') : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 rounded-full bg-card shadow-md transition-transform duration-300 ease-out',
          lg ? 'size-10' : 'size-6',
          checked && (lg ? 'translate-x-10' : 'translate-x-6'),
        )}
      />
    </button>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('uc-skeleton rounded-xl', className)} aria-hidden="true" />
}

export function LiveDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-1', className)} aria-hidden="true">
      <span className="uc-dot size-1.5 rounded-full bg-current" />
      <span className="uc-dot size-1.5 rounded-full bg-current" />
      <span className="uc-dot size-1.5 rounded-full bg-current" />
    </span>
  )
}

export function CountdownRing({
  fraction,
  seconds,
  size = 48,
}: {
  fraction: number
  seconds: number
  size?: number
}) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={fraction < 0.3 ? 'var(--destructive)' : 'var(--primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 100ms linear' }}
        />
      </svg>
      <span className="absolute font-display text-sm font-bold tabular-nums">
        {seconds}
        <span className="sr-only"> seconds left</span>
      </span>
    </div>
  )
}

export function BottomSheet({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'pointer-events-auto rounded-t-[2rem] bg-card shadow-[0_-12px_40px_-12px_rgb(14_23_38/0.25)] animate-in slide-in-from-bottom-8 fade-in duration-300',
        className,
      )}
    >
      <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
      {children}
    </section>
  )
}

export function PrimaryButton({
  children,
  onClick,
  className,
  disabled,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  variant?: 'primary' | 'live' | 'ink' | 'soft' | 'danger'
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
    live: 'bg-live text-live-foreground shadow-lg shadow-live/40',
    ink: 'bg-foreground text-background',
    soft: 'bg-muted text-foreground',
    danger: 'bg-destructive/10 text-destructive',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => {
        haptic(variant === 'danger' ? 'warning' : 'tap')
        onClick?.()
      }}
      className={cn(
        'press flex h-16 items-center justify-center gap-2 rounded-2xl px-6 font-display text-lg font-bold disabled:opacity-40 disabled:shadow-none',
        styles,
        className,
      )}
    >
      {children}
    </button>
  )
}

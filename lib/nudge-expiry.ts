export const NUDGE_WINDOW_MS = 30 * 60 * 1000

export function nudgeTimeLeft(createdAt: string, now: number) {
  const created = Date.parse(createdAt)
  return Number.isFinite(created) ? Math.max(0, Math.min(NUDGE_WINDOW_MS, created + NUDGE_WINDOW_MS - now)) : 0
}

export function nudgeTimerLabel(left: number) {
  const seconds = Math.max(0, Math.ceil(left / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

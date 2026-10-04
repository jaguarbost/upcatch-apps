type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'incoming'

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 12,
  success: [14, 40, 22],
  warning: [30, 50, 30],
  incoming: [20, 60, 20, 60, 40],
}

export function haptic(kind: HapticKind = 'tap') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(PATTERNS[kind])
    } catch {
      // Some browsers throw when vibration is blocked; the visual press cue still fires.
    }
  }
}

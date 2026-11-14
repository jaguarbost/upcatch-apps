export type AppearanceMode = 'auto' | 'on' | 'off'
export const APPEARANCE_STORAGE_KEY = 'upcatch:night-mode'

export function readAppearanceMode(storage: Pick<Storage, 'getItem'>): AppearanceMode {
  try {
    const saved = storage.getItem(APPEARANCE_STORAGE_KEY)
    if (saved === 'on' || saved === 'off' || saved === 'auto') return saved
  } catch {}
  return 'auto'
}

export function isNightAppearance(mode: AppearanceMode, systemDark: boolean) {
  return mode === 'on' || (mode === 'auto' && systemDark)
}

'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import styles from './appearance.module.css'
import { APPEARANCE_STORAGE_KEY, isNightAppearance, readAppearanceMode, type AppearanceMode } from '@/lib/appearance-preference'

const AppearanceContext = createContext({ night: false, mode: 'auto' as AppearanceMode, setMode: (_mode: AppearanceMode) => {} })

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<AppearanceMode>('auto')
  const [systemDark, setSystemDark] = useState(false)
  useEffect(() => {
    try { updateMode(readAppearanceMode(window.localStorage)) } catch {}
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const updateSystem = () => setSystemDark(media.matches)
    media.addEventListener('change', updateSystem)
    document.addEventListener('visibilitychange', updateSystem)
    window.addEventListener('focus', updateSystem)
    window.addEventListener('upcatch:appearance-resume', updateSystem)
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
        try { updateMode(readAppearanceMode(window.localStorage)) } catch {}
      }
    }
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('storage', sync)
      media.removeEventListener('change', updateSystem)
      document.removeEventListener('visibilitychange', updateSystem)
      window.removeEventListener('focus', updateSystem)
      window.removeEventListener('upcatch:appearance-resume', updateSystem)
    }
  }, [])
  const night = isNightAppearance(mode, systemDark)
  const setMode = (next: AppearanceMode) => {
    updateMode(next)
    try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next) } catch {}
  }
  return <AppearanceContext.Provider value={{ night, mode, setMode }}>
    <div className={night ? `contents dark ${styles.night}` : 'contents'}>{children}</div>
  </AppearanceContext.Provider>
}

export const useAppearance = () => useContext(AppearanceContext)

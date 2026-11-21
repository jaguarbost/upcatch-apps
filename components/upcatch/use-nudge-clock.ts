'use client'

import { useEffect, useState } from 'react'

export function useNudgeClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    window.addEventListener('upcatch:native-resume', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      window.removeEventListener('upcatch:native-resume', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

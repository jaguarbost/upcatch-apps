'use client'

import { useEffect, useRef, useState } from 'react'

export function useQrCamera(onCode: (value: string) => Promise<boolean>) {
  const video = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (attempt === 0) return
    let cancelled = false
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    setError(null)
    const stop = () => stream?.getTracks().forEach(track => track.stop())
    const start = async () => {
      try {
        if (!window.isSecureContext) throw new Error('Open UpCatch over HTTPS to use your camera.')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a camera. Try your phone’s browser.')
        if (cancelled) return
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
        if (cancelled || !video.current) { stop(); return }
        video.current.srcObject = stream
        await video.current.play()
        const decoder = (await import('jsqr')).default
        if (cancelled) { stop(); return }
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Camera scanning is unavailable in this browser.')
        let lastCode = ''
        let lastSeen = 0
        const scan = async () => {
          if (cancelled) return
          const player = video.current
          if (player && player.readyState >= 2 && player.videoWidth && player.videoHeight) {
            canvas.width = Math.min(player.videoWidth, 640)
            canvas.height = Math.round(player.videoHeight * canvas.width / player.videoWidth)
            context.drawImage(player, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
            const code = decoder(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
            if (code && (code.data !== lastCode || Date.now() - lastSeen > 5000)) {
              lastCode = code.data
              lastSeen = Date.now()
              if (await onCodeRef.current(code.data)) { stop(); return }
            }
          }
          if (!cancelled) timer = setTimeout(() => { void scan().catch(fail) }, 180)
        }
        void scan().catch(fail)
      } catch (cause) { fail(cause) }
    }
    function fail(cause: unknown) {
      stop()
      if (cancelled) return
      const name = cause instanceof Error ? cause.name : ''
      setError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, then retry.'
        : name === 'NotFoundError' ? 'No camera was found on this device.'
        : name === 'NotReadableError' ? 'Your camera is in use. Close other camera apps, then retry.'
        : cause instanceof Error ? cause.message : 'Unable to open your camera. Please retry.')
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') { cancelled = true; stop(); if (timer) clearTimeout(timer) }
      else setAttempt(value => value + 1)
    }
    document.addEventListener('visibilitychange', visibility)
    void start()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      stop()
      if (video.current) video.current.srcObject = null
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [attempt])

  return { video, error, requested: attempt > 0, retry: () => setAttempt(value => value + 1) }
}

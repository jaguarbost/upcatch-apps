'use client'

import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { useUpCatch } from './app-provider'
import { PrimaryButton } from './primitives'

const inviteUrl = 'https://www.upcatch.uk'
const inviteText = 'Join me on UpCatch! Meet new people for coffee, walks and more.'

export function InviteFriendsButton({ className }: { className?: string }) {
  const { actions } = useUpCatch()
  const [busy, setBusy] = useState(false)

  async function invite() {
    if (busy) return
    setBusy(true)
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await Share.share({ title: 'UpCatch', text: inviteText, url: inviteUrl })
          return
        } catch (error) {
          if (error instanceof Error && /cancel|abort/i.test(error.message)) return
        }
      }
      if (navigator.share) {
        try {
          await navigator.share({ title: 'UpCatch', text: inviteText, url: inviteUrl })
          return
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
        }
      }
      try {
        await navigator.clipboard.writeText(`${inviteText} ${inviteUrl}`)
        actions.showToast('Invite link copied. Share it with your friends!')
      } catch {
        window.prompt('Copy this link to invite friends to UpCatch:', inviteUrl)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <PrimaryButton variant="soft" onClick={() => void invite()} disabled={busy} className={className}>
      <Share2 className="size-5 shrink-0" aria-hidden="true" />
      Invite friends to UpCatch
    </PrimaryButton>
  )
}

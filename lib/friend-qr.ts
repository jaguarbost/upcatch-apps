export const FRIEND_QR_PREFIX = 'upcatch:friend:'

export function friendQrValue(token: string): string {
  return FRIEND_QR_PREFIX + token
}

export function parseFriendQr(value: string): string | null {
  const match = /^upcatch:friend:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value.trim())
  return match?.[1].toLowerCase() ?? null
}

export type QrFriend = { id: string; name: string; photo_path: string | null; since?: string }
export type QrFriendRequest = { id: string; incoming: boolean; person_id: string; name: string; photo_path: string | null }
export type QrFriendState = {
  code: { token: string; expires_at: string } | null
  person: QrFriend | null
  scanned_id: string | null
  request_id: string | null
  friends: QrFriend[]
  requests: QrFriendRequest[]
}

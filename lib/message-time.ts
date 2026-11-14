// A missing server timestamp stays missing; never substitute the device clock.
export function persistedMessageDate(createdAt?: string | null) {
  if (!createdAt) return null
  const date = new Date(createdAt)
  return Number.isFinite(date.getTime()) ? date : null
}

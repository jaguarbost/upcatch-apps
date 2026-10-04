// Expiring offers must not sit in a push provider's offline queue after their deadline.
export function pushTTL(expiresAt?: string, now=Date.now()): number {
  if(!expiresAt)return 3600
  const deadline=Date.parse(expiresAt)
  if(!Number.isFinite(deadline))return 0
  return Math.max(0,Math.min(3600,Math.floor((deadline-now)/1000)))
}

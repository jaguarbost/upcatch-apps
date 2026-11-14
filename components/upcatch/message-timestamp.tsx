import { persistedMessageDate } from '@/lib/message-time'

export function MessageTimestamp({ createdAt, mine }: { createdAt?: string; mine: boolean }) {
  const date = persistedMessageDate(createdAt)
  if (!date) return null
  return <time dateTime={date.toISOString()} title={date.toLocaleString()} className={`mt-1 block text-right text-[10px] leading-tight ${mine ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
    {date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </time>
}

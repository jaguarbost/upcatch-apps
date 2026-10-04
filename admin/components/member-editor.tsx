'use client'
import { useActionState } from 'react'
import { updateEntitlement } from '../server/actions'
import type { Member } from '../types'
import styles from '../styles.module.css'

export function MemberEditor({ member }: { member: Member }) {
  const [state, action, pending] = useActionState(updateEntitlement, {})
  return <details className={styles.editor}>
    <summary>Manage allowance &amp; subscription</summary>
    <form action={action} className={styles.form}>
      <input type="hidden" name="userId" value={member.id} />
      <input type="hidden" name="version" value={member.entitlement_version} />
      <label>Additional meetups available
        <input name="remaining" type="number" min="0" max="100000" step="1" defaultValue={member.remaining ?? ''} placeholder="Unlimited" />
      </label>
      <p className={styles.note}>Leave blank for unlimited. Existing reservations stay valid. ID approval is still required after three completed meetups.</p>
      <label>Subscription status
        <select name="subscription" defaultValue={member.subscription_status}>
          <option value="free">Free</option><option value="active">Active</option>
          <option value="paused">Paused</option><option value="cancelled">Cancelled</option>
        </select>
      </label>
      <p className={styles.note}>Manually recorded status. Set the meetup allowance separately.</p>
      <label>Reason for change
        <textarea name="reason" required minLength={3} maxLength={500} rows={2} placeholder="Why are you making this change?" />
      </label>
      <button className={styles.button} type="submit" disabled={pending}>{pending ? 'Saving?' : 'Save changes'}</button>
      {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  </details>
}

import { notFound } from 'next/navigation'
import { adminSession } from './server/client'
import { MemberEditor } from './components/member-editor'
import { ADMIN_PATH } from './config'
import type { Dashboard, EmailPreview } from './types'
import styles from './styles.module.css'

const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))
export async function AdminPage({ search, page, emailPreviews, loginUrl }: {
  search: string; page: number; emailPreviews: EmailPreview[]; loginUrl: string
}) {
  const { client, user } = await adminSession()
  if (!user) return <main className={styles.root}><section className={styles.card}>
    <p className={styles.eyebrow}>UPCATCH OPERATIONS</p><h1>Admin sign-in</h1>
    <p>Sign in with your approved UpCatch account, then return to this address.</p>
    <a className={styles.button} href={loginUrl}>Sign in</a>
  </section></main>
  const { data, error } = await client.rpc('admin_dashboard', { p_search: search, p_page: page })
  if (error?.code === '42501') notFound()
  if (error || !data) throw new Error('Admin data is unavailable. Check the admin database migration.')
  const dashboard = data as Dashboard
  const stats = [
    ['Members', dashboard.stats.members], ['Online now', dashboard.stats.online],
    ['All meetups', dashboard.stats.meetups], ['Completed', dashboard.stats.completed],
    ['Active subscriptions', dashboard.stats.active_subscriptions],
    ['Emails queued', dashboard.stats.pending_emails], ['Emails needing review', dashboard.stats.failed_emails],
  ] as const
  const pageLink = (index: number) => ADMIN_PATH + '?q=' + encodeURIComponent(search) + '&page=' + index + '#members'
  return <main className={styles.root}>
    <header className={styles.header}><div><p className={styles.eyebrow}>UPCATCH OPERATIONS</p><h1>A little behind the hellos.</h1><p>Members, meetups and the numbers that matter.</p></div><a className={styles.button} href={pageLink(page)}>Refresh data</a></header>
    <nav className={styles.nav} aria-label="Admin sections"><a href="#members">Members</a><a href="#online">Online now</a><a href="#meetups">Meetups</a><a href="#emails">Emails</a><a href="#changes">Recent changes</a></nav>
    <div className={styles.stats}>{stats.map(([label, value]) => <article className={styles.stat} key={label}><p>{label}</p><strong>{value.toLocaleString('en-GB')}</strong></article>)}</div>
    <section id="members" className={styles.card}><h2>Members</h2>
      <form method="get" action={ADMIN_PATH} className={styles.search}><label htmlFor="member-search">Find by name, email or user ID</label><div><input id="member-search" name="q" maxLength={100} defaultValue={search} placeholder="Search members" /><button className={styles.button}>Search</button></div></form>
      <p className={styles.note}>{dashboard.member_count} matching members ? 25 per page</p>
      <div className={styles.memberGrid}>{dashboard.members.map(member => <article key={member.id} className={styles.member}>
        <h3>{member.display_name || 'Onboarding in progress'}</h3><p>{member.email}</p><p className={styles.note}>{member.city || 'City not set'} ? {member.subscription_status}</p>
        <dl className={styles.facts}><div><dt>Completed</dt><dd>{member.completed_meetups}</dd></div><div><dt>Reserved</dt><dd>{member.reserved_meetups}</dd></div><div><dt>Available</dt><dd>{member.remaining ?? 'Unlimited'}</dd></div></dl>
        <p className={styles.note}>ID: {member.id_status.replaceAll('_', ' ')}<br /><span className={styles.id}>{member.id}</span></p>
        <MemberEditor key={member.entitlement_version} member={member} />
      </article>)}</div>
      {!dashboard.members.length && <p>No members match this search.</p>}
      <div className={styles.pagination}>{page > 0 && <a href={pageLink(page - 1)}>? Previous</a>}<span>Page {page + 1}</span>{(page + 1) * 25 < dashboard.member_count && <a href={pageLink(page + 1)}>Next ?</a>}</div>
    </section>
    <section id="online" className={styles.card}><h2>Online now</h2><p className={styles.note}>Members waiting for a match or in an active confirmed meetup. Latest snapshot; refresh to update. Up to 100 shown.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Member</th><th>City</th><th>Status</th><th>Since (UK)</th></tr></thead><tbody>{dashboard.online.map(member => <tr key={member.id}><td>{member.display_name}</td><td>{member.city}</td><td><span className={styles.chip}>{member.state}</span></td><td>{date(member.since)}</td></tr>)}</tbody></table></div>
      {!dashboard.online.length && <p>No members are online right now.</p>}
    </section>
    <section id="meetups" className={styles.card}><h2>Recent meetups</h2><p className={styles.note}>Latest 50 meetups across all cities. Times shown in UK time.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Members</th><th>City / venue</th><th>Status</th><th>Type</th><th>Start</th></tr></thead><tbody>{dashboard.meetups.map(meetup => <tr key={meetup.id}><td>{meetup.members || 'No participants'}<small className={styles.id}>{meetup.id}</small></td><td>{meetup.city}<small>{meetup.venue || 'Choose together'}</small></td><td><span className={styles.chip}>{meetup.status}</span></td><td>{meetup.creation_type}</td><td>{date(meetup.starts_at)}</td></tr>)}</tbody></table></div>
      {!dashboard.meetups.length && <p>No meetups yet.</p>}
    </section>
    <section id="emails" className={styles.card}><h2>A hello in their inbox.</h2><p>Welcome and pairing emails from UpCatch &lt;hello@upcatch.co.uk&gt;.</p><p className={styles.note}>Sample previews. Actual delivery uses each member?s meetup details.</p>
      <div className={styles.previews}>{emailPreviews.map(email => <article key={email.name}><h3>{email.name}</h3><p className={styles.note}>{email.subject}</p><iframe title={email.name + ' email preview'} srcDoc={email.html} sandbox="" referrerPolicy="no-referrer" /></article>)}</div>
    </section>
    <section id="changes" className={styles.card}><h2>Recent admin changes</h2><p className={styles.note}>Latest 20 changes, with the operator and reason recorded.</p>
      {dashboard.audit.map(entry => <article className={styles.audit} key={entry.id}><strong>{entry.display_name || entry.user_id}</strong><p>{entry.reason}</p><p className={styles.note}>{entry.after_value.subscription_status} ? Total allowance: {entry.after_value.meetup_limit ?? 'unlimited'} ? {entry.actor} ? {date(entry.created_at)}</p></article>)}
      {!dashboard.audit.length && <p>No admin changes yet.</p>}
    </section>
  </main>
}

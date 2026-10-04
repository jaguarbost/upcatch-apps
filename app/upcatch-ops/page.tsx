import type { Metadata } from 'next'
import { AdminPage } from '@/admin/page'
import { notificationEmail } from '@/lib/email/templates'
import { siteUrl } from '@/lib/server/member'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'UpCatch Operations', robots: { index: false, follow: false } }

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams
  const search = (typeof params.q === 'string' ? params.q : '').slice(0, 100)
  const requestedPage = Number(params.page ?? 0)
  const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 100000 ? requestedPage : 0
  const origin = siteUrl()
  return <AdminPage search={search} page={page} loginUrl="/auth/login" emailPreviews={[
    { name: 'Welcome', ...notificationEmail('welcome_email', origin) },
    { name: 'Paired up', ...notificationEmail('paired_email', origin, { partner_name: 'Alex' }) },
  ]} />
}

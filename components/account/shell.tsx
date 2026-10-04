import Link from 'next/link'
import type { ReactNode } from 'react'
export function AccountShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <main className="min-h-dvh bg-background px-5 py-10 sm:py-16">
    <div className="mx-auto max-w-[440px]">
      <Link href="/start" className="font-display text-2xl font-extrabold"><span className="text-live">Up</span><span className="text-primary">Catch</span><span className="text-foreground">.</span></Link>
      <h1 className="mt-10 font-display text-3xl font-extrabold">{title}</h1>
      {description && <p className="mt-3 leading-relaxed text-muted-foreground">{description}</p>}
      <div className="mt-8 space-y-6">{children}</div>
      <nav aria-label="Legal" className="mt-8 flex gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="underline">Privacy notice</Link>
        <Link href="/terms" className="underline">Terms of use</Link>
      </nav>
    </div>
  </main>
}

'use client'
export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl p-8"><h1 className="font-display text-2xl font-bold">Admin is temporarily unavailable</h1><p className="my-4">Try again shortly. If this continues, check the admin database migration and authentication configuration.</p><button onClick={reset} className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Try again</button></main>
}

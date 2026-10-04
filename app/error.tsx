'use client'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-dvh place-content-center gap-4 p-6 text-center">
    <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
    <p>We couldn't load your account. Please try again shortly.</p>
    <button onClick={reset} className="rounded-xl bg-primary p-3 text-primary-foreground">Try again</button>
  </main>
}

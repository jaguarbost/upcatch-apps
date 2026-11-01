import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, options?: { loading?: () => ReactNode }) {
  const Component = lazy(loader)
  return function DynamicComponent(props: P) {
    return <Suspense fallback={options?.loading?.() ?? null}><Component {...props} /></Suspense>
  }
}

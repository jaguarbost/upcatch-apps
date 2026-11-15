import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { Browser } from '@capacitor/browser'
import { nativePublicConfig } from './config'

export default function Link({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!href.startsWith('/')) return
    event.preventDefault()
    if (href === '/terms' || href === '/privacy') {
      void Browser.open({ url: `${nativePublicConfig.apiBaseUrl}${href}` }).catch(() => {
        window.alert('Could not open this page. Please try again.')
      })
      return
    }
    window.history.pushState(null, '', href)
    window.dispatchEvent(new Event('upcatch:navigate'))
  }
  return <a href={href} onClick={click} {...props}>{children}</a>
}

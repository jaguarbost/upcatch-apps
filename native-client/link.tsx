import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'

export default function Link({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!href.startsWith('/')) return
    event.preventDefault()
    window.history.pushState(null, '', href)
    window.dispatchEvent(new Event('upcatch:navigate'))
  }
  return <a href={href} onClick={click} {...props}>{children}</a>
}

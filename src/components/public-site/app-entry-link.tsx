import type { AnchorHTMLAttributes } from 'react'

/**
 * Links from the public site into the app must load a new document: the root
 * layout picks the public layout or the app shell per request, and client-side
 * navigation would keep the public layout around app routes.
 */
export function AppEntryLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-app-entry {...props} />
}

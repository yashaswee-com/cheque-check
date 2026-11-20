import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function SentryExampleLayout({
  children,
}: {
  children: React.ReactNode
  params: Promise<Record<string, never>>
}) {
  return children
}

import type { Metadata } from 'next'

export const SITE_NAME = 'Cheque Check'
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chequecheck.com'
).replace(/\/+$/, '')

export function publicPageMetadata({
  path,
  title,
  description,
}: {
  path: string
  title: string
  description: string
}): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      url: path,
      siteName: SITE_NAME,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export function jsonLdScript(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

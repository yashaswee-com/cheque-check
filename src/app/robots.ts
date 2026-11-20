import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const isNonProduction =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'qa'

  if (isNonProduction) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/accounts',
        '/businesses',
        '/cheques',
        '/drafts',
        '/features/catalog',
        '/feedback',
        '/forgot-password',
        '/login',
        '/notifications',
        '/onboarding',
        '/parties',
        '/premium',
        '/profile',
        '/referrals',
        '/reports',
        '/settings',
        '/signup',
        '/sentry-example-page',
        '/tags',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}

import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

const PUBLIC_ROUTES = [
  { path: '/', priority: 1 },
  { path: '/features', priority: 0.8 },
  { path: '/pricing', priority: 0.8 },
  { path: '/cheque-bounce', priority: 0.9 },
  { path: '/contact', priority: 0.6 },
  { path: '/privacy', priority: 0.3 },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === '/cheque-bounce' ? 'monthly' : 'weekly',
    priority,
  }))
}

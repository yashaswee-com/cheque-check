import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'
import { listArticles } from '@/features/articles/repository'

const PUBLIC_ROUTES = [
  { path: '/', priority: 1 },
  { path: '/features', priority: 0.8 },
  { path: '/pricing', priority: 0.8 },
  { path: '/cheque-bounce', priority: 0.9 },
  { path: '/contact', priority: 0.6 },
  { path: '/privacy', priority: 0.3 },
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_ROUTES.map(
    ({ path, priority }) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency:
        path === '/cheque-bounce' ? ('monthly' as const) : ('weekly' as const),
      priority,
    }),
  )
  const articles = await listArticles()
  const articleLocales = [...new Set(articles.map(({ locale }) => locale))]
  return [
    ...staticRoutes,
    ...articleLocales.map((locale) => ({
      url: `${SITE_URL}/${locale}/articles`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...articles.map((article) => ({
      url: `${SITE_URL}${article.href}`,
      lastModified: article.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}

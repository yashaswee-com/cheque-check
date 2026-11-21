export const ARTICLE_LOCALES = ['en', 'hi', 'hi-en'] as const

export type ArticleLocale = (typeof ARTICLE_LOCALES)[number]
export type ArticleStatus = 'draft' | 'published' | 'archived'
export type ArticleReviewStatus =
  'not-reviewed' | 'needs-review' | 'editorial-reviewed' | 'legal-reviewed'

export type ArticleFrontmatter = {
  id: string
  translationKey: string
  locale: ArticleLocale
  status: ArticleStatus
  category: string
  slug: string
  title: string
  description: string
  publishedAt: string
  updatedAt: string
  author: string
  reviewStatus: ArticleReviewStatus
}

export type ArticleSummary = ArticleFrontmatter & {
  href: string
  readingMinutes: number
}

export type Article = ArticleSummary & {
  html: string
}

export function isArticleLocale(value: string): value is ArticleLocale {
  return ARTICLE_LOCALES.includes(value as ArticleLocale)
}

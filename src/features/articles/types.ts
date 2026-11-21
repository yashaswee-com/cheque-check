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
  headings: ArticleHeading[]
}

export type ArticleHeading = {
  id: string
  text: string
  level: 2 | 3
}

export const ARTICLE_HREFLANG: Record<ArticleLocale, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  'hi-en': 'hi-Latn-IN',
}

export function isArticleLocale(value: string): value is ArticleLocale {
  return ARTICLE_LOCALES.includes(value as ArticleLocale)
}

export function articleIndexLanguages() {
  return Object.fromEntries(
    ARTICLE_LOCALES.map((locale) => [
      ARTICLE_HREFLANG[locale],
      `/${locale}/articles`,
    ]),
  )
}

export function articleLanguageAlternates(
  articles: ArticleSummary[],
): Record<string, string> {
  const languages = Object.fromEntries(
    articles.map((article) => [ARTICLE_HREFLANG[article.locale], article.href]),
  )
  const english = articles.find((article) => article.locale === 'en')
  if (english) languages['x-default'] = english.href
  return languages
}

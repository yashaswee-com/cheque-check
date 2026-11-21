import type { Metadata } from 'next'
import { ArticleIndex } from '@/features/articles/components/article-index'
import { listArticles } from '@/features/articles/repository'
import {
  ARTICLE_LOCALES,
  articleIndexLanguages,
  isArticleLocale,
  type ArticleLocale,
} from '@/features/articles/types'
import { JsonLd } from '@/components/json-ld'
import styles from '@/components/public-site/article.module.css'
import { SITE_NAME, SITE_URL, publicPageMetadata } from '@/lib/seo'
import { notFound } from 'next/navigation'

const COPY: Record<
  ArticleLocale,
  { title: string; description: string; eyebrow: string }
> = {
  en: {
    title: 'Cheque Business Guides',
    description:
      'Practical articles about cheque records, workflows, reminders, reports, and safer follow-up for Indian businesses.',
    eyebrow: 'Articles',
  },
  hi: {
    title: 'चेक व्यवसाय गाइड',
    description:
      'चेक रिकॉर्ड, वर्कफ़्लो, रिमाइंडर, रिपोर्ट और व्यवसाय फ़ॉलो-अप पर उपयोगी लेख।',
    eyebrow: 'लेख',
  },
  'hi-en': {
    title: 'Cheque Business Guides',
    description:
      'Cheque records, workflow, reminders, reports aur business follow-up ke practical articles.',
    eyebrow: 'Articles',
  },
}

export function generateStaticParams() {
  return ARTICLE_LOCALES.map((locale) => ({ locale }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isArticleLocale(locale)) notFound()
  const copy = COPY[locale]
  const metadata = publicPageMetadata({
    path: `/${locale}/articles`,
    title: `${copy.title} | ${SITE_NAME}`,
    description: copy.description,
  })
  return {
    ...metadata,
    alternates: {
      canonical: `/${locale}/articles`,
      languages: articleIndexLanguages(),
    },
  }
}

export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isArticleLocale(locale)) notFound()
  const [articles, copy] = await Promise.all([
    listArticles(locale),
    Promise.resolve(COPY[locale]),
  ])
  const collectionData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.title,
    description: copy.description,
    url: `${SITE_URL}/${locale}/articles`,
  }

  return (
    <main className={styles.page}>
      <JsonLd data={collectionData} />
      <div className={styles.shell}>
        <header className={styles.indexHeader}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>
        <ArticleIndex articles={articles} locale={locale} />
      </div>
    </main>
  )
}

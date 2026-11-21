import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getArticle,
  getArticleSummary,
  listAllPublishedArticles,
  listArticleTranslations,
} from '@/features/articles/repository'
import {
  articleLanguageAlternates,
  isArticleLocale,
} from '@/features/articles/types'
import { JsonLd } from '@/components/json-ld'
import styles from '@/components/public-site/article.module.css'
import { SITE_NAME, SITE_URL, publicPageMetadata } from '@/lib/seo'

type Params = Promise<{ locale: string; slug: string }>
const TOC_LABELS = {
  en: 'On this page',
  hi: 'इस पेज पर',
  'hi-en': 'Is page par',
} as const

export async function generateStaticParams() {
  const articles = await listAllPublishedArticles()
  return articles.map(({ locale, slug }) => ({ locale, slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isArticleLocale(locale)) notFound()
  const article = await getArticleSummary(locale, slug)
  if (!article) notFound()
  const path = `/${locale}/articles/${slug}`
  const translations = await listArticleTranslations(article.translationKey)
  return {
    ...publicPageMetadata({
      path,
      title: `${article.title} | ${SITE_NAME}`,
      description: article.description,
    }),
    alternates: {
      canonical: path,
      languages: articleLanguageAlternates(translations),
    },
    authors: [{ name: article.author }],
    openGraph: {
      type: 'article',
      url: path,
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
      section: article.category,
    },
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { locale, slug } = await params
  if (!isArticleLocale(locale)) notFound()
  const article = await getArticle(locale, slug)
  if (!article) notFound()
  const url = `${SITE_URL}/${locale}/articles/${slug}`
  const articleData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: {
      '@type': 'Organization',
      name: article.author,
      url: SITE_URL,
    },
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
    mainEntityOfPage: url,
    articleSection: article.category,
    inLanguage: locale,
  }
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Articles',
        item: `${SITE_URL}/${locale}/articles`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: url,
      },
    ],
  }

  return (
    <main className={styles.page}>
      <JsonLd data={articleData} />
      <JsonLd data={breadcrumbData} />
      <article className={styles.shell}>
        <nav aria-label="Breadcrumb">
          <Link href={`/${locale}/articles`}>← Articles</Link>
        </nav>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>
            {article.category.replaceAll('-', ' ')}
          </p>
          <h1>{article.title}</h1>
          <p className={styles.articleDescription}>{article.description}</p>
          <div className={styles.articleMeta}>
            <span>By {article.author}</span>
            <span>Published {article.publishedAt}</span>
            <span>Updated {article.updatedAt}</span>
            <span>{article.readingMinutes} min read</span>
          </div>
        </header>
        <div className={styles.articleLayout}>
          <div className={styles.articleMain}>
            <div
              className={styles.articleBody}
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
            <aside className={styles.articleAside}>
              <h2>Keep cheque work in one place</h2>
              <p>
                Record issued and received cheques, organize bank accounts, and
                plan reminders for your business.
              </p>
              <Link href="/signup">Start free</Link>
            </aside>
          </div>
          {article.headings.length > 0 && (
            <aside
              className={styles.articleToc}
              aria-label={TOC_LABELS[locale]}
            >
              <h2>{TOC_LABELS[locale]}</h2>
              <nav aria-label={TOC_LABELS[locale]}>
                <ol>
                  {article.headings.map((heading) => (
                    <li
                      key={heading.id}
                      className={
                        heading.level === 3
                          ? styles.articleTocNested
                          : undefined
                      }
                    >
                      <a href={`#${heading.id}`}>{heading.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          )}
        </div>
      </article>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ArticleLocale, ArticleSummary } from '../types'
import styles from './article-index.module.css'

const COPY: Record<
  ArticleLocale,
  {
    searchLabel: string
    searchPlaceholder: string
    all: string
    empty: string
    read: string
    count: (count: number) => string
  }
> = {
  en: {
    searchLabel: 'Search articles',
    searchPlaceholder: 'Search cheque topics...',
    all: 'All topics',
    empty:
      'No articles match your search. Try cheque, reminders, or bank account.',
    read: 'Read article',
    count: (count) => `${count} ${count === 1 ? 'article' : 'articles'}`,
  },
  hi: {
    searchLabel: 'लेख खोजें',
    searchPlaceholder: 'चेक से जुड़े विषय खोजें...',
    all: 'सभी विषय',
    empty: 'आपकी खोज से कोई लेख नहीं मिला। चेक या रिमाइंडर खोजें।',
    read: 'लेख पढ़ें',
    count: (count) => `${count} लेख`,
  },
  'hi-en': {
    searchLabel: 'Articles search karein',
    searchPlaceholder: 'Cheque topics search karein...',
    all: 'Sabhi topics',
    empty:
      'Koi article nahi mila. Cheque, reminder, ya bank account try karein.',
    read: 'Article padhein',
    count: (count) => `${count} ${count === 1 ? 'article' : 'articles'}`,
  },
}

export function ArticleIndex({
  articles,
  locale,
}: {
  articles: ArticleSummary[]
  locale: ArticleLocale
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const copy = COPY[locale]
  const categories = useMemo(
    () => [...new Set(articles.map((article) => article.category))],
    [articles],
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return articles.filter(
      (article) =>
        (category === 'all' || article.category === category) &&
        (!normalized ||
          `${article.title} ${article.description} ${article.category}`
            .toLowerCase()
            .includes(normalized)),
    )
  }, [articles, category, query])

  return (
    <div>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>{copy.searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </label>
        {categories.length > 1 && (
          <label className={styles.field}>
            <span>{copy.all}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">{copy.all}</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className={styles.count} aria-live="polite">
        {copy.count(filtered.length)}
      </p>
      {filtered.length ? (
        <div className={styles.grid}>
          {filtered.map((article) => (
            <article className={styles.card} key={article.id}>
              <div className={styles.meta}>
                <span>{article.category.replaceAll('-', ' ')}</span>
                <span>
                  {article.readingMinutes} min · {article.publishedAt}
                </span>
              </div>
              <h2>
                <Link href={article.href}>{article.title}</Link>
              </h2>
              <p>{article.description}</p>
              <Link className={styles.read} href={article.href}>
                {copy.read}
                <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>{copy.empty}</p>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getFaq, FAQ_CATEGORIES, FAQ_ENTRIES, type FaqId } from '../lib/faqs'

export function FaqExplorer() {
  const t = useTranslations('FAQ')
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return FAQ_ENTRIES.filter((faq) => {
      if (category !== 'all' && faq.category !== category) return false
      if (!query) return true
      const searchable = [
        t(`questions.${faq.id}.question`),
        t(`questions.${faq.id}.answer`),
        t(`categories.${faq.category}`),
      ]
      return searchable.some((value) =>
        value.toLocaleLowerCase().includes(query),
      )
    })
  }, [category, search, t])

  const related = (id: FaqId) => {
    const faq = getFaq(id)
    if (!faq) return
    setCategory(faq.category)
    setOpenId(id)
  }

  return (
    <section aria-labelledby="faq-title" className="space-y-4">
      <div>
        <h2 id="faq-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <label className="sr-only" htmlFor="faq-search">
        {t('searchLabel')}
      </label>
      <Input
        id="faq-search"
        type="search"
        enableMic={false}
        value={search}
        placeholder={t('searchPlaceholder')}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="group"
        aria-label={t('categoriesLabel')}
      >
        <Button
          type="button"
          size="sm"
          variant={category === 'all' ? 'default' : 'outline'}
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          {t('allCategories')}
        </Button>
        {FAQ_CATEGORIES.map((item) => (
          <Button
            type="button"
            size="sm"
            key={item}
            variant={category === item ? 'default' : 'outline'}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {t(`categories.${item}`)}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('resultCount', { count: filtered.length })}
      </p>

      {filtered.length ? (
        <div className="divide-y rounded-lg border bg-card">
          {filtered.map((faq) => {
            const isOpen = openId === faq.id
            return (
              <article key={faq.id} className="p-4">
                <h3>
                  <button
                    type="button"
                    className="w-full text-left font-semibold"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                  >
                    {t(`questions.${faq.id}.question`)}
                  </button>
                </h3>
                {isOpen && (
                  <div className="mt-3 space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`questions.${faq.id}.answer`)}
                    </p>
                    {!!faq.related.length && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold">
                          {t('relatedQuestions')}
                        </p>
                        <ul className="flex flex-wrap gap-2">
                          {faq.related.map((id) => {
                            const branch = getFaq(id)
                            if (!branch) return null
                            return (
                              <li key={id}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => related(id)}
                                >
                                  {t(`questions.${id}.question`)}
                                </Button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    <Link
                      className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                      href="/feedback?category=bug"
                    >
                      {t('reportIssue')}
                    </Link>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {t('noResults')}
        </p>
      )}
    </section>
  )
}

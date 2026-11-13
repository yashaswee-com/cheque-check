'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PillScroller } from '@/components/ui/pill-scroller'
import {
  Search01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  LayoutGridIcon as Grid,
  RocketIcon as Rocket,
  ScanIcon as Scan,
  Wallet03Icon as Wallet,
  Notification03Icon as Notification,
  Shield01Icon as Shield,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { getFaq, FAQ_CATEGORIES, FAQ_ENTRIES, type FaqId } from '../lib/faqs'

const categoryIcons: Record<string, typeof Rocket> = {
  gettingStarted: Rocket,
  chequesScanning: Scan,
  plansPayments: Wallet,
  notifications: Notification,
  privacySecurity: Shield,
}

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
    setSearch('')
    setCategory(faq.category)
    setOpenId(id)
  }

  return (
    <section aria-labelledby="faq-title" className="space-y-4">
      <div className="sr-only">
        <h2 id="faq-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <label className="sr-only" htmlFor="faq-search">
        {t('searchLabel')}
      </label>
      <div className="relative">
        <Input
          id="faq-search"
          type="search"
          enableMic={false}
          leftIcon={Search01Icon}
          className="h-11 rounded-full border-none bg-canvas-parchment pr-12 [&::-webkit-search-cancel-button]:appearance-none"
          value={search}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button
            type="button"
            aria-label={t('clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setSearch('')}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="size-4"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <PillScroller aria-label={t('categoriesLabel')}>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
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
            className="rounded-full"
            key={item}
            variant={category === item ? 'default' : 'outline'}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            <span className="inline-flex items-center gap-2">
              <HugeiconsIcon
                icon={categoryIcons[item] ?? Grid}
                className="h-4 w-4"
              />
              <span>{t(`categories.${item}`)}</span>
            </span>
          </Button>
        ))}
      </PillScroller>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('resultCount', { count: filtered.length })}
      </p>

      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((faq) => {
            const isOpen = openId === faq.id
            return (
              <article
                key={faq.id}
                className="rounded-xl border border-primary/10 bg-card p-4 shadow-sm"
              >
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left font-semibold"
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${faq.id}`}
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                  >
                    {t(`questions.${faq.id}.question`)}
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      aria-hidden="true"
                      className={`size-4 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </h3>
                {isOpen && (
                  <div id={`faq-answer-${faq.id}`} className="mt-3 space-y-4">
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
                      href="/feedback/create?category=bug"
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

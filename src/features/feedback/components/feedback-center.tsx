'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { logger } from '@/lib/logger'
import {
  feedbackCategories,
  type FeedbackPageRequest,
} from '@/validators/feedback'
import { useMyFeedback, useSubmitFeedback } from '../hooks/use-feedback'

export function FeedbackCenter({
  initialCategory = 'other',
}: {
  initialCategory?: (typeof feedbackCategories)[number]
}) {
  const t = useTranslations('Feedback')
  const common = useTranslations('Common')
  const [category, setCategory] =
    useState<(typeof feedbackCategories)[number]>(initialCategory)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageRequest, setPageRequest] = useState<FeedbackPageRequest>({
    limit: 25,
  })
  const [history, setHistory] = useState<FeedbackPageRequest[]>([])
  const submit = useSubmitFeedback()
  const submissions = useMyFeedback(pageRequest)

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSent(false)
    try {
      await submit.mutateAsync({ category, title, description })
      setTitle('')
      setDescription('')
      setSent(true)
    } catch (reason) {
      logger.error('Feedback submission failed', reason)
      setError(
        reason instanceof Error && reason.message === 'FEEDBACK_RATE_LIMIT'
          ? 'rateLimited'
          : 'submitFailed',
      )
    }
  }

  return (
    <div className="max-w-3xl space-y-8 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t('submitTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('privacyNote')}</p>
        <Link
          href="/roadmap"
          className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('viewRoadmap')}
        </Link>
      </header>

      <form
        className="space-y-4 rounded-xl border bg-card p-4"
        onSubmit={onSubmit}
      >
        <div className="space-y-2">
          <label htmlFor="feedback-category" className="text-sm font-medium">
            {t('categoryLabel')}
          </label>
          <select
            id="feedback-category"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value as (typeof feedbackCategories)[number],
              )
            }
          >
            {feedbackCategories.map((item) => (
              <option value={item} key={item}>
                {t(`categories.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="feedback-title" className="text-sm font-medium">
            {t('titleLabel')}
          </label>
          <Input
            id="feedback-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            minLength={3}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="feedback-description" className="text-sm font-medium">
            {t('descriptionLabel')}
          </label>
          <Textarea
            id="feedback-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={3000}
            minLength={10}
            rows={5}
            required
          />
          <p className="text-right text-xs text-muted-foreground">
            {t('characterCount', { count: description.length })}
          </p>
        </div>
        {error && <p role="alert">{t(error)}</p>}
        {sent && <p role="status">{t('submitSuccess')}</p>}
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? t('submitting') : t('submitFeedback')}
        </Button>
      </form>

      <section aria-labelledby="my-feedback-title" className="space-y-3">
        <div>
          <h2 id="my-feedback-title" className="text-lg font-semibold">
            {t('mySubmissions')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('privateListNote')}
          </p>
        </div>
        {submissions.isLoading ? (
          <p role="status">{common('loading')}</p>
        ) : submissions.error ? (
          <p role="alert">{common('loadDataError')}</p>
        ) : !submissions.data?.items.length ? (
          <p role="status" className="rounded-lg border p-4 text-sm">
            {t('noSubmissions')}
          </p>
        ) : (
          <ul className="space-y-3">
            {submissions.data.items.map((item) => (
              <li key={item.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{item.title}</h3>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {t(`statuses.${item.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`categories.${item.category}`)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.description}
                </p>
                {item.category === 'feature' && item.roadmap_published && (
                  <Link
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    href="/roadmap"
                  >
                    {t('nowOnRoadmap')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!history.length || submissions.isFetching}
            onClick={() => {
              setPageRequest(history[history.length - 1])
              setHistory(history.slice(0, -1))
            }}
          >
            {t('previousPage')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!submissions.data?.next_cursor || submissions.isFetching}
            onClick={() => {
              if (!submissions.data?.next_cursor) return
              setHistory([...history, pageRequest])
              setPageRequest({
                limit: pageRequest.limit,
                before: submissions.data.next_cursor,
              })
            }}
          >
            {t('nextPage')}
          </Button>
        </div>
      </section>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextFontIcon as TextIcon,
  LabelIcon,
  Comment01Icon,
} from '@hugeicons/core-free-icons'
import { Textarea } from '@/components/ui/textarea'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { FieldError } from '@/components/ui/field-error'
import { toast } from '@/components/ui/toast'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'
import {
  feedbackCategories,
  type FeedbackPageRequest,
} from '@/validators/feedback'
import { useMyFeedback, useSubmitFeedback } from '../hooks/use-feedback'

export function FeedbackCenter({
  initialCategory = 'other',
  mode = 'list',
}: {
  initialCategory?: (typeof feedbackCategories)[number]
  mode?: 'list' | 'create'
}) {
  const t = useTranslations('Feedback')
  const common = useTranslations('Common')
  const [category, setCategory] =
    useState<(typeof feedbackCategories)[number]>(initialCategory)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pageRequest, setPageRequest] = useState<FeedbackPageRequest>({
    limit: 25,
  })
  const [history, setHistory] = useState<FeedbackPageRequest[]>([])
  const submit = useSubmitFeedback()
  const submitting = useRef(false)
  const submissions = useMyFeedback(pageRequest)

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setError(null)
    try {
      await submit.mutateAsync({ category, title, description })
      setTitle('')
      setDescription('')
      toast.add({ title: t('submitSuccess'), type: 'success' })
      router.push('/feedback')
    } catch (reason) {
      logger.error('Feedback submission failed', reason)
      setError(
        reason instanceof Error && reason.message === 'FEEDBACK_RATE_LIMIT'
          ? 'rateLimited'
          : 'submitFailed',
      )
    } finally {
      submitting.current = false
    }
  }

  return (
    <div className="max-w-3xl space-y-8 pb-24">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('privacyNote')}</p>
        <Link
          href="/roadmap"
          className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('viewRoadmap')}
        </Link>
      </header>

      {mode === 'create' && (
        <form
          id="feedback-create-form"
          className="space-y-4"
          onSubmit={onSubmit}
        >
          <div className="space-y-2">
            <Label
              required
              htmlFor="feedback-category"
              className="text-xs font-normal uppercase tracking-wider text-muted-foreground"
            >
              {t('categoryLabel')}
            </Label>
            <div className="relative">
              <HugeiconsIcon
                icon={LabelIcon}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              />
              <select
                id="feedback-category"
                className="h-14 w-full rounded-sm border border-input bg-canvas-parchment pl-10 pr-3 text-base font-normal dark:bg-surface-tile-1"
                value={category}
                onChange={(event) => {
                  const selected = feedbackCategories.find(
                    (item) => item === event.target.value,
                  )
                  if (selected) setCategory(selected)
                }}
              >
                {feedbackCategories.map((item) => (
                  <option value={item} key={item}>
                    {t(`categories.${item}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label
              required
              htmlFor="feedback-title"
              className="text-xs font-normal uppercase tracking-wider text-muted-foreground"
            >
              {t('titleLabel')}
            </Label>
            <Input
              id="feedback-title"
              leftIcon={TextIcon}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              minLength={3}
              required
              className="h-14"
            />
          </div>
          <div className="space-y-2">
            <Label
              required
              htmlFor="feedback-description"
              className="text-xs font-normal uppercase tracking-wider text-muted-foreground"
            >
              {t('descriptionLabel')}
            </Label>
            <div className="relative">
              <HugeiconsIcon
                icon={Comment01Icon}
                aria-hidden
                className="pointer-events-none absolute left-3 top-3 size-5 text-muted-foreground"
              />
              <Textarea
                id="feedback-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={3000}
                minLength={10}
                rows={5}
                required
                className="bg-canvas-parchment pl-10 dark:bg-surface-tile-1"
              />
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {t('characterCount', { count: description.length })}
            </p>
          </div>
          {error && <FieldError>{t(error)}</FieldError>}
        </form>
      )}
      {mode === 'create' && (
        <EditSaveBar
          formId="feedback-create-form"
          label={t('submitFeedback')}
          isDirty={true}
          isSaving={submit.isPending}
          testId="feedback-submit-button"
        />
      )}

      {mode === 'list' && (
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
              disabled={
                !submissions.data?.next_cursor || submissions.isFetching
              }
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
      )}
    </div>
  )
}

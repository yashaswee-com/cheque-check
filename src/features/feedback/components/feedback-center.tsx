'use client'

import Link from 'next/link'
import { useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextFontIcon as TextIcon,
  Comment01Icon,
  Search01Icon,
  Sorting05Icon,
} from '@hugeicons/core-free-icons'
import { Textarea } from '@/components/ui/textarea'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { FieldError } from '@/components/ui/field-error'
import { toast } from '@/components/ui/toast'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'
import {
  feedbackCategories,
  feedbackStatuses,
  type PrivateFeedbackPageRequest,
} from '@/validators/feedback'
import { useMyFeedback, useSubmitFeedback } from '../hooks/use-feedback'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { FeedbackTypeSelector } from './feedback-type-selector'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { AttachmentPicker } from '@/components/ui/attachment-picker'
import {
  attachmentTypes,
  validateAttachmentFiles,
} from '@/lib/attachment-files'
import {
  FeedbackAttachments,
  FeedbackAttachmentsProvider,
} from './feedback-attachments'

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function FeedbackCenter({
  initialCategory = 'other',
  mode = 'list',
}: {
  initialCategory?: (typeof feedbackCategories)[number]
  mode?: 'list' | 'create'
}) {
  const t = useTranslations('Feedback')
  const common = useTranslations('Common')
  const display = useDisplayFormat()
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
  const [category, setCategory] =
    useState<(typeof feedbackCategories)[number]>(initialCategory)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState(false)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pageRequest, setPageRequest] = useState<PrivateFeedbackPageRequest>({
    limit: 25,
  })
  const [history, setHistory] = useState<PrivateFeedbackPageRequest[]>([])
  const submit = useSubmitFeedback()
  const submitting = useRef(false)
  const submissions = useMyFeedback(pageRequest, mode === 'list')
  const changeFilters = (changes: Partial<PrivateFeedbackPageRequest>) => {
    setPageRequest((current) => ({ ...current, ...changes, before: undefined }))
    setHistory([])
  }
  const hasFilters = !!(
    pageRequest.search ||
    pageRequest.category ||
    pageRequest.status
  )

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || !navigator.onLine || attachmentError) return
    submitting.current = true
    setError(null)
    try {
      if (!validateAttachmentFiles(attachments)) {
        setAttachmentError(true)
        return
      }
      await submit.mutateAsync({
        submission: { category, title, description },
        attachments,
      })
      setTitle('')
      setDescription('')
      setAttachments([])
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
    <div className="max-w-2xl space-y-8 pb-24">
      {mode === 'create' && (
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('privacyNote')}</p>
          {!online && <p role="status">{t('offlineNotice')}</p>}
          <Link
            href="/roadmap"
            className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('viewRoadmap')}
          </Link>
        </header>
      )}

      {mode === 'create' && (
        <form
          id="feedback-create-form"
          className="space-y-4"
          onSubmit={onSubmit}
        >
          <FeedbackTypeSelector value={category} onChange={setCategory} />
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
          <AttachmentPicker
            files={attachments}
            onChange={(files) => {
              setAttachments(files)
              setAttachmentError(false)
            }}
            onInvalid={() => setAttachmentError(true)}
            validate={validateAttachmentFiles}
            label={t('attachmentsLabel')}
            hint={t('attachmentsHint')}
            accept={attachmentTypes.join(',')}
            removeLabel={(name) => t('removeAttachment', { name })}
            disabled={submit.isPending}
          />
          {attachmentError && (
            <FieldError>{t('attachmentsInvalid')}</FieldError>
          )}
          {error && <FieldError>{t(error)}</FieldError>}
        </form>
      )}
      {mode === 'create' && (
        <EditSaveBar
          formId="feedback-create-form"
          label={t('submitFeedback')}
          isDirty={true}
          isSaving={submit.isPending}
          disabled={!online || attachmentError}
          testId="feedback-submit-button"
        />
      )}

      {mode === 'list' && (
        <section aria-labelledby="my-feedback-title" className="space-y-3">
          <h2 id="my-feedback-title" className="sr-only">
            {t('mySubmissions')}
          </h2>
          <div className="flex gap-2">
            <Input
              type="search"
              aria-label={t('searchLabel')}
              placeholder={t('searchLabel')}
              leftIcon={Search01Icon}
              className="h-11 flex-1 rounded-full border-none bg-canvas-parchment"
              value={pageRequest.search ?? ''}
              maxLength={120}
              onChange={(event) =>
                changeFilters({ search: event.target.value })
              }
            />
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 rounded-full"
                    aria-label={common('sortAndFilter')}
                  />
                }
              >
                <HugeiconsIcon icon={Sorting05Icon} className="size-5" />
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{common('sortAndFilter')}</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 py-4">
                  <FilterPillSection title={common('order')}>
                    {(['desc', 'asc'] as const).map((order) => (
                      <button
                        key={order}
                        type="button"
                        aria-pressed={(pageRequest.order ?? 'desc') === order}
                        className={filterPillClassName(
                          (pageRequest.order ?? 'desc') === order,
                        )}
                        onClick={() => changeFilters({ order })}
                      >
                        {t(order === 'desc' ? 'newestFirst' : 'oldestFirst')}
                      </button>
                    ))}
                  </FilterPillSection>
                  <FilterPillSection title={t('categoryLabel')}>
                    {([undefined, ...feedbackCategories] as const).map(
                      (item) => (
                        <button
                          key={item ?? 'all'}
                          type="button"
                          aria-pressed={pageRequest.category === item}
                          className={filterPillClassName(
                            pageRequest.category === item,
                          )}
                          onClick={() => changeFilters({ category: item })}
                        >
                          {item ? t(`categories.${item}`) : common('all')}
                        </button>
                      ),
                    )}
                  </FilterPillSection>
                  <FilterPillSection title={t('statusLabel')}>
                    {([undefined, ...feedbackStatuses] as const).map((item) => (
                      <button
                        key={item ?? 'all'}
                        type="button"
                        aria-pressed={pageRequest.status === item}
                        className={filterPillClassName(
                          pageRequest.status === item,
                        )}
                        onClick={() => changeFilters({ status: item })}
                      >
                        {item ? t(`statuses.${item}`) : common('all')}
                      </button>
                    ))}
                  </FilterPillSection>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      changeFilters({
                        search: '',
                        category: undefined,
                        status: undefined,
                        order: 'desc',
                      })
                    }
                  >
                    {t('clearFilters')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Link
            href="/roadmap"
            className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('viewRoadmap')}
          </Link>
          {!online && submissions.data && (
            <p role="status">{t('offlineNotice')}</p>
          )}
          {submissions.data && submissions.isFetching && (
            <p role="status" className="flex items-center gap-2">
              <Spinner />
              {t('refreshing')}
            </p>
          )}
          {online &&
            submissions.data &&
            submissions.isStale &&
            !submissions.isFetching &&
            !submissions.error && (
              <div role="status">
                <span>{t('staleNotice')}</span>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => void submissions.refetch()}
                >
                  {t('refresh')}
                </Button>
              </div>
            )}
          {submissions.data && submissions.error && (
            <div role="alert">
              <p>{t('refreshFailed')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void submissions.refetch()}
              >
                {t('retry')}
              </Button>
            </div>
          )}
          {!submissions.data &&
          submissions.isPending &&
          !submissions.isFetching ? (
            <p role="status">
              {online ? common('loading') : t('offlineNotice')}
            </p>
          ) : submissions.isLoading ? (
            <div role="status">
              <span className="sr-only">{common('loading')}</span>
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ) : submissions.error && !submissions.data ? (
            <div role="alert">
              <p>{common('loadDataError')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void submissions.refetch()}
              >
                {t('retry')}
              </Button>
            </div>
          ) : !submissions.data?.items.length ? (
            <p role="status" className="rounded-lg border p-4 text-sm">
              {hasFilters ? t('noMatches') : t('noSubmissions')}
              {hasFilters && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() =>
                    changeFilters({
                      search: '',
                      category: undefined,
                      status: undefined,
                      order: 'desc',
                    })
                  }
                >
                  {t('clearFilters')}
                </Button>
              )}
            </p>
          ) : (
            <FeedbackAttachmentsProvider
              ids={submissions.data.items.map((item) => item.id)}
            >
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
                      {t(`categories.${item.category}`)} ·{' '}
                      {display.date(item.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <FeedbackAttachments feedbackId={item.id} />
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
            </FeedbackAttachmentsProvider>
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
                  ...pageRequest,
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

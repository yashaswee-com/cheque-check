'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useRoadmap, useRoadmapVote } from '../hooks/use-feedback'
import type { FeedbackPageRequest } from '@/validators/feedback'

export function Roadmap() {
  const t = useTranslations('Feedback')
  const common = useTranslations('Common')
  const [request, setRequest] = useState<FeedbackPageRequest>({ limit: 25 })
  const [history, setHistory] = useState<FeedbackPageRequest[]>([])
  const [actionError, setActionError] = useState(false)
  const roadmap = useRoadmap(request)
  const vote = useRoadmapVote()

  return (
    <div className="max-w-3xl space-y-6 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t('roadmapTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('roadmapPrivacy')}</p>
        <Link
          href="/feedback/create?category=feature"
          className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('suggestFeature')}
        </Link>
      </header>

      {actionError && <p role="alert">{t('voteFailed')}</p>}
      {roadmap.isLoading ? (
        <p role="status">{common('loading')}</p>
      ) : roadmap.error ? (
        <p role="alert">{common('loadDataError')}</p>
      ) : !roadmap.data?.items.length ? (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {t('roadmapEmpty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {roadmap.data.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{item.title}</h2>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {t(`statuses.${item.status}`)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <Button
                type="button"
                variant={item.has_voted ? 'default' : 'outline'}
                className="shrink-0"
                aria-pressed={item.has_voted}
                disabled={vote.isPending}
                onClick={async () => {
                  setActionError(false)
                  try {
                    await vote.mutateAsync({
                      feedbackId: item.id,
                      hasVoted: item.has_voted,
                    })
                  } catch {
                    setActionError(true)
                  }
                }}
              >
                {item.has_voted ? t('voted') : t('vote')}
                <span className="ml-1" aria-label={t('voteCount')}>
                  {item.vote_count}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!history.length || roadmap.isFetching}
          onClick={() => {
            setRequest(history[history.length - 1])
            setHistory(history.slice(0, -1))
          }}
        >
          {t('previousPage')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!roadmap.data?.next_cursor || roadmap.isFetching}
          onClick={() => {
            if (!roadmap.data?.next_cursor) return
            setHistory([...history, request])
            setRequest({
              limit: request.limit,
              before: roadmap.data.next_cursor,
            })
          }}
        >
          {t('nextPage')}
        </Button>
      </div>
    </div>
  )
}

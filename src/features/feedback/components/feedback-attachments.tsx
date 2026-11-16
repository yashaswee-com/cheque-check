'use client'

import { createContext, useContext, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import {
  useFeedbackAttachments,
  useFeedbackAttachmentDownload,
} from '../hooks/use-feedback'
import type { feedbackService } from '../services/feedback.service'

type Attachment = Awaited<
  ReturnType<typeof feedbackService.attachments>
>[number]
const AttachmentContext = createContext<Attachment[]>([])

export function FeedbackAttachmentsProvider({
  ids,
  children,
}: {
  ids: string[]
  children: React.ReactNode
}) {
  const t = useTranslations('Feedback')
  const query = useFeedbackAttachments(ids)
  return (
    <AttachmentContext.Provider value={query.data ?? []}>
      {query.error && (
        <div role="alert">
          {t('attachmentsLoadFailed')}{' '}
          <Button
            type="button"
            variant="link"
            onClick={() => void query.refetch()}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      {children}
    </AttachmentContext.Provider>
  )
}

export function FeedbackAttachments({ feedbackId }: { feedbackId: string }) {
  const t = useTranslations('Feedback')
  const attachments = useContext(AttachmentContext).filter(
    (item) => item.feedback_id === feedbackId,
  )
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const downloadMutation = useFeedbackAttachmentDownload()

  async function download(id: string) {
    if (downloading) return
    setDownloading(id)
    setError(false)
    try {
      const attachment = await downloadMutation.mutateAsync(id)
      const binary = atob(attachment.data.replace(/\s/g, ''))
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      )
      const url = URL.createObjectURL(
        new Blob([bytes], { type: attachment.mime_type }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      logger.error('Feedback attachment download failed', reason)
      setError(true)
    } finally {
      setDownloading(null)
    }
  }

  if (!attachments.length) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{t('attachmentsLabel')}</p>
      {attachments.map((attachment) => (
        <Button
          key={attachment.id}
          type="button"
          variant="outline"
          size="sm"
          disabled={!!downloading}
          loading={downloading === attachment.id}
          onClick={() => void download(attachment.id)}
        >
          {attachment.filename}
        </Button>
      ))}
      {error && <p role="alert">{t('attachmentDownloadFailed')}</p>}
    </div>
  )
}

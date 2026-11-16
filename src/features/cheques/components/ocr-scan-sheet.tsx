'use client'

import type { ComponentProps } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import { Spinner } from '@/components/ui/spinner'
import { OcrReview } from './ocr-review'

export function OcrScanSheet({
  imageUrl,
  isUploading,
  open,
  onOpenChange,
  onUpload,
  onRemove,
  ...review
}: Omit<ComponentProps<typeof OcrReview>, 'onDone'> & {
  imageUrl: string | null | undefined
  isUploading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: () => void
  onRemove: () => void
}) {
  const t = useTranslations('Ocr')
  const c = useTranslations('Cheques')
  const scan = review.scan
  const status = isUploading
    ? t('flow.uploading')
    : scan.errorCode
      ? t('flow.needsAttention')
      : scan.isExtracting
        ? t('states.processing')
        : scan.job
          ? t(`states.${scan.job.status}`)
          : t('flow.entryHelp')
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-16 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal"
        aria-haspopup="dialog"
        onClick={() => onOpenChange(true)}
      >
        <span className="min-w-0">
          <span className="block font-semibold">{t('title')}</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {status}
          </span>
        </span>
        <span className="shrink-0 text-xs text-primary">
          {t(imageUrl ? 'flow.open' : 'flow.start')}
        </span>
      </Button>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          keepMounted
          className="sm:max-w-lg"
          data-monitoring-private
          data-clarity-mask="true"
        >
          <SheetHeader className="pr-8">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{t('flow.sheetHelp')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            {imageUrl ? (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t('flow.viewPhoto')}
                </summary>
                <SkeletonImage
                  src={imageUrl}
                  alt={c('photo')}
                  containerClassName="mt-3 w-full"
                  className="max-h-52 w-full rounded-lg object-contain"
                />
              </details>
            ) : (
              <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                {t('ready')}
              </p>
            )}
            {isUploading ? (
              <p role="status" className="flex items-center gap-2">
                <Spinner className="size-4" />
                {t('flow.uploading')}
              </p>
            ) : imageUrl ? (
              <OcrReview
                key={`${scan.job?.id ?? imageUrl}:${scan.job?.mode ?? ''}`}
                {...review}
                onDone={() => onOpenChange(false)}
              />
            ) : null}
            <div className="flex gap-2 border-t pt-3">
              <Button
                type="button"
                variant={imageUrl ? 'outline' : 'default'}
                className="h-auto min-h-11 flex-1 whitespace-normal"
                disabled={
                  isUploading || scan.isExtracting || scan.isCreatingInline
                }
                onClick={onUpload}
              >
                {imageUrl ? t('flow.replacePhoto') : c('scanUpload')}
              </Button>
              {imageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-11 flex-1 whitespace-normal"
                  disabled={isUploading || scan.isCreatingInline}
                  onClick={onRemove}
                >
                  {t('flow.removePhoto')}
                </Button>
              )}
            </div>
            {!imageUrl && (
              <p className="text-xs text-muted-foreground">{t('retakeHelp')}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

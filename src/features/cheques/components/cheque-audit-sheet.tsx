'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { TimeIcon as Clock } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { useChequeAuditLog } from '@/features/cheques/hooks/use-cheque-audit-log'
import {
  describeAuditChange,
  getAuditEventTitle,
  type ChequeAuditEvent,
} from '@/features/cheques/lib/audit-log'

interface ChequeAuditSheetProps {
  chequeId: string
  open: boolean
  onOpenChange: (value: boolean) => void
}

export function ChequeAuditSheet({
  chequeId,
  open,
  onOpenChange,
}: ChequeAuditSheetProps) {
  const t = useTranslations('Cheques')
  const display = useDisplayFormat()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useChequeAuditLog(chequeId, open)

  const events = useMemo(
    () => data?.pages.flatMap((page) => page.events) ?? [],
    [data],
  )

  const toggleExpanded = (id: string) => {
    setExpanded((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[90dvh] rounded-t-3xl" showCloseButton>
        <SheetHeader>
          <SheetTitle>{t('auditLogTitle')}</SheetTitle>
          <SheetDescription>{t('auditLogDescription')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 py-2">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t('auditLogEmpty')}
          </div>
        ) : (
          <div className="relative space-y-5 pb-2">
            {events.map((event) => (
              <div key={event.id} className="relative pl-7">
                <div className="absolute left-2 top-0 h-full w-px bg-border" />
                <div className="absolute left-0 top-2 size-3 rounded-full border-2 border-background bg-primary" />
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {getAuditEventTitle(event)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actor_name ?? event.actor_kind}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <HugeiconsIcon icon={Clock as any} className="size-3.5" />
                      {display.dateTime(event.created_at)}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {event.changes.map((change, index) => {
                      const details = describeAuditChange(change)
                      const changeId = `${event.id}-${index}`
                      const isExpanded = !!expanded[changeId]

                      return (
                        <div
                          key={changeId}
                          className="rounded-lg border bg-background/60"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium"
                            onClick={() => toggleExpanded(changeId)}
                          >
                            <span>{details.label}</span>
                            <span className="text-muted-foreground">
                              {isExpanded ? 'Hide' : 'Show'}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="grid grid-cols-2 gap-2 border-t px-3 py-2 text-xs">
                              <div>
                                <p className="mb-1 text-muted-foreground">
                                  Before
                                </p>
                                <p className="break-words font-medium text-foreground">
                                  {details.before}
                                </p>
                              </div>
                              <div>
                                <p className="mb-1 text-muted-foreground">
                                  After
                                </p>
                                <p className="break-words font-medium text-foreground">
                                  {details.after}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}

            {hasNextPage && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? t('loading') : t('loadMoreAuditLog')}
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

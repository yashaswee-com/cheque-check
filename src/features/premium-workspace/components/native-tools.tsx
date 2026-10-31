'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PrintLayoutEditor } from '@/features/cheques/components/print-layout-editor'
import { PremiumGate } from '@/features/monetization/components/premium-gate'
import type { PremiumFeature } from '@/features/monetization/lib/premium-access'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { premiumWorkspaceService } from '../service'
import type { ChequeFilters, ImportKind } from '../types'
import { FiltersPanel } from './filters-panel'
import { ImportPanel } from './import-panel'
import { MessagePanel } from './message-panel'
import { ReportsPanel } from './reports-panel'
import { TemplatesPanel } from './templates-panel'
import type { RunAction } from './workspace'

type Destination =
  'cheques' | 'parties' | 'party' | 'business' | 'account' | 'businesses'

type BusinessOption = { id: string; name: string }

function ToolSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.location.hash === `#${id}`,
  )

  useEffect(() => {
    const syncHash = () => setOpen(window.location.hash === `#${id}`)
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [id])

  return (
    <details
      id={id}
      open={open}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
      className="scroll-mt-24 rounded-lg border bg-card"
    >
      <summary className="flex min-h-12 cursor-pointer items-center px-4 py-3 font-semibold">
        {title}
      </summary>
      <div className="border-t p-4 sm:p-5">{children}</div>
    </details>
  )
}

export function NativeTools({
  destination,
  businessId: requestedBusinessId,
  businessName,
  businesses: requestedBusinesses,
  partyId,
  accountId,
  onFiltersChange,
}: {
  destination: Destination
  businessId?: string
  businessName?: string
  businesses?: BusinessOption[]
  partyId?: string
  accountId?: string
  onFiltersChange?: (filters: ChequeFilters) => void
}) {
  const t = useTranslations('NativeTools')
  const queryClient = useQueryClient()
  const { activeBusiness, businesses: availableBusinesses } = useBusiness()
  const { profile } = useProfile()
  const businessId =
    requestedBusinessId ??
    activeBusiness?.id ??
    requestedBusinesses?.[0]?.id ??
    availableBusinesses[0]?.id
  const businessOptions =
    requestedBusinesses ??
    availableBusinesses.map(({ id, name }) => ({ id, name }))
  const currency = profile?.currency || '₹'
  const needsContext = destination !== 'account'
  const context = useQuery({
    queryKey: ['premium-workspace', 'context', businessId],
    queryFn: () => premiumWorkspaceService.context(businessId!),
    enabled: needsContext && !!businessId,
  })
  const tools = useQuery({
    queryKey: ['premium-workspace', 'tools', businessId],
    queryFn: () => premiumWorkspaceService.tools(businessId!),
    enabled:
      !!businessId &&
      ['cheques', 'business', 'businesses'].includes(destination),
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<'success' | 'error' | null>(null)
  const lock = useRef(false)
  const run = useCallback<RunAction>(
    async (action) => {
      if (lock.current) return
      lock.current = true
      setBusy(true)
      setNotice(null)
      try {
        await action()
        await queryClient.invalidateQueries()
        setNotice('success')
      } catch {
        setNotice('error')
        void queryClient.invalidateQueries({
          queryKey: ['premium-workspace'],
        })
      } finally {
        lock.current = false
        setBusy(false)
      }
    },
    [queryClient],
  )

  if (destination === 'account') {
    return accountId ? (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <ToolSection id="print-layout" title={t('printLayout')}>
          <PrintLayoutEditor accountId={accountId} />
        </ToolSection>
      </div>
    ) : null
  }

  if (!businessId)
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        {t('noBusiness')}
      </p>
    )

  if (context.isPending || (tools.isPending && tools.fetchStatus !== 'idle'))
    return <p role="status">{t('loading')}</p>

  if (context.isError || (tools.isError && tools.fetchStatus !== 'idle'))
    return (
      <div role="alert" className="space-y-3 rounded-md border p-4">
        <p>{t('loadError')}</p>
        <Button
          variant="outline"
          onClick={() => {
            void context.refetch()
            void tools.refetch()
          }}
        >
          {t('retry')}
        </Button>
      </div>
    )

  const workspaceContext = context.data
  if (!workspaceContext) return null
  const savedTools = tools.data ?? []
  const importPanel = (kind: ImportKind) => (
    <ImportPanel
      businessId={businessId}
      context={workspaceContext}
      run={run}
      busy={busy}
      initialKind={kind}
      allowedKinds={[kind]}
    />
  )
  const gated = (feature: PremiumFeature, children: React.ReactNode) => (
    <PremiumGate feature={feature}>{children}</PremiumGate>
  )

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      {notice && (
        <p
          role={notice === 'error' ? 'alert' : 'status'}
          className={
            notice === 'error' ? 'text-destructive' : 'text-muted-foreground'
          }
        >
          {t(notice === 'error' ? 'operationError' : 'operationSuccess')}
        </p>
      )}
      {busy && <p role="status">{t('loading')}</p>}

      {destination === 'cheques' && (
        <>
          <ToolSection id="bulk-import" title={t('import')}>
            {gated('bulk-import', importPanel('cheques'))}
          </ToolSection>
          <ToolSection id="cheque-templates" title={t('templates')}>
            {gated(
              'cheque-templates',
              <TemplatesPanel
                businessId={businessId}
                context={workspaceContext}
                tools={savedTools.filter(
                  (tool) => tool.kind === 'cheque-template',
                )}
                run={run}
                busy={busy}
              />,
            )}
          </ToolSection>
          <ToolSection id="saved-views" title={t('views')}>
            {gated(
              'saved-views',
              <FiltersPanel
                key="native-views"
                businessId={businessId}
                context={workspaceContext}
                tools={savedTools.filter((tool) => tool.kind === 'saved-view')}
                run={run}
                busy={busy}
                mode="views"
                currency={currency}
                onFiltersChange={onFiltersChange}
              />,
            )}
          </ToolSection>
          <ToolSection id="bulk-actions" title={t('bulk')}>
            {gated(
              'bulk-actions',
              <FiltersPanel
                key="native-bulk"
                businessId={businessId}
                context={workspaceContext}
                tools={savedTools.filter((tool) => tool.kind === 'saved-view')}
                run={run}
                busy={busy}
                mode="bulk"
                currency={currency}
                onFiltersChange={onFiltersChange}
              />,
            )}
          </ToolSection>
        </>
      )}

      {destination === 'parties' && (
        <>
          <ToolSection id="bulk-import" title={t('import')}>
            {gated('bulk-import', importPanel('parties'))}
          </ToolSection>
          <ToolSection id="party-statements" title={t('partyStatement')}>
            {gated(
              'party-statements',
              <ReportsPanel
                businessId={businessId}
                businessName={businessName ?? activeBusiness?.name ?? ''}
                businesses={[{ id: businessId, name: businessName ?? '' }]}
                context={workspaceContext}
                currency={currency}
                mode="statement"
                busy={busy}
                run={run}
              />,
            )}
          </ToolSection>
        </>
      )}

      {destination === 'party' && (
        <ToolSection id="party-statements" title={t('partyStatement')}>
          {gated(
            'party-statements',
            <ReportsPanel
              businessId={businessId}
              businessName={businessName ?? activeBusiness?.name ?? ''}
              businesses={[{ id: businessId, name: businessName ?? '' }]}
              context={workspaceContext}
              currency={currency}
              mode="statement"
              busy={busy}
              run={run}
              onlyPartyId={partyId}
            />,
          )}
        </ToolSection>
      )}

      {destination === 'business' && (
        <ToolSection id="message-templates" title={t('messages')}>
          {gated(
            'message-templates',
            <MessagePanel
              businessId={businessId}
              businessName={businessName ?? activeBusiness?.name ?? ''}
              context={workspaceContext}
              tools={savedTools.filter(
                (tool) => tool.kind === 'message-template',
              )}
              run={run}
              busy={busy}
              currency={currency}
            />,
          )}
        </ToolSection>
      )}

      {destination === 'businesses' && (
        <ToolSection id="consolidated-dashboard" title={t('consolidated')}>
          {gated(
            'consolidated-dashboard',
            <ReportsPanel
              businessId={businessId}
              businessName={businessName ?? activeBusiness?.name ?? ''}
              businesses={businessOptions}
              context={workspaceContext}
              currency={currency}
              mode="consolidated"
              busy={busy}
              run={run}
            />,
          )}
        </ToolSection>
      )}
    </section>
  )
}

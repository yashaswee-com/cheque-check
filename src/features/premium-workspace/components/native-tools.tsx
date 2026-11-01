'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  Building03Icon as Building,
  File02Icon as File,
  FilterIcon as Filter,
  Invoice01Icon as Invoice,
  Mail01Icon as Mail,
  MoreVerticalIcon as More,
  Note01Icon as Note,
  Sorting05Icon as Sort,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { PrintLayoutEditor } from '@/features/cheques/components/print-layout-editor'
import { PremiumGate } from '@/features/monetization/components/premium-gate'
import type { PremiumFeature } from '@/features/monetization/lib/premium-access'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { useWorkspaceContext, useWorkspaceTools } from '../hooks/use-workspace'
import { useWorkspaceAction } from '../hooks/use-workspace-action'
import type { ChequeFilters, ImportKind } from '../types'
import { FiltersPanel } from './filters-panel'
import { ImportPanel } from './import-panel'
import { MessagePanel } from './message-panel'
import { ReportsPanel } from './reports-panel'
import { TemplatesPanel } from './templates-panel'

type Destination =
  'cheques' | 'parties' | 'party' | 'business' | 'account' | 'businesses'

type BusinessOption = { id: string; name: string }
const InitialToolContext = createContext<string | null>(null)
const toolIcons: Record<string, IconSvgElement> = {
  'bulk-import': File,
  'cheque-templates': Note,
  'saved-views': Filter,
  'bulk-actions': Sort,
  'party-statements': Invoice,
  'message-templates': Mail,
  'consolidated-dashboard': Building,
  'print-layout': Invoice,
}
const toolSections: Record<
  Destination,
  readonly (readonly [string, string])[]
> = {
  cheques: [
    ['bulk-import', 'import'],
    ['cheque-templates', 'templates'],
    ['saved-views', 'views'],
    ['bulk-actions', 'bulk'],
  ],
  parties: [
    ['bulk-import', 'import'],
    ['party-statements', 'partyStatement'],
  ],
  party: [['party-statements', 'partyStatement']],
  business: [['message-templates', 'messages']],
  businesses: [['consolidated-dashboard', 'consolidated']],
  account: [['print-layout', 'printLayout']],
}

function ToolSection({
  id,
  title,
  icon,
  children,
  onActivate,
}: {
  id: string
  title: string
  icon: IconSvgElement
  children: React.ReactNode
  onActivate?: () => void
}) {
  const initialTool = useContext(InitialToolContext)
  const [open, setOpen] = useState(
    () =>
      initialTool === id ||
      (typeof window !== 'undefined' && window.location.hash === `#${id}`),
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
      onToggle={(event) => {
        const expanded = event.currentTarget.open
        setOpen(expanded)
        if (expanded) onActivate?.()
      }}
      className="scroll-mt-24 rounded-lg border bg-card"
    >
      <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 font-semibold">
        <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-primary" />
        <span>{title}</span>
      </summary>
      <div className="border-t p-4 sm:p-5">{children}</div>
    </details>
  )
}

type NativeToolsProps = {
  destination: Destination
  businessId?: string
  businessName?: string
  businesses?: BusinessOption[]
  partyId?: string
  accountId?: string
  onFiltersChange?: (filters: ChequeFilters) => void
}

export function NativeTools(props: NativeToolsProps) {
  const t = useTranslations('NativeTools')
  const { activeBusiness, businesses } = useBusiness()
  const sections = toolSections[props.destination]
  const initialSection = () =>
    typeof window !== 'undefined'
      ? (sections.find(([id]) => window.location.hash === `#${id}`)?.[0] ??
        null)
      : null
  const [activated, setActivated] = useState<string | null>(() =>
    initialSection(),
  )
  const [sheetOpen, setSheetOpen] = useState(() => initialSection() !== null)
  useEffect(() => {
    const syncHash = () => {
      const section = sections.find(([id]) => window.location.hash === `#${id}`)
      if (section) {
        setActivated(section[0])
        setSheetOpen(true)
      }
    }
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [sections])
  const hasBusiness =
    props.businessId ||
    activeBusiness?.id ||
    props.businesses?.length ||
    businesses.length
  if (props.destination === 'account' && !props.accountId) return null

  const content =
    props.destination === 'account' || !hasBusiness || activated ? (
      <InitialToolContext.Provider value={activated}>
        <NativeToolsContent {...props} />
      </InitialToolContext.Provider>
    ) : (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {sections.map(([id, title]) => (
          <ToolSection
            key={id}
            id={id}
            title={t(title)}
            icon={toolIcons[id]}
            onActivate={() => setActivated(id)}
          >
            <p role="status">{t('loading')}</p>
          </ToolSection>
        ))}
      </section>
    )

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={t('title')}
            data-testid="native-tools-fab"
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-24 z-40 size-12 rounded-full shadow-lg ring-1 ring-border"
          >
            <HugeiconsIcon icon={More} className="size-5" />
          </Button>
        }
      />
      <SheetContent keepMounted className="max-h-[80dvh] overflow-y-auto">
        {content}
      </SheetContent>
    </Sheet>
  )
}

function NativeToolsContent({
  destination,
  businessId: requestedBusinessId,
  businessName,
  businesses: requestedBusinesses,
  partyId,
  accountId,
  onFiltersChange,
}: NativeToolsProps) {
  const t = useTranslations('NativeTools')
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
  const context = useWorkspaceContext(businessId, needsContext)
  const tools = useWorkspaceTools(
    businessId,
    ['cheques', 'business', 'businesses'].includes(destination),
  )
  const { busy, notice, run } = useWorkspaceAction()

  if (destination === 'account') {
    return accountId ? (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <ToolSection
          id="print-layout"
          title={t('printLayout')}
          icon={toolIcons['print-layout']}
        >
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
          <ToolSection
            id="bulk-import"
            title={t('import')}
            icon={toolIcons['bulk-import']}
          >
            {gated('bulk-import', importPanel('cheques'))}
          </ToolSection>
          <ToolSection
            id="cheque-templates"
            title={t('templates')}
            icon={toolIcons['cheque-templates']}
          >
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
          <ToolSection
            id="saved-views"
            title={t('views')}
            icon={toolIcons['saved-views']}
          >
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
          <ToolSection
            id="bulk-actions"
            title={t('bulk')}
            icon={toolIcons['bulk-actions']}
          >
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
          <ToolSection
            id="bulk-import"
            title={t('import')}
            icon={toolIcons['bulk-import']}
          >
            {gated('bulk-import', importPanel('parties'))}
          </ToolSection>
          <ToolSection
            id="party-statements"
            title={t('partyStatement')}
            icon={toolIcons['party-statements']}
          >
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
        <ToolSection
          id="party-statements"
          title={t('partyStatement')}
          icon={toolIcons['party-statements']}
        >
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
        <ToolSection
          id="message-templates"
          title={t('messages')}
          icon={toolIcons['message-templates']}
        >
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
        <ToolSection
          id="consolidated-dashboard"
          title={t('consolidated')}
          icon={toolIcons['consolidated-dashboard']}
        >
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

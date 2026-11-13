'use client'

import { useState } from 'react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  File02Icon as FileText,
  Building03Icon as Building2,
  ArrowRight01Icon as ChevronRight,
  Invoice01Icon,
  CreditCardIcon,
  UserGroupIcon,
  Settings02Icon,
  Notification03Icon,
  DashboardSquare01Icon,
  ChatFeedbackIcon,
  HelpCircleIcon,
  News01Icon,
  LabelIcon,
  ChartHistogramIcon,
  UserIcon,
  SparklesIcon,
  Invoice03Icon,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { useChequeSearch } from '@/features/cheques/hooks/use-cheque-list'
import { useParties } from '@/features/parties/hooks/use-parties'
import { useAccounts } from '@/features/accounts/hooks/use-accounts'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { TextTruncate } from '@/components/ui/text-truncate'
import { Badge } from '@/components/ui/badge'
import { ChequeWithRelations, Party, AccountWithRelations } from '@/types'
import { useTranslations } from 'next-intl'
import { DRAFT_CREATE_PATHS, useDrafts } from '@/features/drafts'
import type { ChequeDraft, PartyDraft, AccountDraft } from '@/types'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id
  const router = useRouter()
  const t = useTranslations('Common')
  const tDrafts = useTranslations('Drafts')
  const navigation = useTranslations('Navigation')
  const settings = useTranslations('Settings')
  const feedback = useTranslations('Feedback')
  const display = useDisplayFormat()

  const {
    cheques,
    isLoading: chequesLoading,
    error: chequesError,
  } = useChequeSearch(open ? businessId : undefined, query)
  const { parties } = useParties(open ? businessId : undefined)
  const { accounts } = useAccounts(open ? businessId : undefined)

  const { data: chequeDrafts } = useDrafts(
    'cheque',
    open ? businessId : undefined,
  )
  const { data: partyDrafts } = useDrafts(
    'party',
    open ? businessId : undefined,
  )
  const { data: accountDrafts } = useDrafts(
    'account',
    open ? businessId : undefined,
  )

  const filteredChequeDrafts =
    query.length > 0
      ? (chequeDrafts || []).filter(
          (c: ChequeDraft) =>
            (c.cheque_number || '').includes(query) ||
            c.party?.name?.toLowerCase().includes(query.toLowerCase()) ||
            (c.amount ?? '').toString().includes(query),
        )
      : []

  const filteredPartyDrafts =
    query.length > 0
      ? (partyDrafts || []).filter(
          (p: PartyDraft) =>
            (p.name || '').toLowerCase().includes(query.toLowerCase()) ||
            (p.contact || '').includes(query),
        )
      : []

  const filteredAccountDrafts =
    query.length > 0
      ? (accountDrafts || []).filter(
          (a: AccountDraft) =>
            (a.bank?.name || '').toLowerCase().includes(query.toLowerCase()) ||
            (a.account_name || '')
              .toLowerCase()
              .includes(query.toLowerCase()) ||
            (a.account_number || '').includes(query),
        )
      : []

  const filteredCheques =
    query.length > 0
      ? (cheques || [])
          .filter(
            (c: ChequeWithRelations) =>
              c.cheque_number.includes(query) ||
              c.party?.name.toLowerCase().includes(query.toLowerCase()) ||
              c.amount.toString().includes(query),
          )
          .slice(0, 5)
      : []

  const filteredParties =
    query.length > 0
      ? (parties || [])
          .filter(
            (p: Party) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              (p.contact || '').includes(query),
          )
          .slice(0, 5)
      : []

  const filteredAccounts =
    query.length > 0
      ? (accounts || [])
          .filter(
            (a: AccountWithRelations) =>
              (a.bank?.name || '')
                .toLowerCase()
                .includes(query.toLowerCase()) ||
              a.account_name.toLowerCase().includes(query.toLowerCase()) ||
              a.account_number.includes(query),
          )
          .slice(0, 5)
      : []

  const navigateTo = (path: string) => {
    router.push(path)
    onOpenChange(false)
  }

  const pages: {
    href: string
    label: string
    icon: IconSvgElement
    keywords: string
  }[] = [
    {
      href: '/dashboard',
      label: navigation('dashboard'),
      icon: DashboardSquare01Icon,
      keywords: 'dashboard',
    },
    {
      href: '/cheques',
      label: navigation('cheques'),
      icon: Invoice01Icon,
      keywords: 'cheques checks',
    },
    {
      href: '/parties',
      label: navigation('parties'),
      icon: UserGroupIcon,
      keywords: 'parties contacts',
    },
    {
      href: '/accounts',
      label: navigation('accounts'),
      icon: CreditCardIcon,
      keywords: 'accounts banks',
    },
    {
      href: '/businesses',
      label: settings('businesses'),
      icon: Building2,
      keywords: 'businesses',
    },
    {
      href: '/settings',
      label: navigation('settings'),
      icon: Settings02Icon,
      keywords: 'settings',
    },
    {
      href: '/settings/preferences',
      label: settings('preferences'),
      icon: Settings02Icon,
      keywords: 'preferences appearance language currency',
    },
    {
      href: '/notifications',
      label: settings('notifications'),
      icon: Notification03Icon,
      keywords: 'notifications inbox',
    },
    {
      href: '/settings/notifications',
      label: t('notificationSettings'),
      icon: Notification03Icon,
      keywords: 'notifications settings reminders',
    },
    {
      href: '/settings/transactions',
      label: settings('transactions'),
      icon: Invoice03Icon,
      keywords: 'transactions payments',
    },
    {
      href: '/features/catalog',
      label: navigation('features'),
      icon: SparklesIcon,
      keywords: 'features premium',
    },
    {
      href: '/profile',
      label: settings('profile'),
      icon: UserIcon,
      keywords: 'profile name email phone',
    },
    {
      href: '/reports',
      label: settings('reports'),
      icon: ChartHistogramIcon,
      keywords: 'reports exports',
    },
    {
      href: '/tags',
      label: settings('manageTags'),
      icon: LabelIcon,
      keywords: 'tags labels',
    },
    {
      href: '/feedback',
      label: feedback('mySubmissions'),
      icon: ChatFeedbackIcon,
      keywords: 'feedback submissions',
    },
    {
      href: '/help',
      label: settings('helpAndSupport'),
      icon: HelpCircleIcon,
      keywords: 'help support faq',
    },
    {
      href: '/settings/whats-new',
      label: settings('whatsNew'),
      icon: News01Icon,
      keywords: 'whats new updates',
    },
  ]
  const filteredPages = pages.filter((item) =>
    query
      .toLocaleLowerCase()
      .trim()
      .split(/\s+/)
      .every((term) =>
        `view ${item.label} ${item.keywords} ${item.href}`
          .toLocaleLowerCase()
          .includes(term),
      ),
  )
  const hasResults =
    filteredPages.length > 0 ||
    filteredCheques.length > 0 ||
    filteredParties.length > 0 ||
    filteredAccounts.length > 0 ||
    filteredChequeDrafts.length > 0 ||
    filteredPartyDrafts.length > 0 ||
    filteredAccountDrafts.length > 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t('searchEverything')}
        data-testid="global-search-input"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[400px]">
        {filteredPages.length > 0 && (
          <CommandGroup heading={t('pages')}>
            {filteredPages.map((item) => (
              <CommandItem
                key={item.href}
                value={`view ${item.label} ${item.keywords} ${item.href}`}
                data-testid="global-search-result-page"
                onSelect={() => navigateTo(item.href)}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 font-normal"
              >
                <HugeiconsIcon
                  icon={item.icon}
                  className="size-5 text-primary"
                />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {chequesError && <p role="alert">{t('loadDataError')}</p>}
        {query.length > 0 &&
          !hasResults &&
          !chequesLoading &&
          !chequesError && (
            <CommandEmpty>{t('noResultsFor', { query })}</CommandEmpty>
          )}

        {(filteredCheques.length > 0 || filteredChequeDrafts.length > 0) && (
          <CommandGroup heading={t('cheques')}>
            {filteredCheques.map((c: ChequeWithRelations) => (
              <CommandItem
                key={c.id}
                data-testid="global-search-result-cheque"
                value={`${c.cheque_number} ${c.party?.name || ''} ${c.amount}`}
                onSelect={() => navigateTo(`/cheques`)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 text-primary shrink-0">
                  <HugeiconsIcon icon={FileText} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal">
                    {display.currency(c.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    {c.party?.name} • #{c.cheque_number}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ChevronRight}
                  className="h-4 w-4 text-muted-foreground opacity-40 shrink-0"
                />
              </CommandItem>
            ))}
            {filteredChequeDrafts.slice(0, 3).map((c: ChequeDraft) => (
              <CommandItem
                key={`draft-${c.id}`}
                data-testid="global-search-result-cheque-draft"
                value={`${c.cheque_number || ''} ${c.party?.name || ''} ${c.amount ?? ''}`}
                onSelect={() =>
                  navigateTo(`${DRAFT_CREATE_PATHS.cheque}?draftId=${c.id}`)
                }
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 text-primary shrink-0">
                  <HugeiconsIcon icon={FileText} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal">
                    {c.amount != null
                      ? display.currency(c.amount)
                      : t('untitled')}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    {c.party?.name}
                    {c.cheque_number ? ` • #${c.cheque_number}` : ''}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary shrink-0"
                >
                  {tDrafts('draftBadge')}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(filteredParties.length > 0 || filteredPartyDrafts.length > 0) && (
          <CommandGroup heading={t('parties')}>
            {filteredParties.map((p: Party) => (
              <CommandItem
                key={p.id}
                data-testid="global-search-result-party"
                value={`${p.name} ${p.contact || ''}`}
                onSelect={() => navigateTo(`/parties/${p.id}`)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <EntityAvatar
                  name={p.name}
                  color={p.color}
                  icon={p.icon}
                  imageUrl={p.avatar_url}
                  size="lg"
                  className="rounded-sm shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <TextTruncate
                    text={p.name}
                    maxLength={25}
                    className="text-sm font-normal block"
                  />
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    {p.contact}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ChevronRight}
                  className="h-4 w-4 text-muted-foreground opacity-40 shrink-0"
                />
              </CommandItem>
            ))}
            {filteredPartyDrafts.slice(0, 3).map((p: PartyDraft) => (
              <CommandItem
                key={`draft-${p.id}`}
                data-testid="global-search-result-party-draft"
                value={`${p.name || ''} ${p.contact || ''}`}
                onSelect={() =>
                  navigateTo(`${DRAFT_CREATE_PATHS.party}?draftId=${p.id}`)
                }
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <EntityAvatar
                  name={p.name || t('untitled')}
                  color={p.color ?? undefined}
                  imageUrl={p.avatar_url}
                  size="lg"
                  className="rounded-sm shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <TextTruncate
                    text={p.name || t('untitled')}
                    maxLength={25}
                    className="text-sm font-normal block"
                  />
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    {p.contact}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary shrink-0"
                >
                  {tDrafts('draftBadge')}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(filteredAccounts.length > 0 || filteredAccountDrafts.length > 0) && (
          <CommandGroup heading={t('accounts')}>
            {filteredAccounts.map((a: AccountWithRelations) => (
              <CommandItem
                key={a.id}
                data-testid="global-search-result-account"
                value={`${a.bank?.name || ''} ${a.account_name} ${a.account_number}`}
                onSelect={() => navigateTo(`/accounts/${a.id}`)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <EntityAvatar
                  name={a.bank?.name || t('bank')}
                  color={a.color}
                  icon={a.icon}
                  imageUrl={a.logo_url ?? a.bank?.logo_url}
                  size="lg"
                  className="rounded-sm shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <TextTruncate
                    text={a.bank?.name || t('bank')}
                    maxLength={25}
                    className="text-sm font-normal block"
                  />
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    <TextTruncate text={a.account_name} maxLength={15} /> •{' '}
                    {a.account_number}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ChevronRight}
                  className="h-4 w-4 text-muted-foreground opacity-40 shrink-0"
                />
              </CommandItem>
            ))}
            {filteredAccountDrafts.slice(0, 3).map((a: AccountDraft) => (
              <CommandItem
                key={`draft-${a.id}`}
                data-testid="global-search-result-account-draft"
                value={`${a.bank?.name || ''} ${a.account_name || ''} ${a.account_number || ''}`}
                onSelect={() =>
                  navigateTo(`${DRAFT_CREATE_PATHS.account}?draftId=${a.id}`)
                }
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <EntityAvatar
                  name={a.bank?.name || t('bank')}
                  color={a.color ?? undefined}
                  imageUrl={a.logo_url ?? a.bank?.logo_url}
                  size="lg"
                  className="rounded-sm shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <TextTruncate
                    text={a.account_name || t('untitled')}
                    maxLength={25}
                    className="text-sm font-normal block"
                  />
                  <p className="text-[10px] text-muted-foreground truncate font-normal uppercase tracking-wider">
                    {a.bank?.name}
                    {a.account_number ? ` • ${a.account_number}` : ''}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary shrink-0"
                >
                  {tDrafts('draftBadge')}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

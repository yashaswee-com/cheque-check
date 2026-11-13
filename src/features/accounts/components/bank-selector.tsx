'use client'

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon as Check,
  ArrowUpDownIcon as ChevronsUpDown,
  BankIcon as Landmark,
  TextFontIcon as TextIcon,
  PlusSignCircleIcon as PlusCircle,
  Delete02Icon as Trash,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { useBanks, useBankMutations } from '../hooks/use-banks'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { DeleteConfirmationDialog } from '@/components/ui/delete-dialog'
import { bankNameKey, isValidBankName } from '../lib/bank-name'
import {
  BANK_TYPES,
  bankSearchLabel,
  isValidBankAbbreviation,
  normalizeBankAbbreviation,
} from '../lib/bank-details'
import { usePagedOptions } from '@/hooks/use-paged-options'
import { OptionPagination } from '@/components/ui/option-pagination'
import { Combobox } from '@/components/ui/combobox'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { countryOptions, DEFAULT_COUNTRY_CODE } from '@/lib/countries'
import type { Bank, BankType } from '@/types'

const emptyBanks: Bank[] = []

interface BankSelectorProps {
  value?: string
  onValueChange: (value: string) => void
  className?: string
}

export function BankSelector({
  value,
  onValueChange,
  className,
}: BankSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const t = useTranslations('Common')
  const tb = useTranslations('BankCatalog')
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState('')
  const [logo, setLogo] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [abbreviation, setAbbreviation] = React.useState('')
  const [abbreviationError, setAbbreviationError] = React.useState<
    string | null
  >(null)
  const [bankType, setBankType] = React.useState<BankType | null>(null)
  const [countryCode, setCountryCode] = React.useState(DEFAULT_COUNTRY_CODE)
  const nameId = React.useId()
  const abbreviationId = React.useId()
  const countries = React.useMemo(
    () =>
      countryOptions().map((country) => ({
        label: country.name,
        value: country.code,
      })),
    [],
  )

  const { data: banks, isPending, error, refetch } = useBanks()
  const { create, remove } = useBankMutations()
  const paged = usePagedOptions(banks ?? emptyBanks, bankSearchLabel)

  const selectedBank = banks?.find((bank) => bank.id === value)
  const trimmedQuery = paged.query.trim()
  const addLabel = trimmedQuery ? `${tb('add')} "${trimmedQuery}"` : tb('add')
  const resetDetails = () => {
    setLogo(null)
    setAbbreviation('')
    setAbbreviationError(null)
    setBankType(null)
    setCountryCode(DEFAULT_COUNTRY_CODE)
  }
  const addBank = async (event: React.FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (create.isPending) return
    if (!isValidBankName(name)) {
      setNameError(tb('invalidName'))
      return
    }
    if (banks?.some((bank) => bankNameKey(bank.name) === bankNameKey(name))) {
      setNameError(tb('duplicate'))
      return
    }
    setNameError(null)
    if (!isValidBankAbbreviation(abbreviation)) {
      setAbbreviationError(tb('invalidAbbreviation'))
      return
    }
    setAbbreviationError(null)
    try {
      const bank = await create.mutateAsync({
        ...(logo ? { logo_url: logo } : {}),
        name,
        abbreviation: normalizeBankAbbreviation(abbreviation) || null,
        bank_type: bankType,
        country_code: countryCode,
      })
      onValueChange(bank.id)
      setAdding(false)
      setName('')
      resetDetails()
    } catch (error) {
      toast.add({
        title: tb('saveFailed'),
        description: error instanceof Error ? error.message : tb('saveFailed'),
        type: 'error',
      })
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) paged.setQuery('')
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t('selectBank')}
              aria-expanded={open}
              data-testid="bank-selector-trigger"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'w-full min-w-0 justify-between h-14 rounded-2xl bg-canvas-parchment border-none px-4 text-lg font-normal cursor-pointer',
                className?.includes('rounded-sm') && 'rounded-sm',
                className,
              )}
            >
              <span className="flex min-w-0 items-center gap-3 overflow-hidden">
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {selectedBank ? (
                    <EntityAvatar
                      name={selectedBank.name}
                      imageUrl={selectedBank.logo_url}
                      size="md"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Landmark}
                      className="h-5 w-5 text-muted-foreground"
                    />
                  )}
                </span>
                <span className="truncate">
                  {selectedBank ? selectedBank.name : t('selectBank')}
                </span>
              </span>
              <HugeiconsIcon
                icon={ChevronsUpDown}
                className="ml-2 h-4 w-4 shrink-0 opacity-50"
              />
            </button>
          }
        />
        <PopoverContent
          className="w-(--anchor-width) max-w-[calc(100vw-2rem)] p-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
          align="start"
        >
          <Command className="rounded-none" shouldFilter={false}>
            <CommandInput
              placeholder={t('searchBank')}
              className="h-12"
              value={paged.query}
              onValueChange={paged.setQuery}
            />
            <CommandList
              key={`${paged.query}:${paged.page}`}
              className="max-h-[300px]"
            >
              {isPending ? (
                <p role="status" className="p-4 text-sm">
                  {tb('load')}
                </p>
              ) : error ? (
                <div role="alert" className="space-y-2 p-4">
                  <p className="text-sm">{tb('error')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => refetch()}
                  >
                    {tb('retry')}
                  </Button>
                </div>
              ) : (
                <CommandEmpty className="py-6 text-center text-sm">
                  <p className="text-muted-foreground">{t('noBankFound')}</p>
                </CommandEmpty>
              )}
              <CommandGroup>
                {paged.options.map((bank) => (
                  <CommandItem
                    key={bank.id}
                    value={bank.id}
                    data-testid="bank-option"
                    onSelect={() => {
                      onValueChange(bank.id)
                      setOpen(false)
                      paged.setQuery('')
                    }}
                    className="flex items-center justify-between py-3 px-4 cursor-pointer"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar
                        name={bank.name}
                        imageUrl={bank.logo_url}
                        size="sm"
                      />
                      <span className="truncate font-normal">{bank.name}</span>
                      {bank.abbreviation && (
                        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                          {bank.abbreviation}
                        </span>
                      )}
                    </div>
                    <HugeiconsIcon
                      icon={Check}
                      className={cn(
                        'h-4 w-4 text-primary',
                        value === bank.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <OptionPagination {...paged} />
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-2 text-primary font-normal"
              disabled={!!error || isPending}
              onClick={() => {
                setName(trimmedQuery)
                setNameError(null)
                resetDetails()
                setOpen(false)
                paged.setQuery('')
                setAdding(true)
              }}
            >
              <HugeiconsIcon icon={PlusCircle} className="h-4 w-4" />
              {addLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {selectedBank?.owner_id && (
        <div className="flex justify-end">
          <DeleteConfirmationDialog
            title={tb('remove')}
            description={tb('removeConfirm')}
            confirmName={selectedBank.name}
            trigger={
              <Button type="button" variant="link" size="sm" className="gap-2">
                <HugeiconsIcon icon={Trash} className="h-4 w-4" />
                {tb('remove')}
              </Button>
            }
            onDelete={async () => {
              await remove.mutateAsync(selectedBank.id)
              onValueChange('')
            }}
          />
        </div>
      )}
      <Sheet
        open={adding}
        onOpenChange={(open) => {
          if (!create.isPending) {
            setAdding(open)
            setNameError(null)
          }
        }}
      >
        <SheetContent className="max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>{tb('create')}</SheetTitle>
            <SheetDescription>{tb('privateHelp')}</SheetDescription>
          </SheetHeader>
          <form className="space-y-4" onSubmit={addBank}>
            <div className="flex justify-center">
              <EditableAvatar
                name={name || tb('name')}
                imageUrl={logo}
                onUpload={async (url) => setLogo(url)}
                onDelete={async () => setLogo(null)}
              />
            </div>
            <Label required htmlFor={nameId}>
              {tb('name')}
            </Label>
            <Input
              leftIcon={Landmark}
              id={nameId}
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(null)
              }}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              disabled={create.isPending}
            />
            {nameError && (
              <FieldError id={`${nameId}-error`} className="text-sm">
                {nameError}
              </FieldError>
            )}
            <Label htmlFor={abbreviationId}>{tb('abbreviation')}</Label>
            <Input
              leftIcon={TextIcon}
              id={abbreviationId}
              value={abbreviation}
              maxLength={10}
              placeholder={tb('abbreviationPlaceholder')}
              className="uppercase"
              onChange={(event) => {
                setAbbreviation(event.target.value)
                setAbbreviationError(null)
              }}
              aria-invalid={!!abbreviationError}
              aria-describedby={
                abbreviationError ? `${abbreviationId}-error` : undefined
              }
              disabled={create.isPending}
            />
            {abbreviationError && (
              <FieldError id={`${abbreviationId}-error`} className="text-sm">
                {abbreviationError}
              </FieldError>
            )}
            <FilterPillSection title={tb('bankType')}>
              {BANK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={bankType === type}
                  disabled={create.isPending}
                  onClick={() => setBankType(bankType === type ? null : type)}
                  className={filterPillClassName(bankType === type)}
                >
                  <span className="text-sm font-normal">
                    {tb(`types.${type}`)}
                  </span>
                </button>
              ))}
            </FilterPillSection>
            <div className="space-y-2">
              <Label required>{tb('country')}</Label>
              <Combobox
                options={countries}
                value={countryCode}
                onValueChange={(code) =>
                  setCountryCode(code || DEFAULT_COUNTRY_CODE)
                }
                placeholder={tb('countrySearch')}
                emptyMessage={tb('countryEmpty')}
                testId="custom-bank-country"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              {tb('create')}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}

'use client'

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon as Check,
  ArrowUpDownIcon as ChevronsUpDown,
  BankIcon as Landmark,
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
import { useBanks, useBankMutations } from '../hooks/use-banks'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { DeleteConfirmationDialog } from '@/components/ui/delete-dialog'
import { bankNameKey, isValidBankName } from '../lib/bank-name'
import { usePagedOptions } from '@/hooks/use-paged-options'
import { OptionPagination } from '@/components/ui/option-pagination'
import type { Bank } from '@/types'

const bankLabel = (bank: Bank) => bank.name
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
  const [nameError, setNameError] = React.useState<string | null>(null)
  const nameId = React.useId()

  const { data: banks, isPending, error, refetch } = useBanks()
  const { create, remove } = useBankMutations()
  const paged = usePagedOptions(banks ?? emptyBanks, bankLabel)

  const selectedBank = banks?.find((bank) => bank.id === value)
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
    try {
      const bank = await create.mutateAsync(name)
      onValueChange(bank.id)
      setAdding(false)
      setName('')
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
                'w-full min-w-0 justify-between h-14 rounded-2xl bg-canvas-parchment border-none px-4 text-lg font-medium cursor-pointer',
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
                    onClick={() => void refetch()}
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
                      <span className="truncate font-medium">{bank.name}</span>
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
              className="w-full"
              disabled={!!error || isPending}
              onClick={() => {
                setOpen(false)
                paged.setQuery('')
                setAdding(true)
              }}
            >
              {tb('add')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {selectedBank?.owner_id && (
        <DeleteConfirmationDialog
          title={tb('remove')}
          description={tb('removeConfirm')}
          confirmName={selectedBank.name}
          trigger={
            <Button type="button" variant="link" size="sm">
              {tb('remove')}
            </Button>
          }
          onDelete={async () => {
            await remove.mutateAsync(selectedBank.id)
            onValueChange('')
          }}
        />
      )}
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!create.isPending) {
            setAdding(open)
            setNameError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tb('create')}</DialogTitle>
            <DialogDescription>{tb('privateHelp')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={addBank}>
            <Label required htmlFor={nameId}>
              {tb('name')}
            </Label>
            <Input
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
              <p
                id={`${nameId}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {nameError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              {tb('create')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

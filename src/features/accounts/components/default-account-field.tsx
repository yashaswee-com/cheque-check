'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useAccountOptions } from '../hooks/use-accounts'

export function DefaultAccountField({
  businessId,
  accountId,
  checked,
  onCheckedChange,
}: {
  businessId: string | undefined
  accountId?: string | null
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const t = useTranslations('Accounts')
  const tc = useTranslations('Common')
  const descriptionId = useId()
  const query = useAccountOptions(businessId)
  const previousDefault = query.data?.find(
    (account) => account.is_default && account.id !== accountId,
  )
  const replacement = previousDefault
    ? `${previousDefault.bank?.name || previousDefault.account_name} \u2022\u2022\u2022\u2022${previousDefault.account_number.slice(-4)}`
    : null

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 rounded-sm border border-primary/10 bg-primary/5 p-4">
        <Checkbox
          data-testid="account-default-checkbox"
          aria-describedby={descriptionId}
          checked={checked}
          disabled={
            !businessId || (query.isPending && !query.data) || query.isError
          }
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <span className="text-sm font-semibold">{t('setAsDefault')}</span>
      </label>
      <div id={descriptionId} className="px-1 text-xs text-muted-foreground">
        {query.isError ? (
          <div
            role="alert"
            className="flex items-center gap-2 text-destructive"
          >
            <p>{tc('loadDataError')}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => query.refetch()}
            >
              {tc('tryAgain')}
            </Button>
          </div>
        ) : query.isPending ? (
          <p role="status">{tc('loading')}</p>
        ) : checked && replacement ? (
          <p role="status">
            {t('replaceDefaultNotice', { account: replacement })}
          </p>
        ) : (
          <p>{t('defaultAccountHelp')}</p>
        )}
      </div>
    </div>
  )
}

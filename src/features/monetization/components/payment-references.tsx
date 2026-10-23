'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { Transaction } from '../repositories/monetization.repository'

export function PaymentReferences({
  transaction,
}: {
  transaction: Transaction
}) {
  const t = useTranslations('SharedUI')
  const tt = useTranslations('Transactions')
  const [copied, setCopied] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const references = [
    { label: t('transactionId'), value: transaction.id },
    { label: tt('orderId'), value: transaction.razorpay_order_id },
    { label: tt('paymentId'), value: transaction.razorpay_payment_id },
  ]
  async function copy(value: string) {
    setCopying(value)
    setFailed(false)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
    } catch {
      setFailed(true)
    } finally {
      setCopying(null)
    }
  }
  return (
    <details className="rounded-lg bg-muted/30 p-3 text-xs">
      <summary className="min-h-8 cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary">
        {t('references')}
      </summary>
      <dl className="space-y-3 pt-3">
        {references.map(({ label, value }) => (
          <div key={label} className="space-y-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 select-text break-all font-mono">
                {value ?? tt('notAvailable')}
              </span>
              {value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  loading={copying === value}
                  disabled={copying !== null}
                  aria-label={`${t('copy')} ${label}`}
                  onClick={() => void copy(value)}
                >
                  {copied === value ? t('copied') : t('copy')}
                </Button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p role="status" className={failed ? 'mt-2 text-destructive' : 'sr-only'}>
        {failed ? t('copyFailed') : copied ? t('copied') : ''}
      </p>
    </details>
  )
}

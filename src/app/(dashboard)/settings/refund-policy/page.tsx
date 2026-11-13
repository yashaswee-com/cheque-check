import { useTranslations } from 'next-intl'

export default function RefundPolicyPage() {
  const t = useTranslations('Settings')

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="prose prose-sm dark:prose-invert max-w-none px-2">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <section className="space-y-2">
            <h2 className="text-lg font-bold">1. {t('subRefunds')}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t('refundSubRefundsContent')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">2. {t('howRequest')}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t('refundHowRequestContent')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">3. {t('exceptions')}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t('refundExceptionsContent')}
            </p>
          </section>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('effectiveDate', { date: 'August 2026' })}
        </p>
      </div>
    </div>
  )
}

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { PRODUCT_IDS } from '@/features/monetization/constants'
import { PREMIUM_FEATURES } from '@/features/monetization/lib/premium-access'
import type { PublicProduct } from '@/features/public-site/repositories/public-pricing.repository'
import { AppEntryLink } from './app-entry-link'
import { LoadingImage } from './loading-image'
import { PremiumMarkBadge } from '@/features/monetization/components/premium-mark'

export function PlanComparison({
  products,
  detailed = false,
  loadFailed = false,
  compact = false,
}: {
  products: PublicProduct[]
  detailed?: boolean
  loadFailed?: boolean
  compact?: boolean
}) {
  const t = useTranslations('PublicSite.comparison')
  const tp = useTranslations('PublicSite.pricing')
  const premium = useTranslations('Premium')
  const included = (
    <span
      role="img"
      aria-label={t('included')}
      className="inline-flex text-green-700"
    >
      <HugeiconsIcon icon={Tick02Icon} size={22} aria-hidden="true" />
    </span>
  )
  const notIncluded = (
    <span
      role="img"
      aria-label={t('notIncluded')}
      className="inline-flex text-red-600"
    >
      <HugeiconsIcon icon={Cancel01Icon} size={22} aria-hidden="true" />
    </span>
  )
  const product = products.find(({ id }) => id === PRODUCT_IDS.LIFETIME_PREMIUM)
  const features = PREMIUM_FEATURES.filter(
    (feature) => feature !== 'unlimited-cheques',
  )
  const PlanHeading = detailed ? 'h2' : 'h3'
  const price = product
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: product.currency,
      }).format(product.amount / 100)
    : null

  return (
    <div className="space-y-8 text-left">
      <div className="grid gap-5 md:grid-cols-2">
        <article className="flex flex-col gap-5 rounded-[18px] border border-primary/15 bg-white p-6 sm:p-8">
          <PlanHeading className="font-heading text-2xl font-bold">
            {t('free')}
          </PlanHeading>
          <p className="-mt-3 text-sm font-normal text-muted-foreground">
            {t('freeDescription')}
          </p>
          <p className="text-4xl font-semibold">₹0</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {included}
              {t('freeLimit')}
            </li>
            <li className="flex items-center gap-2">
              {included}
              {t('core')}
            </li>
            {(['reports', 'bulk-import'] as const).map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                {notIncluded}
                {premium(`features.${feature}`)}
              </li>
            ))}
            {!compact && <li>{t('creditsSeparate')}</li>}
          </ul>
          {!compact && (
            <AppEntryLink
              href="/signup"
              className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full border border-primary px-5 font-semibold text-primary"
            >
              {t('startFree')}
            </AppEntryLink>
          )}
        </article>
        <article className="relative flex flex-col gap-5 rounded-[18px] border border-primary/30 bg-blue-50/60 p-6 sm:p-8">
          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold tracking-wide text-white uppercase">
            {t('recommended')}
          </span>
          <PlanHeading className="flex items-center gap-2 font-heading text-2xl font-bold">
            {t('premium')}
            <PremiumMarkBadge />
          </PlanHeading>
          <p className="-mt-3 text-sm font-medium text-foreground/80">
            {t('premiumSummary')}
          </p>
          {price ? (
            <div>
              <p className="text-4xl font-semibold">{price}</p>
              <p className="mt-2 text-sm text-primary">{tp('oneTime')}</p>
            </div>
          ) : (
            <p
              role={loadFailed ? 'alert' : undefined}
              className="text-sm text-muted-foreground"
            >
              {loadFailed ? tp('loadingError') : t('premiumUnavailable')}
            </p>
          )}
          {!compact && (
            <p className="text-sm text-muted-foreground">
              {t('premiumDescription')}
            </p>
          )}
          <p className="w-fit rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-semibold text-primary">
            {t('lifetimeValue')}
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {included}
              {t('unlimited')}
            </li>
            <li className="flex items-center gap-2">
              {included}
              {t('core')}
            </li>
            {(['reports', 'bulk-import'] as const).map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                {included}
                {premium(`features.${feature}`)}
              </li>
            ))}
            <li className="flex items-center gap-2">
              {included}
              {t('partySms')}
            </li>
            <li className="flex items-center gap-2">
              {included}
              {t('prioritySupport')}
            </li>
            {!compact && <li>{t('creditsSeparate')}</li>}
          </ul>
          {!compact && product && (
            <AppEntryLink
              href={`/features/catalog?purchase=${encodeURIComponent(product.id)}`}
              className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-semibold text-white"
            >
              {tp('purchase')}
            </AppEntryLink>
          )}
          <p className="flex items-start gap-2 border-t border-primary/15 pt-4 text-left text-xs leading-relaxed text-muted-foreground">
            <HugeiconsIcon
              icon={Tick02Icon}
              size={16}
              className="mt-px shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground/80">
              {t.rich('paymentTrust', {
                logo: () => (
                  <LoadingImage
                    src="/assets/razorpay-logo.svg"
                    alt="Razorpay"
                    width={316}
                    height={67}
                    loading="lazy"
                    className="h-4 w-auto"
                    wrapperClassName="h-4 w-[75.5px]"
                  />
                ),
              })}
            </span>
          </p>
        </article>
      </div>
      {!compact && (
        <aside className="rounded-xl border border-primary/15 bg-white p-4 text-sm leading-relaxed">
          <p>{t('offer')}</p>
          <Link
            href="/contact"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            {premium('contactSupport')}
          </Link>
        </aside>
      )}
      {detailed && (
        <div
          className="overflow-x-auto rounded-[18px] border border-primary/15"
          tabIndex={0}
          role="region"
          aria-label={t('tableTitle')}
        >
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="bg-white p-5 text-left font-heading text-xl font-bold">
              {t('tableTitle')}
            </caption>
            <thead className="bg-blue-50">
              <tr>
                <th scope="col" className="w-1/2 p-4 text-left">
                  {t('feature')}
                </th>
                <th scope="col" className="p-4 text-center">
                  {t('free')}
                </th>
                <th scope="col" className="p-4 text-center">
                  {t('premium')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-primary/10 bg-white">
                <th scope="row" className="p-4 text-left font-medium">
                  {t('cheques')}
                </th>
                <td className="p-4 text-center">{t('freeLimit')}</td>
                <td className="p-4 text-center">{t('unlimited')}</td>
              </tr>
              <tr className="border-t border-primary/10 bg-white">
                <th scope="row" className="p-4 text-left font-medium">
                  {t('core')}
                </th>
                <td className="p-4 text-center">{included}</td>
                <td className="p-4 text-center">{included}</td>
              </tr>
              {features.map((feature) => (
                <tr
                  key={feature}
                  className="border-t border-primary/10 bg-white"
                >
                  <th scope="row" className="p-4 text-left font-medium">
                    {premium(`features.${feature}`)}
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                      {premium(`descriptions.${feature}`)}
                    </span>
                  </th>
                  <td className="p-4 text-center">{notIncluded}</td>
                  <td className="p-4 text-center">{included}</td>
                </tr>
              ))}
              <tr className="border-t border-primary/10 bg-white">
                <th scope="row" className="p-4 text-left font-medium">
                  {t('metered')}
                </th>
                <td className="p-4 text-center">{t('separate')}</td>
                <td className="p-4 text-center">{t('separate')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {!compact && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('limitNote')}
        </p>
      )}
    </div>
  )
}

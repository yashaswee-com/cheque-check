import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AppEntryLink } from '@/components/public-site/app-entry-link'
import Link from 'next/link'
import { SITE_NAME, publicPageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite')
  return publicPageMetadata({
    path: '/features',
    title: `${t('features.title')} | ${SITE_NAME}`,
    description: t('features.description'),
  })
}

export default async function PublicFeaturesPage() {
  const t = await getTranslations('PublicSite')
  const features = [
    'cheques',
    'accounts',
    'parties',
    'reminders',
    'reports',
    'search',
    'tracking',
  ] as const

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('features.title')}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {t('features.description')}
        </p>
      </header>
      <section aria-labelledby="public-feature-list" className="space-y-5">
        <h2 id="public-feature-list" className="text-2xl font-semibold">
          {t('features.itemsTitle')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <li
              key={feature}
              className="min-h-32 rounded-xl border bg-card p-6 leading-relaxed"
            >
              <h3 className="mb-2 text-lg font-semibold">
                {t(`features.titles.${feature}`)}
              </h3>
              <p>{t(`features.${feature}`)}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col items-start gap-3">
        <AppEntryLink
          href="/signup"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 font-semibold text-white"
        >
          {t('landing.primaryCta')}
        </AppEntryLink>
        <p className="text-sm text-muted-foreground">
          {t('landing.trialNote')}
        </p>
        <Link
          href="/pricing"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
        >
          {t('landing.pricingCta')}
        </Link>
      </div>
    </main>
  )
}

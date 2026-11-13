import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite')
  return { title: `${t('features.title')} | Cheque Check` }
}

export default async function PublicFeaturesPage() {
  const t = await getTranslations('PublicSite')
  const features = [
    'cheques',
    'accounts',
    'parties',
    'reminders',
    'reports',
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
              <span aria-hidden className="mr-3 font-semibold text-primary">
                ✓
              </span>
              {t(`features.${feature}`)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

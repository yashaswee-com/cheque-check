import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite')
  return { title: `${t('privacy.title')} | ChequeCheck` }
}

export default async function PublicPrivacyPage() {
  const [locale, t, tm, tp] = await Promise.all([
    getLocale(),
    getTranslations('PublicSite'),
    getTranslations('Monitoring'),
    getTranslations('Settings'),
  ])
  const dateLocale =
    locale === 'hi' ? 'hi-IN' : locale === 'hi-en' ? 'en-IN' : 'en'
  const updatedDate = new Intl.DateTimeFormat(dateLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date('2026-08-01T00:00:00Z'))
  const sections = [
    ['intro', 'privacyIntroContent'],
    ['dataCollect', 'privacyDataCollectContent'],
    ['howUse', 'privacyHowUseContent'],
    ['dataSecurity', 'privacyDataSecurityContent'],
    ['yourRights', 'privacyYourRightsContent'],
  ] as const

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {t('privacy.title')}
      </h1>
      <article className="space-y-6 rounded-xl border bg-card p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {tp('lastUpdated', { date: updatedDate })}
        </p>
        {sections.map(([heading, content], index) => (
          <section key={heading} className="space-y-2">
            <h2 className="text-lg font-bold">
              {index + 1}. {tp(heading)}
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              {tp(content)}
            </p>
          </section>
        ))}
        <section className="space-y-2">
          <h2 className="text-lg font-bold">6. {tm('trackingLabel')}</h2>
          <p className="leading-relaxed text-muted-foreground">
            {tm('privacyDisclosure')}
          </p>
          <p className="leading-relaxed text-muted-foreground">
            {tm('metaPixelDisclosure')}
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-bold">7. {tp('contactUs')}</h2>
          <p className="leading-relaxed text-muted-foreground">
            {tp('privacyContactUsContent')}
          </p>
        </section>
      </article>
    </main>
  )
}

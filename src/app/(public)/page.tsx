import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

export default async function LandingPage() {
  const t = await getTranslations('PublicSite')
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('Unable to check session on landing page:', error)
  } else if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-16 px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
      <section className="grid gap-10 rounded-3xl border bg-card px-6 py-12 sm:px-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-16 lg:py-20">
        <div className="space-y-6">
          <p className="font-semibold text-primary">{t('landing.eyebrow')}</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {t('landing.title')}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t('landing.description')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90"
            >
              {t('landing.primaryCta')}
            </Link>
            <Link
              href="/features"
              className="inline-flex min-h-12 items-center justify-center rounded-full border px-6 font-semibold hover:bg-muted"
            >
              {t('landing.secondaryCta')}
            </Link>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="grid aspect-square max-h-80 place-items-center rounded-full bg-primary/10 text-7xl font-semibold text-primary sm:justify-self-center"
        >
          ✓
        </div>
      </section>
      <section aria-labelledby="public-home-features" className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2
            id="public-home-features"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {t('landing.sectionTitle')}
          </h2>
          <p className="text-muted-foreground">
            {t('landing.sectionDescription')}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['cheques', 'accounts', 'parties', 'reports'] as const).map(
            (feature) => (
              <article
                key={feature}
                className="space-y-3 rounded-xl border bg-card p-5"
              >
                <h3 className="font-semibold">{t(`landing.${feature}`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.${feature}Description`)}
                </p>
              </article>
            ),
          )}
        </div>
      </section>
    </main>
  )
}

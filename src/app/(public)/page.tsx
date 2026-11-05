import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Analytics01Icon,
  ArrowRight01Icon,
  BankIcon,
  CheckmarkCircle02Icon,
  File02Icon,
  Notification01Icon,
  ScanIcon,
  SecurityLockIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { createClient } from '@/lib/supabase/server'
import { AppEntryLink } from '@/components/public-site/app-entry-link'

const FEATURES = [
  { key: 'cheques', icon: File02Icon },
  { key: 'accounts', icon: BankIcon },
  { key: 'parties', icon: UserGroupIcon },
  { key: 'reports', icon: Analytics01Icon },
] as const

const STEPS = [
  { key: 'stepRecord', icon: ScanIcon },
  { key: 'stepRemind', icon: Notification01Icon },
  { key: 'stepTrack', icon: CheckmarkCircle02Icon },
] as const

const PREVIEW = [
  {
    amount: '₹ 48,500',
    status: 'previewDue',
    tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    amount: '₹ 1,20,000',
    status: 'previewPending',
    tone: 'bg-primary/10 text-primary',
  },
  {
    amount: '₹ 15,750',
    status: 'previewCleared',
    tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
] as const

const primaryCta =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

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
    <main className="overflow-x-clip">
      <section className="relative isolate border-b bg-linear-to-b from-primary/10 via-background to-background">
        <div
          aria-hidden="true"
          className="absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl sm:h-96 sm:w-96"
        />
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-24">
          <div className="space-y-6 text-center lg:text-left">
            <p className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-semibold text-primary sm:text-sm">
              {t('landing.eyebrow')}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t('landing.title')}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg lg:mx-0">
              {t('landing.description')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <AppEntryLink href="/signup" className={primaryCta}>
                {t('landing.primaryCta')}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </AppEntryLink>
              <Link
                href="/features"
                className="inline-flex min-h-12 items-center justify-center rounded-full border bg-card px-6 font-semibold transition hover:bg-muted"
              >
                {t('landing.secondaryCta')}
              </Link>
            </div>
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
              {(['trustFree', 'trustReminders', 'trustSecure'] as const).map(
                (item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={
                        item === 'trustSecure'
                          ? SecurityLockIcon
                          : CheckmarkCircle02Icon
                      }
                      className="size-4 text-primary"
                    />
                    {t(`landing.${item}`)}
                  </li>
                ),
              )}
            </ul>
          </div>

          <figure
            aria-label={t('landing.previewLabel')}
            data-testid="landing-preview"
            className="mx-auto w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl shadow-primary/10"
          >
            <figcaption className="mb-4 flex items-center justify-between text-sm font-semibold">
              {t('landing.previewTitle')}
              <HugeiconsIcon
                icon={Notification01Icon}
                className="size-5 text-primary"
              />
            </figcaption>
            <ul className="space-y-3">
              {PREVIEW.map((row) => (
                <li
                  key={row.amount}
                  className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <HugeiconsIcon icon={File02Icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">
                    {row.amount}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.tone}`}
                  >
                    {t(`landing.${row.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </section>

      <section
        aria-labelledby="public-home-features"
        className="mx-auto w-full max-w-7xl space-y-8 px-4 py-14 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-2xl space-y-2 text-center">
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
          {FEATURES.map(({ key, icon }) => (
            <article
              key={key}
              className="space-y-3 rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={icon} className="size-5" />
              </span>
              <h3 className="font-semibold">{t(`landing.${key}`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`landing.${key}Description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="public-home-how"
        className="border-y bg-muted/40"
      >
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h2
            id="public-home-how"
            className="text-center text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {t('landing.howTitle')}
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(({ key, icon }, index) => (
              <li key={key} className="flex gap-4 rounded-2xl bg-card p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <HugeiconsIcon icon={icon} className="size-5" />
                </span>
                <div className="space-y-1">
                  <h3 className="font-semibold">
                    <span className="sr-only">{index + 1}. </span>
                    {t(`landing.${key}Title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`landing.${key}Description`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col items-center gap-5 rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {t('landing.ctaTitle')}
          </h2>
          <p className="max-w-xl text-primary-foreground/80">
            {t('landing.ctaDescription')}
          </p>
          <AppEntryLink
            href="/signup"
            data-testid="landing-final-cta"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-background px-6 font-semibold text-foreground transition hover:opacity-90"
          >
            {t('landing.primaryCta')}
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </AppEntryLink>
        </div>
      </section>
    </main>
  )
}

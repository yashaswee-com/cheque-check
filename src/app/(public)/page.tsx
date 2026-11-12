import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Analytics01Icon,
  ArrowRight01Icon,
  BankIcon,
  Call02Icon,
  CheckmarkCircle02Icon,
  DeliveryBox01Icon,
  Download01Icon,
  File02Icon,
  ScanIcon,
  Shirt01Icon,
  UserGroupIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { createClient } from '@/lib/supabase/server'
import { AppEntryLink } from '@/components/public-site/app-entry-link'
import styles from '@/components/public-site/landing.module.css'
import { IndustryMarquee } from '@/components/public-site/industry-marquee'
import { PublicIcon } from '@/components/public-site/public-icon'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite.landing')
  return {
    title: `${t('title')} | CHEQUE-CHECK`,
    description: t('description'),
  }
}

const STEPS = [
  { key: 'stepRecord', icon: ScanIcon },
  { key: 'stepRemind', icon: Call02Icon },
  { key: 'stepTrack', icon: Download01Icon },
] as const

const FEATURES = [
  { key: 'cheques', icon: ScanIcon },
  { key: 'reminders', icon: Call02Icon },
  { key: 'accounts', icon: BankIcon },
  { key: 'parties', icon: UserGroupIcon },
  { key: 'reports', icon: Download01Icon },
] as const

const PROBLEMS = [
  { key: 'dates', icon: Call02Icon },
  { key: 'accounts', icon: BankIcon },
  { key: 'records', icon: File02Icon },
] as const

export default async function LandingPage() {
  const t = await getTranslations('PublicSite.landing')
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error && error.name !== 'AuthSessionMissingError') {
    console.error('Unable to check session on landing page:', error)
  } else if (user) {
    redirect('/dashboard')
  }

  const arrow = (
    <HugeiconsIcon icon={ArrowRight01Icon} size={19} aria-hidden="true" />
  )

  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" className={styles.eyebrowLine} />
            {t('eyebrow')}
          </p>
          <h1 id="landing-title" aria-label={t('title')}>
            {t('titleLead')}
            <br />
            <span className={styles.marked}>{t('titleHighlight')}</span>
          </h1>
          <p className={styles.heroDescription}>{t('description')}</p>
          <div className={styles.actions}>
            <AppEntryLink href="/signup" className={styles.primaryCta}>
              {t('primaryCta')}
              {arrow}
            </AppEntryLink>
          </div>
          <p className={styles.heroNote}>{t('heroNote')}</p>
        </div>

        <div className={styles.showcase}>
          <figure
            id="product-demo"
            aria-label={t('videoLabel')}
            data-testid="landing-video"
            className={styles.videoFrame}
          >
            <span className={styles.videoBadge}>CHEQUE—CHECK</span>
            <div className={styles.videoPlaceholder}>
              <span className={styles.videoIcon}>
                <HugeiconsIcon
                  icon={Video01Icon}
                  size={32}
                  aria-hidden="true"
                />
              </span>
              <strong>{t('videoTitle')}</strong>
              <p>{t('videoPending')}</p>
            </div>
            <figcaption className={styles.videoCaption}>
              {t('videoFormat')}
            </figcaption>
          </figure>
        </div>
        <ul className={styles.trust}>
          {(['trustFree', 'trustReminders', 'trustLanguage'] as const).map(
            (key) => (
              <li key={key}>
                <HugeiconsIcon
                  icon={
                    key === 'trustReminders'
                      ? Call02Icon
                      : CheckmarkCircle02Icon
                  }
                  size={16}
                  aria-hidden="true"
                />
                {t(key)}
              </li>
            ),
          )}
        </ul>
      </section>

      <section className={styles.audience} aria-label={t('audienceLabel')}>
        <p>{t('audienceTitle')}</p>
        <IndustryMarquee />
      </section>

      <section
        className={`${styles.section} ${styles.problemSection}`}
        aria-labelledby="problem-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t('problemEyebrow')}</p>
          <h2 id="problem-title">{t('problemTitle')}</h2>
          <p>{t('problemDescription')}</p>
        </div>
        <div className={styles.problemGrid}>
          {PROBLEMS.map(({ key, icon }) => (
            <article key={key} className={styles.problemCard}>
              <span className={styles.featureIcon}>
                <PublicIcon icon={icon} size={26} />
              </span>
              <h3>{t(`problems.${key}Title`)}</h3>
              <p>{t(`problems.${key}Description`)}</p>
            </article>
          ))}
        </div>
        <p className={styles.problemClose}>{t('problemClose')}</p>
      </section>

      <section className={styles.section} aria-labelledby="how-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t('howEyebrow')}</p>
          <h2 id="how-title">{t('howTitle')}</h2>
          <p>{t('howDescription')}</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map(({ key, icon }, index) => (
            <li key={key}>
              <div className={styles.stepRail}>
                <span>{index + 1}</span>
              </div>
              <div className={styles.stepContent}>
                <PublicIcon icon={icon} size={26} />
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Description`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={`${styles.section} ${styles.bentoSection}`}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t('featureEyebrow')}</p>
          <h2 id="features-title">{t('sectionTitle')}</h2>
          <p>{t('sectionDescription')}</p>
        </div>
        <div className={styles.bento}>
          {FEATURES.map(({ key, icon }) => (
            <article
              key={key}
              className={styles.featureCard}
              data-feature={key}
            >
              <div className={styles.featureCopy}>
                <span className={styles.featureIcon}>
                  <PublicIcon icon={icon} size={28} />
                </span>
                <h3>{t(key)}</h3>
                <p>{t(`${key}Description`)}</p>
              </div>
              <div className={styles.featureVisual}>
                {key === 'cheques' && (
                  <div className={styles.scanVisual}>
                    <span className={styles.scanLabel}>
                      <PublicIcon icon={ScanIcon} size={18} />
                      {t('scanExampleTitle')}
                    </span>
                    <div className={styles.chequeVisual} aria-hidden="true">
                      <div>
                        <span>{t('sampleParty')}</span>
                        <span>№ 000128</span>
                      </div>
                      <strong>
                        ₹48,500<span>.00</span>
                      </strong>
                      <div className={styles.chequeRule} />
                      <span>{t('previewPending')}</span>
                      <span className={styles.chequeSignature}>
                        CHEQUE—CHECK
                      </span>
                    </div>
                    <p>{t('scanExampleNote')}</p>
                  </div>
                )}
                {key === 'reminders' && (
                  <div className={styles.callVisual}>
                    <span className={styles.callStatus}>
                      {t('callExampleStatus')}
                    </span>
                    <span className={styles.callAvatar}>
                      <PublicIcon icon={Call02Icon} size={32} />
                    </span>
                    <strong>{t('reminderExampleTitle')}</strong>
                    <p>{t('reminderExampleDescription')}</p>
                    <div className={styles.callWave} aria-hidden="true">
                      {[12, 24, 16, 32, 20, 28, 12, 24, 16].map(
                        (height, index) => (
                          <span key={index} style={{ height }} />
                        ),
                      )}
                    </div>
                    <span className={styles.callNote}>
                      {t('callExampleNote')}
                    </span>
                  </div>
                )}
                {key === 'accounts' && (
                  <div className={styles.accountVisual} aria-hidden="true">
                    <span>
                      <span>A</span>
                      {t('sampleBankA')}
                    </span>
                    <span>
                      <span>B</span>
                      {t('sampleBankB')}
                    </span>
                  </div>
                )}
                {key === 'parties' && (
                  <div className={styles.avatarGroup} aria-hidden="true">
                    <span>ST</span>
                    <span>MT</span>
                    <span>PK</span>
                  </div>
                )}
                {key === 'reports' && (
                  <div className={styles.downloadVisual}>
                    <span className={styles.downloadIcon}>
                      <PublicIcon icon={Download01Icon} size={28} />
                    </span>
                    <strong>{t('reportExampleTitle')}</strong>
                    <p>{t('reportExampleNote')}</p>
                    <div
                      className={styles.downloadFormats}
                      aria-label={t('reportFormats')}
                    >
                      <span>
                        PDF{' '}
                        <HugeiconsIcon
                          icon={Download01Icon}
                          size={16}
                          aria-hidden="true"
                        />
                      </span>
                      <span>
                        Excel{' '}
                        <HugeiconsIcon
                          icon={Download01Icon}
                          size={16}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </div>
                )}
                <span className={styles.visualCaption}>
                  {t('illustrationLabel')}
                </span>
              </div>
            </article>
          ))}
        </div>
        <Link href="/features" className={styles.textLink}>
          <HugeiconsIcon icon={Analytics01Icon} size={20} aria-hidden="true" />
          {t('allFeatures')}
          {arrow}
        </Link>
      </section>

      <section
        className={`${styles.section} ${styles.pricingSection}`}
        aria-labelledby="pricing-title"
      >
        <div className={styles.pricingInner}>
          <p className={styles.eyebrow}>{t('pricingEyebrow')}</p>
          <h2 id="pricing-title">{t('pricingTitle')}</h2>
          <p>{t('pricingDescription')}</p>
          <Link href="/pricing" className={styles.primaryCta}>
            <HugeiconsIcon icon={BankIcon} size={20} aria-hidden="true" />
            {t('pricingCta')}
            {arrow}
          </Link>
          <span className={styles.pricingNote}>{t('pricingNote')}</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="faq-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t('faqEyebrow')}</p>
          <h2 id="faq-title">{t('faqTitle')}</h2>
        </div>
        <div className={styles.faq}>
          {(
            [
              'accounting',
              'bank',
              'reminders',
              'scan',
              'bounce',
              'mobile',
            ] as const
          ).map((key) => (
            <details key={key}>
              <summary>
                {t(`faq.${key}Question`)}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{t(`faq.${key}Answer`)}</p>
            </details>
          ))}
        </div>
        <p className={styles.faqContact}>
          {t('faqContact')}{' '}
          <Link href="/contact" className={styles.textLink}>
            <HugeiconsIcon icon={File02Icon} size={20} aria-hidden="true" />
            {t('contactCta')}
            {arrow}
          </Link>
        </p>
      </section>

      <section
        className={`${styles.section} ${styles.scenarioSection}`}
        aria-labelledby="scenarios-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{t('scenarioEyebrow')}</p>
          <h2 id="scenarios-title">{t('scenarioTitle')}</h2>
          <p>{t('scenarioDisclosure')}</p>
        </div>
        <p className={styles.swipeHint}>
          {t('swipeHint')}
          <span aria-hidden="true"> →</span>
        </p>
        <div
          className={styles.scenarios}
          role="region"
          aria-label={t('swipeHint')}
          tabIndex={0}
        >
          {(['owner', 'accountant', 'distributor'] as const).map(
            (key, index) => (
              <article key={key} className={styles.scenarioCard}>
                <span className={styles.featureIcon}>
                  <PublicIcon
                    icon={
                      index === 0
                        ? Shirt01Icon
                        : index === 1
                          ? UserGroupIcon
                          : DeliveryBox01Icon
                    }
                    size={26}
                    aria-hidden="true"
                  />
                </span>
                <h3>{t(`scenarios.${key}Need`)}</h3>
                <p>{t(`scenarios.${key}Benefit`)}</p>
                <div className={styles.scenarioPerson}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <div>
                    <strong>{t(`scenarios.${key}Role`)}</strong>
                    <span>{t('scenarioLabel')}</span>
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.finalSection}`}
        aria-labelledby="final-title"
      >
        <span className={styles.finalIcon}>
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={36}
            aria-hidden="true"
          />
        </span>
        <p className={styles.eyebrow}>CHEQUE—CHECK</p>
        <h2 id="final-title">{t('ctaTitle')}</h2>
        <p>{t('ctaDescription')}</p>
        <AppEntryLink
          href="/signup"
          data-testid="landing-final-cta"
          className={styles.primaryCta}
        >
          {t('primaryCta')}
          {arrow}
        </AppEntryLink>
        <span className={styles.finalNote}>{t('heroNote')}</span>
      </section>
    </main>
  )
}

import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Analytics01Icon,
  ArrowRight01Icon,
  BankIcon,
  Calculator01Icon,
  Call02Icon,
  DeliveryBox01Icon,
  Download01Icon,
  File02Icon,
  LockPasswordIcon,
  Payment01Icon,
  ScanIcon,
  Shield01Icon,
  Shirt01Icon,
  SmartPhone01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { createClient } from '@/lib/supabase/server'
import { AppEntryLink } from '@/components/public-site/app-entry-link'
import styles from '@/components/public-site/landing.module.css'
import { IndustryMarquee } from '@/components/public-site/industry-marquee'
import { PublicIcon } from '@/components/public-site/public-icon'
import { PublicBrand } from '@/components/public-site/public-brand'
import { FaqItem } from '@/components/public-site/faq-item'
import { DemoMedia } from '@/components/public-site/demo-media'
import { PillScroller } from '@/components/ui/pill-scroller'
import { PlanComparison } from '@/components/public-site/plan-comparison'
import { publicPricingService } from '@/features/public-site/services/public-pricing.service'
import type { PublicProduct } from '@/features/public-site/repositories/public-pricing.repository'
import { logger } from '@/lib/logger'
import { getWhatsAppSupportLink } from '@/lib/whatsapp'
import { WhatsAppLogo } from '@/components/public-site/whatsapp-logo'
import { IndiaFlag } from '@/components/public-site/india-flag'
import { ScrollToTopButton } from '@/components/ui/scroll-to-top-button'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite.landing')
  return {
    title: `${t('title')} | Cheque Check`,
    description: t('description'),
  }
}

const STEPS = [
  { key: 'stepRecord', icon: ScanIcon },
  { key: 'stepRemind', icon: Call02Icon },
  { key: 'stepTrack', icon: BankIcon },
] as const

const FEATURES = [
  'reminders',
  'cheques',
  'accounts',
  'parties',
  'reports',
] as const
const BOUNCE_STEPS = ['notice', 'payment', 'complaint'] as const

const FEATURE_ICONS = {
  reminders: Call02Icon,
  cheques: ScanIcon,
  accounts: BankIcon,
  parties: UserGroupIcon,
  reports: Download01Icon,
}

const GALLERY = [
  'dashboard',
  'scan',
  'cheques',
  'search',
  'reminders',
  'notifications',
  'accounts',
  'parties',
  'businesses',
  'tags',
  'reports',
  'language',
] as const

const PROBLEMS = ['dates', 'accounts', 'records', 'bounce'] as const
const SECURITY_POINTS = [
  { key: 'pin', icon: LockPasswordIcon },
  { key: 'access', icon: Shield01Icon },
  { key: 'storage', icon: File02Icon },
  { key: 'payment', icon: Payment01Icon },
] as const

export default async function LandingPage() {
  const t = await getTranslations('PublicSite.landing')
  const demoLink = getWhatsAppSupportLink(t('bookDemoMessage'))
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
  let products: PublicProduct[] = []
  let pricingFailed = false
  try {
    products = await publicPricingService.listProducts()
  } catch (error) {
    pricingFailed = true
    logger.error('Landing pricing catalogue could not be loaded', error)
  }

  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.earlyAccess}>{t('heroAudience')}</p>
          <h1 id="landing-title" aria-label={t('title')}>
            <span>{t('titleLead')}</span>
            <span className={styles.marked}>{t('titleHighlight')}</span>
          </h1>
          <p className={styles.heroDescription}>{t('description')}</p>
          <div className={styles.actions}>
            <AppEntryLink href="/signup" className={styles.primaryCta}>
              {t('primaryCta')}
              {arrow}
            </AppEntryLink>
            <a
              href={demoLink}
              target="_blank"
              rel="noreferrer"
              className={styles.secondaryCta}
            >
              <WhatsAppLogo />
              {t('secondaryCta')}
            </a>
          </div>
          <p className={styles.signupNote}>{t('trialNote')}</p>
          <p className={styles.heroReassurance}>{t('noBankConnection')}</p>
        </div>
        <ul className={styles.heroTrust} aria-label={t('trustTitle')}>
          {(['Calls', 'FirstCheque', 'Languages'] as const).map((key) => (
            <li key={key}>
              <strong>{t(`stat${key}Value`)}</strong>
              <span>{t(`stat${key}Label`)}</span>
            </li>
          ))}
          <li>
            <strong>
              <IndiaFlag
                title={t('statIndiaFlag')}
                className={styles.heroFlag}
              />
            </strong>
            <span>{t('statIndiaLabel')}</span>
          </li>
        </ul>
      </section>

      <section
        className={`${styles.section} ${styles.gallerySection}`}
        aria-labelledby="screenshots-title"
      >
        <div className={styles.sectionHeading}>
          <h2 id="screenshots-title">{t('screenshotsTitle')}</h2>
          <p>{t('screenshotsDescription')}</p>
        </div>
        <div className={styles.scenarioScroller}>
          <PillScroller
            floatingControls
            className={styles.phoneGallery}
            role="region"
            aria-label={t('screenshotsTitle')}
            tabIndex={0}
          >
            <figure
              id="product-demo"
              aria-label={t('videoLabel')}
              data-testid="landing-video"
              className={styles.phoneSlide}
            >
              <div className={`${styles.phoneFrame} ${styles.phoneVideo}`}>
                <DemoMedia kind="video" />
              </div>
              <figcaption>{t('videoTitle')}</figcaption>
            </figure>
            {GALLERY.map((key) => (
              <figure className={styles.phoneSlide} key={key}>
                <div className={styles.phoneFrame}>
                  <div className={styles.phoneScreen}>
                    <strong>{t(`gallery.${key}Title`)}</strong>
                    <p>{t('screenshotPending')}</p>
                  </div>
                </div>
                <figcaption>{t(`gallery.${key}Caption`)}</figcaption>
              </figure>
            ))}
          </PillScroller>
        </div>
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
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={File02Icon} size={14} aria-hidden="true" />
            {t('problemEyebrow')}
          </p>
          <h2 id="problem-title">{t('problemTitle')}</h2>
          <p>{t('problemDescription')}</p>
        </div>
        <div className={styles.problemGrid}>
          {PROBLEMS.map((key) => (
            <article key={key} className={styles.problemCard}>
              <figure className={styles.problemImage}>
                <Image
                  src="/assets/feature-placeholder.svg"
                  width={960}
                  height={540}
                  sizes="(max-width: 736px) 100vw, 320px"
                  alt={t('imagePlaceholder', {
                    feature: t(`problems.${key}Title`),
                  })}
                />
              </figure>
              <h3>{t(`problems.${key}Title`)}</h3>
              <p>{t(`problems.${key}Description`)}</p>
            </article>
          ))}
        </div>
        <div className={styles.problemClose}>
          <p>{t('problemClose')}</p>
        </div>
      </section>

      <section className={styles.bounceSection} aria-labelledby="bounce-title">
        <div className={styles.bounceInner}>
          <div className={styles.bounceCopy}>
            <p className={styles.bounceEyebrow}>
              <HugeiconsIcon
                icon={Calculator01Icon}
                size={14}
                aria-hidden="true"
              />
              {t('bounce.eyebrow')}
            </p>
            <h2 id="bounce-title">{t('bounce.title')}</h2>
            <p className={styles.bounceDescription}>
              {t('bounce.description')}
            </p>
            <ol className={styles.bounceSteps}>
              {BOUNCE_STEPS.map((key) => (
                <li key={key}>
                  <strong>{t(`bounce.${key}Value`)}</strong>
                  <span>{t(`bounce.${key}Label`)}</span>
                </li>
              ))}
            </ol>
            <div className={styles.bounceActions}>
              <Link href="/cheque-bounce" className={styles.bounceCta}>
                {t('bounce.cta')}
                {arrow}
              </Link>
              <p>{t('bounce.note')}</p>
            </div>
            <p className={styles.bounceDisclaimer}>{t('bounce.disclaimer')}</p>
          </div>
          <figure className={styles.bounceImage}>
            <Image
              src="/assets/feature-placeholder.svg"
              width={960}
              height={540}
              sizes="(max-width: 960px) 100vw, 520px"
              alt={t('imagePlaceholder', { feature: t('bounce.imageLabel') })}
            />
          </figure>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="how-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={ScanIcon} size={14} aria-hidden="true" />
            {t('howEyebrow')}
          </p>
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
        className={`${styles.section} ${styles.securitySection}`}
        aria-labelledby="security-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={Shield01Icon} size={14} aria-hidden="true" />
            {t('securityEyebrow')}
          </p>
          <h2 id="security-title">{t('securityTitle')}</h2>
          <p>{t('securityDescription')}</p>
        </div>
        <div className={styles.securityGrid}>
          {SECURITY_POINTS.map(({ key, icon }) => (
            <article key={key} className={styles.securityCard}>
              <span className={styles.securityIcon}>
                <PublicIcon icon={icon} size={20} />
              </span>
              <h3>{t(`security.${key}Title`)}</h3>
              <p>{t(`security.${key}Description`)}</p>
            </article>
          ))}
        </div>
        <p className={styles.securityDisclosure}>{t('securityDisclosure')}</p>
      </section>

      <section
        className={`${styles.section} ${styles.bentoSection}`}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={BankIcon} size={14} aria-hidden="true" />
            {t('featureEyebrow')}
          </p>
          <h2 id="features-title">{t('sectionTitle')}</h2>
          <p>{t('sectionDescription')}</p>
        </div>
        <div className={styles.bento}>
          {FEATURES.map((key) => (
            <article
              key={key}
              className={styles.featureCard}
              data-feature={key}
            >
              <div className={styles.featureCopy}>
                <h3>
                  <PublicIcon icon={FEATURE_ICONS[key]} size={24} />
                  {t(key)}
                </h3>
                <p>{t(`${key}Description`)}</p>
              </div>
              <figure className={styles.featurePlaceholder}>
                <Image
                  src="/assets/feature-placeholder.svg"
                  width={960}
                  height={540}
                  sizes="(max-width: 736px) 100vw, 900px"
                  alt={t('imagePlaceholder', { feature: t(key) })}
                />
              </figure>
              {key === 'reminders' && <DemoMedia kind="audio" />}
              {key === 'reports' && (
                <div className={styles.reportDownloads}>
                  <a
                    href="/assets/business-overview-sample-en.pdf"
                    download="cheque-check-sample-report-en.pdf"
                    className={styles.secondaryCta}
                  >
                    PDF
                    <HugeiconsIcon
                      icon={Download01Icon}
                      size={18}
                      aria-hidden="true"
                    />
                  </a>
                  <button
                    type="button"
                    className={styles.secondaryCta}
                    disabled
                  >
                    CSV
                    <HugeiconsIcon
                      icon={Download01Icon}
                      size={18}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
        <Link href="/features" className={styles.secondaryCta}>
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
          <p className={styles.eyebrow}>
            <HugeiconsIcon
              icon={Analytics01Icon}
              size={14}
              aria-hidden="true"
            />
            {t('pricingEyebrow')}
          </p>
          <h2 id="pricing-title">{t('pricingTitle')}</h2>
          <p>{t('pricingDescription')}</p>
        </div>
        <div className="mx-auto my-8 max-w-4xl">
          <p className={styles.earlyAccess}>{t('eyebrow')}</p>
          <PlanComparison
            products={products}
            loadFailed={pricingFailed}
            compact
          />
        </div>
        <div className={styles.pricingInner}>
          <AppEntryLink href="/signup" className={styles.primaryCta}>
            {t('primaryCta')}
            {arrow}
          </AppEntryLink>
          <p className={styles.signupNote}>{t('trialNote')}</p>
          <p className={styles.heroReassurance}>{t('noBankConnection')}</p>
          <Link href="/pricing" className={styles.secondaryCta}>
            <HugeiconsIcon icon={BankIcon} size={20} aria-hidden="true" />
            {t('pricingCta')}
            {arrow}
          </Link>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="faq-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={File02Icon} size={14} aria-hidden="true" />
            {t('faqEyebrow')}
          </p>
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
              'different',
              'privacy',
              'payment',
              'plans',
              'limit',
            ] as const
          ).map((key) => (
            <FaqItem
              key={key}
              question={t(`faq.${key}Question`)}
              answer={t(`faq.${key}Answer`)}
            />
          ))}
        </div>
        <p className={styles.faqContact}>
          <span>{t('faqContact')}</span>
          <Link href="/contact" className={styles.secondaryCta}>
            <HugeiconsIcon icon={File02Icon} size={20} aria-hidden="true" />
            {t('contactCta')}
            {arrow}
          </Link>
        </p>
      </section>

      <section
        className={`${styles.section} ${styles.installSection}`}
        aria-labelledby="install-title"
      >
        <div className={styles.installCopy}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon
              icon={SmartPhone01Icon}
              size={14}
              aria-hidden="true"
            />
            {t('installEyebrow')}
          </p>
          <h2 id="install-title">{t('installTitle')}</h2>
          <p>{t('installDescription')}</p>
          <ul>
            <li>{t('installStepOne')}</li>
            <li>{t('installStepTwo')}</li>
            <li>{t('installStepThree')}</li>
          </ul>
          <AppEntryLink href="/signup" className={styles.primaryCta}>
            {t('installCta')}
            {arrow}
          </AppEntryLink>
        </div>
        <figure className={styles.installPhone}>
          <Image
            src="/assets/install-phone-placeholder.svg"
            width={240}
            height={420}
            alt=""
          />
        </figure>
      </section>

      <section
        className={`${styles.section} ${styles.scenarioSection}`}
        aria-labelledby="scenarios-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <HugeiconsIcon icon={UserGroupIcon} size={14} aria-hidden="true" />
            {t('scenarioEyebrow')}
          </p>
          <h2 id="scenarios-title">{t('scenarioTitle')}</h2>
        </div>
        <div className={styles.scenarioScroller}>
          <PillScroller
            floatingControls
            className={styles.scenarios}
            role="region"
            aria-label={t('scenarioTitle')}
            tabIndex={0}
          >
            {(
              [
                ['owner', Shirt01Icon],
                ['accountant', UserGroupIcon],
                ['distributor', DeliveryBox01Icon],
                ['contractor', File02Icon],
                ['property', BankIcon],
                ['retailer', ScanIcon],
                ['manufacturer', Analytics01Icon],
              ] as const
            ).map(([key, icon], index) => (
              <article key={key} className={styles.scenarioCard}>
                <span className={styles.featureIcon}>
                  <PublicIcon icon={icon} size={26} aria-hidden="true" />
                </span>
                <h3>{t(`scenarios.${key}Need`)}</h3>
                <p>{t(`scenarios.${key}Benefit`)}</p>
                <div className={styles.scenarioPerson}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <div>
                    <strong>{t(`scenarios.${key}Role`)}</strong>
                    <span>{t(`scenarios.${key}Business`)}</span>
                  </div>
                </div>
              </article>
            ))}
          </PillScroller>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.finalSection}`}
        aria-labelledby="final-title"
      >
        <p className={styles.brand}>
          <PublicBrand />
        </p>
        <h2 id="final-title">{t('ctaTitle')}</h2>
        <p>{t('ctaDescription')}</p>
        <div className={`${styles.actions} ${styles.finalActions}`}>
          <AppEntryLink
            href="/signup"
            data-testid="landing-final-cta"
            className={styles.primaryCta}
          >
            {t('primaryCta')}
            {arrow}
          </AppEntryLink>
          <a
            href={demoLink}
            target="_blank"
            rel="noreferrer"
            className={styles.secondaryCta}
          >
            <WhatsAppLogo />
            {t('secondaryCta')}
          </a>
        </div>
        <span className={styles.finalNote}>{t('trialNote')}</span>
        <p className={styles.finalReassurance}>{t('noBankConnection')}</p>
      </section>
      <a
        href={demoLink}
        target="_blank"
        rel="noreferrer"
        className={styles.whatsAppWidget}
        aria-label={t('whatsAppWidgetLabel')}
        title={t('whatsAppWidgetLabel')}
      >
        <WhatsAppLogo />
      </a>
      <ScrollToTopButton className={styles.scrollToTop} />
    </main>
  )
}

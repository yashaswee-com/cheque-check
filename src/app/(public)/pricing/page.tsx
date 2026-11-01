import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { logger } from '@/lib/logger'
import { publicPricingService } from '@/features/public-site/services/public-pricing.service'
import type { PublicProduct } from '@/features/public-site/repositories/public-pricing.repository'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite')
  return { title: `${t('pricing.title')} | ChequeCheck` }
}

function price(product: PublicProduct) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: product.currency,
  }).format(product.amount / 100)
}

export default async function PublicPricingPage() {
  const t = await getTranslations('PublicSite')
  let products: PublicProduct[] = []
  let loadFailed = false

  try {
    products = await publicPricingService.listProducts()
  } catch (error) {
    loadFailed = true
    logger.error('Public pricing catalogue could not be loaded', error)
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('pricing.title')}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {t('pricing.description')}
        </p>
      </header>
      {loadFailed ? (
        <p role="alert" className="rounded-xl border bg-card p-6">
          {t('pricing.loadingError')}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-xl border bg-card p-6">{t('pricing.empty')}</p>
      ) : (
        <section
          aria-label={t('pricing.title')}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {products.map((product) => (
            <article
              key={product.id}
              className="flex flex-col gap-5 rounded-xl border bg-card p-6"
            >
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary">
                  {t(
                    `pricing.${product.transaction_type === 'lifetime' ? 'oneTime' : product.transaction_type === 'subscription' ? 'subscription' : 'topUp'}`,
                  )}
                </p>
                <h2 className="text-xl font-semibold">{product.name}</h2>
                <p className="text-3xl font-semibold tracking-tight">
                  {price(product)}
                </p>
              </div>
              <Link
                href={`/features/catalog?purchase=${encodeURIComponent(product.id)}`}
                className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-center font-semibold text-primary-foreground hover:opacity-90"
              >
                {t('pricing.purchase')}
              </Link>
            </article>
          ))}
        </section>
      )}
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t('pricing.catalogNote')}
      </p>
    </main>
  )
}

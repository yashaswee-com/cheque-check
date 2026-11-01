import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ContactForm } from '@/features/contact/components/contact-form'
import { getWhatsAppSupportLink } from '@/lib/whatsapp'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicSite')
  return { title: `${t('contact.title')} | ChequeCheck` }
}

export default async function PublicContactPage() {
  const t = await getTranslations('PublicSite')
  const whatsapp = getWhatsAppSupportLink(t('contact.whatsappText'))

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_0.8fr] lg:px-8">
      <header className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('contact.title')}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
          {t('contact.description')}
        </p>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-full border px-5 font-semibold hover:bg-muted"
        >
          {t('contact.whatsapp')}
        </a>
      </header>
      <ContactForm />
    </main>
  )
}

import { ChequeBounceTool } from '@/components/public-site/cheque-bounce-tool'
import { JsonLd } from '@/components/json-ld'
import { SITE_NAME, SITE_URL, publicPageMetadata } from '@/lib/seo'
import { CHEQUE_BOUNCE_FAQ_ITEMS } from '@/features/public-site/lib/cheque-bounce-faq'
import type { Metadata } from 'next'

const title = `Cheque Bounce Timeline Calculator – Section 138 | ${SITE_NAME}`
const description =
  'Calculate cheque bounce notice, payment and complaint deadlines in India, and understand the Section 138 process, compensation and common questions.'

export function generateMetadata(): Metadata {
  return publicPageMetadata({
    path: '/cheque-bounce',
    title,
    description,
  })
}

export default function ChequeBouncePage() {
  const faqData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/cheque-bounce#faq`,
    mainEntity: CHEQUE_BOUNCE_FAQ_ITEMS.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  }

  return (
    <>
      <JsonLd data={faqData} />
      <ChequeBounceTool />
    </>
  )
}

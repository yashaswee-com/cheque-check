import { listArticles } from '@/features/articles/repository'
import { SITE_NAME, SITE_URL } from '@/lib/seo'

const ARTICLE_GUIDE = `${SITE_URL}/en/articles`

export const AGENT_DISCOVERY_HEADERS = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
}

export async function llmsText() {
  const articles = await listArticles('en')
  const articleLinks = articles
    .map(
      (article) =>
        `- [${article.title}](${SITE_URL}${article.href}): ${article.description}`,
    )
    .join('\n')

  return `# ${SITE_NAME}

> Cheque Check is a browser-based cheque-management application for Indian businesses. It helps users record issued and received cheques, organize bank accounts and parties, plan reminders, and export reports.

## Important product boundaries

- Cheque Check does not connect to a user's bank account and does not move money.
- Records and reminders help planning; they do not verify bank clearance or guarantee that a cheque will not bounce.
- AI cheque scanning and phone-call reminders use separate credits and depend on account settings and service availability.
- Financial records and authenticated workflows are private and should not be inferred from this public discovery file.

## Public resources

- [Homepage](${SITE_URL}/): Product overview, FAQs, privacy summary, pricing overview, and signup entry.
- [Features](${SITE_URL}/features): Cheque records, accounts, parties, reminders, reports, search, and workflow features.
- [Pricing](${SITE_URL}/pricing): Current Free and Premium catalogue-backed pricing information.
- [Cheque bounce calculator](${SITE_URL}/cheque-bounce): Educational Section 138 timeline calculator and frequently asked questions. This is not legal advice.
- [Article index](${ARTICLE_GUIDE}): Searchable educational guides about cheque workflows.
- [Privacy policy](${SITE_URL}/privacy): Data handling, monitoring, analytics consent, and user-rights information.
- [Contact](${SITE_URL}/contact): Private support contact form and WhatsApp support.

## Articles

${articleLinks || `- [Article index](${ARTICLE_GUIDE}): Educational cheque-management guides.`}

## Optional

- [Sitemap](${SITE_URL}/sitemap.xml): Complete list of indexable public pages.
- [ARD manifest](${SITE_URL}/.well-known/ard.json): Agentic Resource Discovery manifest.
`
}

export function agenticResourceManifest() {
  const updatedAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
  return {
    '@context': 'https://agenticresourcediscovery.org/context/v1',
    specVersion: '0.91',
    entries: [
      {
        identifier: 'urn:air:chequecheck.in:skill:cheque-workflow',
        displayName: 'Cheque workflow guidance skill',
        type: 'text/markdown; profile="urn:air:agent-skills"',
        url: `${SITE_URL}/agent-skills/cheque-workflow.md`,
        capabilities: ['ArticleSearch', 'ChequeWorkflowGuidance'],
        description:
          'Public educational guidance for cheque records, reminders, bank accounts, issued cheques, and received cheques.',
        representativeQueries: [
          'how should a business track issued and received cheques',
          'how can I organize cheque records by bank account',
          'what is a practical cheque reminder workflow',
        ],
        tags: ['cheque-management', 'india', 'business-workflows'],
        updatedAt,
      },
      {
        identifier: 'urn:air:chequecheck.in:skill:cheque-bounce-timeline',
        displayName: 'Cheque bounce timeline guidance skill',
        type: 'text/markdown; profile="urn:air:agent-skills"',
        url: `${SITE_URL}/agent-skills/cheque-bounce-timeline.md`,
        capabilities: ['ChequeBounceTimeline', 'Section138Education'],
        description:
          'Interactive educational calculator for cheque bounce notice, payment, and complaint timelines in India.',
        representativeQueries: [
          'calculate a cheque bounce notice deadline in India',
          'when should a Section 138 complaint be filed',
        ],
        tags: ['cheque-bounce', 'section-138', 'calculator', 'india'],
        updatedAt,
      },
    ],
  }
}

export function chequeWorkflowSkill() {
  return `# Cheque workflow guidance

Use this guidance to help a business distinguish issued and received cheque records without accessing private data.

## Issued cheque

Record the payee, cheque number, date, amount, issuing business, and funding account. Plan sufficient funds before expected presentation.

## Received cheque

Record the payer, cheque number, date, amount, receiving business, and collection or deposit date. Follow the bank-confirmed outcome before treating it as cleared.

## Safety boundaries

- Never request bank credentials, PINs, passwords, or OTPs.
- Never claim a reminder confirms payment or bank clearance.
- Direct users with account-specific questions to the authenticated Cheque Check application.
- Use Cheque Check's public [cheque workflow guide](${SITE_URL}/en/articles/issued-vs-received-cheques) for supporting explanation.
`
}

export function chequeBounceSkill() {
  return `# Cheque bounce timeline guidance

Use this skill only to explain the general Section 138 timing workflow. It is educational information, not legal advice.

## Calculation sequence

1. Start from receipt of the bank return memo or confirmed cheque-bounce information.
2. Identify the statutory demand-notice deadline.
3. Allow the payment period specified by law.
4. Identify the following complaint-filing window when applicable.

## Safety boundaries

- Do not guarantee an outcome or provide a case-specific legal conclusion.
- Ask the user to verify dates and facts with a qualified legal professional.
- Use the public [cheque bounce calculator](${SITE_URL}/cheque-bounce) for its visible educational timeline and disclaimers.
`
}

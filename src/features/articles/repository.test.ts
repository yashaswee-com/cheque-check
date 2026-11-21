import { describe, expect, it } from 'vitest'
import { getArticle, listArticleTranslations, listArticles } from './repository'
import { articleLanguageAlternates } from './types'

describe('Markdown article repository', () => {
  it('publishes a searchable English article summary', async () => {
    const articles = await listArticles('en')
    expect(articles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'issued-vs-received-cheques',
          locale: 'en',
          slug: 'issued-vs-received-cheques',
          href: '/en/articles/issued-vs-received-cheques',
          status: 'published',
        }),
      ]),
    )
    expect(articles[0]).not.toHaveProperty('html')
  })

  it('renders Markdown safely and returns no unpublished locale article', async () => {
    const article = await getArticle('en', 'issued-vs-received-cheques')
    expect(article?.html).toContain(
      '<h2 id="user-content-the-simplest-difference">',
    )
    expect(article?.html).toContain('<table>')
    expect(article?.html).not.toContain('<script')
    expect(article?.headings).toEqual(
      expect.arrayContaining([
        {
          id: 'user-content-the-simplest-difference',
          text: 'The simplest difference',
          level: 2,
        },
        {
          id: 'user-content-mixing-the-party-and-the-bank',
          text: 'Mixing the party and the bank',
          level: 3,
        },
      ]),
    )
    await expect(getArticle('hi', 'issued-vs-received-cheques')).resolves.toBe(
      null,
    )
  })

  it('builds hreflang alternates only for published translations', async () => {
    const translations = await listArticleTranslations(
      'issued-vs-received-cheques',
    )
    expect(articleLanguageAlternates(translations)).toEqual({
      'en-IN': '/en/articles/issued-vs-received-cheques',
      'x-default': '/en/articles/issued-vs-received-cheques',
    })
  })
})

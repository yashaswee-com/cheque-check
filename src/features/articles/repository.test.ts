import { describe, expect, it } from 'vitest'
import { getArticle, listArticles } from './repository'

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
    await expect(getArticle('hi', 'issued-vs-received-cheques')).resolves.toBe(
      null,
    )
  })
})

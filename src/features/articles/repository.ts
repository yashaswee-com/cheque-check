import { readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { glob } from 'glob'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import { articleFrontmatterSchema } from './validators/article'
import type { Article, ArticleLocale, ArticleSummary } from './types'

const ARTICLE_ROOT = path.join(process.cwd(), 'content', 'articles')
const WORDS_PER_MINUTE = 220
type IndexedArticle = ArticleSummary & {
  file: string
  markdown: string
}

async function renderMarkdown(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown)

  return String(result)
}

function readingMinutes(markdown: string) {
  const words = markdown.trim().split(/\s+/u).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

async function readArticle(file: string): Promise<IndexedArticle> {
  const source = await readFile(file, 'utf8')
  const parsed = matter(source)
  const frontmatter = articleFrontmatterSchema.parse(parsed.data)
  const expectedDirectory = path.join(
    ARTICLE_ROOT,
    frontmatter.locale,
    frontmatter.category,
  )

  if (path.dirname(file) !== expectedDirectory) {
    throw new Error(`Article directory does not match its frontmatter: ${file}`)
  }
  if (path.basename(file, '.md') !== frontmatter.slug) {
    throw new Error(`Article filename does not match its slug: ${file}`)
  }

  return {
    ...frontmatter,
    href: `/${frontmatter.locale}/articles/${frontmatter.slug}`,
    readingMinutes: readingMinutes(parsed.content),
    file,
    markdown: parsed.content,
  }
}

let indexPromise: Promise<IndexedArticle[]> | undefined

async function buildIndex() {
  const files = await glob('**/*.md', {
    cwd: ARTICLE_ROOT,
    absolute: true,
  })
  const articles = await Promise.all(files.map(readArticle))
  const identities = new Set<string>()
  for (const article of articles) {
    const identity = `${article.locale}:${article.slug}`
    if (identities.has(identity)) {
      throw new Error(`Duplicate article identity: ${identity}`)
    }
    identities.add(identity)
  }
  return articles.sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) ||
      a.title.localeCompare(b.title),
  )
}

function getIndex() {
  indexPromise ??= buildIndex()
  return indexPromise
}

export async function listArticles(
  locale?: ArticleLocale,
): Promise<ArticleSummary[]> {
  return (await getIndex())
    .filter(
      (article) =>
        article.status === 'published' &&
        (!locale || article.locale === locale),
    )
    .map(({ file: _file, markdown: _markdown, ...summary }) => summary)
}

export async function getArticle(
  locale: ArticleLocale,
  slug: string,
): Promise<Article | null> {
  const summary = await getArticleSummary(locale, slug)
  if (!summary) return null
  const indexed = (await getIndex()).find(
    (article) => article.locale === locale && article.slug === slug,
  )
  if (!indexed) return null
  return {
    ...summary,
    html: await renderMarkdown(indexed.markdown),
  }
}

export async function getArticleSummary(
  locale: ArticleLocale,
  slug: string,
): Promise<ArticleSummary | null> {
  const article = (await getIndex()).find(
    (candidate) =>
      candidate.locale === locale &&
      candidate.slug === slug &&
      candidate.status === 'published',
  )
  if (!article) return null
  const { file: _file, markdown: _markdown, ...summary } = article
  return summary
}

export async function listAllPublishedArticles(): Promise<ArticleSummary[]> {
  return listArticles()
}

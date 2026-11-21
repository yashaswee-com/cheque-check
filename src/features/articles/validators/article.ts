import { z } from 'zod'
import { ARTICLE_LOCALES } from '../types'

const articleDateSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.iso.date(),
)

export const articleFrontmatterSchema = z.object({
  id: z.string().min(1),
  translationKey: z.string().min(1),
  locale: z.enum(ARTICLE_LOCALES),
  status: z.enum(['draft', 'published', 'archived']),
  category: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(10).max(90),
  description: z.string().min(80).max(170),
  publishedAt: articleDateSchema,
  updatedAt: articleDateSchema,
  author: z.string().min(1),
  reviewStatus: z.enum([
    'not-reviewed',
    'needs-review',
    'editorial-reviewed',
    'legal-reviewed',
  ]),
})

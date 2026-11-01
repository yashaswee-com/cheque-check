import { z } from 'zod'
export const announcementSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    author: z.string().min(1).max(120),
    content: z.object({
      en: z.string().min(1),
      hi: z.string().min(1),
      'hi-en': z.string().min(1),
    }),
    read: z.boolean(),
  })
  .nullable()

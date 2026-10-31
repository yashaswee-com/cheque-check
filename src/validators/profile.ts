import { z } from 'zod'

export const localeSchema = z.enum(['en', 'hi', 'hi-en'])
export const currencySchema = z.enum(['₹', '$', '€', '£'])
export const dateFormatSchema = z.enum([
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
])
export const timeFormatSchema = z.enum(['12h', '24h'])

export const closedProfileChoices = z
  .object({
    currency: currencySchema,
    date_format: dateFormatSchema,
    time_format: timeFormatSchema,
    language: localeSchema,
  })
  .partial()

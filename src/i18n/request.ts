import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { localeSchema } from '@/validators/profile'
import { logger } from '@/lib/logger'

export function browserLocale(header: string | null): 'en' | 'hi' | 'hi-en' {
  const preferences = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(';')
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith('q='),
      )
      const rawQuality = quality?.trim().slice(2)
      const q = rawQuality === undefined ? 1 : Number(rawQuality)
      return { tag: tag.toLowerCase(), q, index }
    })
    .filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  for (const { tag } of preferences) {
    if (tag === 'hi-en') return 'hi-en'
    if (/^hi(?:-|$)/.test(tag)) return 'hi'
    if (/^en(?:-|$)/.test(tag)) return 'en'
  }
  return 'hi-en'
}

export default getRequestConfig(async () => {
  const requestHeaders = await headers()
  const articleLocale = localeSchema.safeParse(
    requestHeaders.get('x-public-article-locale'),
  )
  if (articleLocale.success) {
    const locale = articleLocale.data
    return {
      locale,
      messages: (await import(`../../messages/${locale}.json`)).default,
    }
  }
  const cookieStore = await cookies()
  const requestedLocale = cookieStore.get('NEXT_LOCALE')?.value
  if (!requestedLocale) {
    const locale = browserLocale(requestHeaders.get('accept-language'))
    return {
      locale,
      messages: (await import(`../../messages/${locale}.json`)).default,
    }
  }
  const result = localeSchema.safeParse(requestedLocale)
  if (!result.success) logger.warn('Unsupported locale cookie; using Hinglish')
  const locale = result.success ? result.data : 'hi-en'

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})

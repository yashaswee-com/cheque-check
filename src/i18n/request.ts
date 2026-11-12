import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { localeSchema } from '@/validators/profile'
import { logger } from '@/lib/logger'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const requestedLocale = cookieStore.get('NEXT_LOCALE')?.value || 'hi-en'
  const result = localeSchema.safeParse(requestedLocale)
  if (!result.success) logger.warn('Unsupported locale cookie; using Hinglish')
  const locale = result.success ? result.data : 'hi-en'

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})

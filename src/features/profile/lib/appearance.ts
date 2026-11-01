import { logger } from '@/lib/logger'
import { appearanceSchema } from '@/validators/profile'
export type Appearance = 'light' | 'dark' | 'system'
export const APPEARANCE_KEY = 'chequecheck-appearance'
export function applyAppearance(appearance: Appearance) {
  const dark =
    appearance === 'dark' ||
    (appearance === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.documentElement.dataset.appearance = appearance
}
export function persistAppearance(appearance: Appearance) {
  applyAppearance(appearance)
  try {
    localStorage.setItem(APPEARANCE_KEY, appearance)
  } catch (error) {
    logger.error('Appearance could not be stored locally', error)
  }
}
export function storedAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY)
    if (value === null) return 'system'
    const result = appearanceSchema.safeParse(value)
    if (!result.success) {
      logger.error(
        'Invalid stored appearance',
        new Error('Invalid appearance preference'),
      )
      return 'system'
    }
    return result.data
  } catch (error) {
    logger.error('Appearance could not be read locally', error)
    return 'system'
  }
}
export const APPEARANCE_BOOTSTRAP = `(function(){var t='system';try{var v=localStorage.getItem('${APPEARANCE_KEY}');if(v==='light'||v==='dark'||v==='system')t=v;else if(v!==null)console.error('Invalid stored appearance')}catch(e){console.error('Appearance storage unavailable',e)}var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',!!d);document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.dataset.appearance=t})()`

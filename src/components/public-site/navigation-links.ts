import {
  Analytics01Icon,
  BankIcon,
  Calculator01Icon,
  Facebook01Icon,
  File02Icon,
  InstagramIcon,
  HelpCircleIcon,
  SecurityLockIcon,
} from '@hugeicons/core-free-icons'

export const PUBLIC_FACEBOOK_URL =
  'https://www.facebook.com/profile.php?id=61596274983042'

export const PUBLIC_NAV_LINKS = [
  {
    href: '/features',
    labelKey: 'features',
    icon: Analytics01Icon,
    group: 'product',
  },
  { href: '/pricing', labelKey: 'pricing', icon: BankIcon, group: 'product' },
  {
    href: '/privacy',
    labelKey: 'privacy',
    icon: SecurityLockIcon,
    group: 'support',
  },
  { href: '/contact', labelKey: 'contact', icon: File02Icon, group: 'support' },
  {
    href: '/cheque-bounce',
    labelKey: 'chequeBounce',
    icon: Calculator01Icon,
    group: 'resources',
  },
  {
    href: '/articles',
    labelKey: 'articles',
    icon: File02Icon,
    group: 'resources',
  },
  {
    href: 'https://chequecheck.gitbook.io/help',
    labelKey: 'helpCenter',
    icon: HelpCircleIcon,
    group: 'resources',
    external: true,
  },
  {
    href: 'https://www.instagram.com/cheque.check/',
    labelKey: 'instagram',
    icon: InstagramIcon,
    group: 'socials',
    external: true,
  },
  {
    href: PUBLIC_FACEBOOK_URL,
    labelKey: 'facebook',
    icon: Facebook01Icon,
    group: 'socials',
    external: true,
  },
] as const

export function localizedPublicHref(href: string, locale: string) {
  return href === '/articles' ? `/${locale}/articles` : href
}

export const PUBLIC_NAV_GROUPS = [
  'product',
  'resources',
  'support',
  'socials',
] as const

export const PUBLIC_NAV_GROUP_ICONS = {
  product: Analytics01Icon,
  resources: Calculator01Icon,
  support: SecurityLockIcon,
  socials: InstagramIcon,
} as const

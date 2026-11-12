import {
  Analytics01Icon,
  BankIcon,
  Calculator01Icon,
  File02Icon,
  SecurityLockIcon,
} from '@hugeicons/core-free-icons'

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
] as const

export const PUBLIC_NAV_GROUPS = ['product', 'resources', 'support'] as const

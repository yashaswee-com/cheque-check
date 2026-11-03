'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Home01Icon as Home,
  File02Icon as FileText,
  UserGroupIcon as Users,
  BankIcon as Landmark,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { getShellRoute } from '@/lib/navigation-routes'
import { useSoftwareKeyboard } from '@/hooks/use-software-keyboard'

const navItems = [
  { name: 'dashboard', href: '/dashboard', icon: Home },
  { name: 'cheques', href: '/cheques', icon: FileText },
  { name: 'parties', href: '/parties', icon: Users },
  { name: 'accounts', href: '/accounts', icon: Landmark },
]

export function BottomNav() {
  const pathname = usePathname()
  const t = useTranslations('Navigation')
  const ts = useTranslations('SharedUI')
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null)
  const keyboardOpen = useSoftwareKeyboard()

  // Reset optimistic path when actual pathname changes
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOptimisticPath(null)
  }

  // Only show bottom nav on main top-level routes
  const currentPath = optimisticPath || pathname
  const route = getShellRoute(pathname)

  if (!route.showBottomNav || keyboardOpen) {
    return null
  }

  return (
    <nav
      aria-label={ts('mainNavigation')}
      data-testid="bottom-nav"
      className="relative z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] w-full shrink-0 items-center justify-around bg-canvas-parchment/80 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:bg-black/80 border-t border-primary/5"
    >
      {navItems.map((item) => {
        const isActive = getShellRoute(currentPath).activeTab === item.href
        return (
          <Link
            key={item.name}
            href={item.href}
            data-testid={`bottom-nav-${item.name}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => setOptimisticPath(item.href)}
            className={cn(
              'flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-sm transition-all focus-visible:outline-2 focus-visible:outline-primary active:scale-95',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <HugeiconsIcon
              icon={item.icon}
              className={cn('h-5 w-5', isActive && 'stroke-[2.5px]')}
            />
            <span
              className={cn(
                'text-[10px] font-semibold tracking-tight',
                isActive ? 'opacity-100' : 'opacity-70',
              )}
            >
              {t(item.name)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

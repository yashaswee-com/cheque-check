'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon as Plus } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { getShellRoute } from '@/lib/navigation-routes'
import { useSoftwareKeyboard } from '@/hooks/use-software-keyboard'
import { useTranslations } from 'next-intl'

export function AppFab() {
  const pathname = usePathname()
  const { createHref } = getShellRoute(pathname)
  const keyboardOpen = useSoftwareKeyboard()
  const t = useTranslations('Common')

  if (!createHref || keyboardOpen) return null

  return (
    <Button
      render={<Link href={createHref} />}
      aria-label={t('add')}
      data-testid="app-fab-create"
      data-tour={createHref === '/cheques/create' ? 'add' : undefined}
      className="fixed bottom-[calc(5rem+var(--shell-bottom-extra,0px)+env(safe-area-inset-bottom))] right-6 h-16 w-16 rounded-full z-40 border-4 border-white dark:border-zinc-900"
      size="icon"
    >
      <HugeiconsIcon icon={Plus} className="h-8 w-8" />
    </Button>
  )
}

'use client'

import type { ReactNode } from 'react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslations } from 'next-intl'

export function AuthPageFrame({
  children,
  onBack,
}: {
  children: ReactNode
  onBack: () => void
}) {
  const t = useTranslations('Common')

  return (
    <main
      data-auth-page
      className="flex min-h-full w-full shrink-0 flex-col bg-gradient-to-b from-blue-50 to-white px-4 py-4 dark:from-slate-950 dark:to-black"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-blue-300"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
        {t('back')}
      </button>
      <div className="mx-auto my-auto w-full max-w-sm py-4">{children}</div>
    </main>
  )
}

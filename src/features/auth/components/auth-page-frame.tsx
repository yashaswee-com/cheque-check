'use client'

import type { ReactNode } from 'react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslations } from 'next-intl'

function BackContent({ label }: { label: string }) {
  return (
    <>
      <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
      {label}
    </>
  )
}

export function AuthPageFrame({
  children,
  onBack,
  backHref,
}: {
  children: ReactNode
  onBack?: () => boolean | void
  backHref: string
}) {
  const t = useTranslations('Common')
  const className =
    'inline-flex min-h-11 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-blue-300'

  return (
    <main
      data-auth-page
      className="flex min-h-full w-full shrink-0 flex-col bg-gradient-to-b from-blue-50 to-white px-4 py-4 dark:from-slate-950 dark:to-black"
    >
      <a
        href={backHref}
        data-app-entry
        onClick={(event) => {
          if (onBack?.()) event.preventDefault()
        }}
        className={className}
      >
        <BackContent label={t('back')} />
      </a>
      <div className="mx-auto my-auto w-full max-w-sm py-4 sm:py-8">
        {children}
      </div>
    </main>
  )
}

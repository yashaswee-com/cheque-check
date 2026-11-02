'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from './popover'

export function InfoPopover({
  title,
  children,
  positionerClassName,
}: {
  title: string
  children: ReactNode
  positionerClassName?: string
}) {
  const t = useTranslations('SharedUI')
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={t('moreInfo', { title })}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <HugeiconsIcon
          icon={InformationCircleIcon}
          className="size-4"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        positionerClassName={positionerClassName}
        className="max-w-[calc(100vw-2rem)] p-4"
      >
        <PopoverTitle>{title}</PopoverTitle>
        <PopoverDescription>{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}

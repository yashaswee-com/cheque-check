'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  render,
  nativeButton,
  ...props
}: PopoverPrimitive.Trigger.Props) {
  const isNativeButton =
    nativeButton ??
    (!render ||
      (React.isValidElement(render) &&
        (render.type === 'button' || render.type === Button)))
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      render={render}
      nativeButton={isNativeButton}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  backdrop = false,
  mobileSheet = true,
  positionerClassName,
  children,
  ...props
}: PopoverPrimitive.Popup.Props & {
  backdrop?: boolean
  mobileSheet?: boolean
  positionerClassName?: string
} & Pick<
    PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  const t = useTranslations('Common')
  return (
    <PopoverPrimitive.Portal>
      {(backdrop || mobileSheet) && (
        <PopoverPrimitive.Backdrop
          data-slot="popover-backdrop"
          className={cn(
            'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
            !backdrop && 'sm:hidden',
          )}
        />
      )}
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'isolate z-50',
          mobileSheet &&
            'max-sm:fixed! max-sm:inset-x-0! max-sm:bottom-0! max-sm:top-auto! max-sm:transform-none! max-sm:w-screen! max-sm:max-w-none!',
          positionerClassName,
        )}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground border border-primary/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
            mobileSheet &&
              'max-sm:w-full! max-sm:max-w-none! max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:rounded-b-none! max-sm:rounded-t-3xl! max-sm:origin-bottom max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:duration-200 max-sm:data-open:slide-in-from-bottom-full max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom-full max-sm:data-closed:zoom-out-100',
          )}
          {...props}
        >
          {mobileSheet && (
            <div className="relative flex h-8 shrink-0 items-center justify-center sm:hidden">
              <span aria-hidden className="h-1.5 w-12 rounded-full bg-muted" />
              <PopoverPrimitive.Close
                aria-label={t('close')}
                className="absolute right-2 flex size-8 items-center justify-center rounded-full hover:bg-muted"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </PopoverPrimitive.Close>
            </div>
          )}
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('font-normal', className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}

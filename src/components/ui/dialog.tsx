'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon as XIcon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  render,
  nativeButton,
  ...props
}: DialogPrimitive.Trigger.Props) {
  const isNativeButton =
    nativeButton ??
    (!render ||
      (React.isValidElement(render) &&
        (render.type === 'button' || render.type === Button)))
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={render}
      nativeButton={isNativeButton}
      {...props}
    />
  )
}

function DialogClose({
  render,
  nativeButton,
  ...props
}: DialogPrimitive.Close.Props) {
  const isNativeButton =
    nativeButton ??
    (!render ||
      (React.isValidElement(render) &&
        (render.type === 'button' || render.type === Button)))
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={render}
      nativeButton={isNativeButton}
      {...props}
    />
  )
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  scrollable = false,
  mobileSheet = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  overlayClassName?: string
  scrollable?: boolean
  mobileSheet?: boolean
}) {
  const t = useTranslations('Common')

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          scrollable && 'flex max-h-[90dvh] flex-col overflow-hidden',
          className,
          mobileSheet &&
            'max-sm:top-auto! max-sm:bottom-0! max-sm:left-0! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-x-0! max-sm:translate-y-0! max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:rounded-b-none! max-sm:rounded-t-3xl! max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:duration-200 max-sm:data-open:slide-in-from-bottom-full max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom-full max-sm:data-closed:zoom-out-100',
        )}
        {...props}
      >
        {mobileSheet && (
          <div
            aria-hidden
            className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-muted sm:hidden"
          />
        )}
        {scrollable ? (
          <div
            data-slot="dialog-scroll-viewport"
            className="scroll-fade-y scroll-fade-4 no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain"
          >
            {children}
          </div>
        ) : (
          children
        )}
        {showCloseButton && (
          <DialogClose
            data-slot="dialog-close"
            nativeButton
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 rounded-full"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={XIcon} className="h-4 w-4" />
            <span className="sr-only">{t('close')}</span>
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose nativeButton render={<Button variant="outline" />}>
          Close
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-lg leading-none font-bold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { MetaPixelConsentProps } from './meta-pixel-consent'

export type MarketingConsentSettingsProps = MetaPixelConsentProps & {
  open: boolean
  activeTab: 'settings' | 'about'
  marketingChoice: boolean
  showMarketingDetails: boolean
  storageError: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onActiveTabChange: (tab: 'settings' | 'about') => void
  onMarketingChoiceChange: (checked: boolean) => void
  onShowMarketingDetailsChange: (show: boolean) => void
  onChoose: (choice: 'accepted' | 'rejected') => void
}

export function MarketingConsentSettings(props: MarketingConsentSettingsProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onOpenChangeRef = useRef(props.onOpenChange)
  const t = useTranslations('Common')

  useEffect(() => {
    onOpenChangeRef.current = props.onOpenChange
  }, [props.onOpenChange])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChangeRef.current(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  if (!props.open) return null

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/10 sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.settingsLabel}
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 sm:max-w-3xl sm:rounded-xl"
        data-testid="cookie-settings-dialog"
      >
        <header className="relative space-y-2 border-b p-5 pr-14 pb-4 sm:p-7 sm:pr-14 sm:pb-5">
          <h2 className="font-heading text-lg leading-none font-bold">
            {props.settingsLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            {props.settingsDescription}
          </p>
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            aria-label={t('close')}
            className="absolute top-3 right-3 grid size-10 place-items-center rounded-full text-xl hover:bg-muted"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <nav
          aria-label={props.settingsLabel}
          className="flex shrink-0 gap-6 border-b px-5 sm:px-7"
        >
          <button
            type="button"
            aria-pressed={props.activeTab === 'settings'}
            onClick={() => props.onActiveTabChange('settings')}
            className="border-b-2 border-transparent py-3 text-sm font-medium aria-pressed:border-primary"
          >
            {props.settingsLabel}
          </button>
          <button
            type="button"
            aria-pressed={props.activeTab === 'about'}
            onClick={() => props.onActiveTabChange('about')}
            className="border-b-2 border-transparent py-3 text-sm font-medium aria-pressed:border-primary"
          >
            {props.aboutLabel}
          </button>
        </nav>
        <div className="no-scrollbar overflow-y-auto overscroll-contain">
          {props.activeTab === 'settings' ? (
            <div
              role="region"
              aria-label={props.settingsLabel}
              className="space-y-4 p-5 sm:p-7"
            >
              <section className="space-y-2 rounded-2xl border p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-medium">
                    {props.essentialTitle}
                  </h3>
                  <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {props.alwaysActive}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {props.essentialDescription}
                </p>
              </section>
              <section className="space-y-3 rounded-2xl border p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="cookie-marketing"
                    className="text-sm font-medium"
                  >
                    {props.marketingTitle}
                  </label>
                  <input
                    id="cookie-marketing"
                    type="checkbox"
                    role="switch"
                    checked={props.marketingChoice}
                    aria-checked={props.marketingChoice}
                    disabled={props.saving}
                    onChange={(event) =>
                      props.onMarketingChoiceChange(event.target.checked)
                    }
                    className="size-5 cursor-pointer accent-primary disabled:cursor-not-allowed"
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {props.marketingDescription}
                </p>
                <button
                  type="button"
                  aria-expanded={props.showMarketingDetails}
                  onClick={() =>
                    props.onShowMarketingDetailsChange(
                      !props.showMarketingDetails,
                    )
                  }
                  className="text-sm underline underline-offset-4"
                >
                  {props.showMarketingDetails
                    ? props.hideDetails
                    : props.showDetails}
                </button>
                {props.showMarketingDetails && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {props.marketingDetails}
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div
              role="region"
              aria-label={props.aboutLabel}
              className="space-y-3 p-5 sm:p-7"
            >
              <h3 className="text-base font-medium">{props.aboutTitle}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {props.aboutDescription}
              </p>
              <Link
                href="/privacy"
                className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
              >
                {props.privacyLink}
              </Link>
            </div>
          )}
        </div>
        {props.storageError && (
          <p
            role="alert"
            className="px-5 pb-3 text-sm text-destructive sm:px-7"
          >
            {props.saveError}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            disabled={props.saving}
            onClick={() => props.onChoose('rejected')}
            className="min-h-10 rounded-sm border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {props.rejectOptional}
          </button>
          <button
            type="button"
            disabled={props.saving}
            onClick={() =>
              props.onChoose(props.marketingChoice ? 'accepted' : 'rejected')
            }
            className="min-h-10 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {props.savePreferences}
          </button>
        </div>
      </div>
    </div>
  )
}

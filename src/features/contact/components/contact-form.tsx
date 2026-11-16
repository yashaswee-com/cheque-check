'use client'

import { FormLabel } from '@/components/ui/form-label'
import { UserIcon, Mail01Icon, Comment01Icon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { useContact } from '@/features/contact/hooks/use-contact'

export function ContactForm() {
  const t = useTranslations('PublicSite')
  const { state, submit, reset } = useContact()
  const busy = state === 'sending'
  const feedback =
    state === 'success'
      ? t('contact.success')
      : state === 'rate_limited'
        ? t('contact.rateLimited')
        : state === 'failure'
          ? t('contact.failure')
          : null

  return (
    <form
      data-clarity-mask="true"
      data-sentry-mask
      className="space-y-5 rounded-xl border bg-card p-5 sm:p-8"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        const form = event.currentTarget
        const values = new FormData(form)
        const sent = await submit({
          name: String(values.get('name') ?? ''),
          email: String(values.get('email') ?? ''),
          message: String(values.get('message') ?? ''),
        })
        if (sent) {
          form.reset()
        }
      }}
      onChange={() => {
        if (state === 'success' || state === 'failure') reset()
      }}
    >
      <div className="space-y-2">
        <FormLabel
          icon={UserIcon}
          className="text-sm font-medium"
          htmlFor="contact-name"
          is_required
        >
          {t('contact.name')}
        </FormLabel>
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          maxLength={100}
          required
          disabled={busy}
          className="min-h-12 w-full rounded-md border bg-background px-3"
          placeholder={t('contact.namePlaceholder')}
        />
      </div>
      <div className="space-y-2">
        <FormLabel
          icon={Mail01Icon}
          className="text-sm font-medium"
          htmlFor="contact-email"
          is_required
        >
          {t('contact.email')}
        </FormLabel>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={busy}
          className="min-h-12 w-full rounded-md border bg-background px-3"
          placeholder={t('contact.emailPlaceholder')}
        />
      </div>
      <div className="space-y-2">
        <FormLabel
          icon={Comment01Icon}
          className="text-sm font-medium"
          htmlFor="contact-message"
          is_required
        >
          {t('contact.message')}
        </FormLabel>
        <textarea
          id="contact-message"
          name="message"
          minLength={10}
          maxLength={5000}
          rows={6}
          required
          disabled={busy}
          className="w-full resize-y rounded-md border bg-background px-3 py-3"
          placeholder={t('contact.messagePlaceholder')}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {busy ? t('contact.sending') : t('contact.submit')}
      </button>
      {feedback && (
        <p
          role={state === 'success' ? 'status' : 'alert'}
          aria-live="polite"
          className="text-sm leading-relaxed"
        >
          {feedback}
        </p>
      )}
    </form>
  )
}

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Mail01Icon as Mail,
  HelpCircleIcon as WhatsApp,
} from '@hugeicons/core-free-icons'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { getWhatsAppSupportLink } from '@/lib/whatsapp'
import { FaqExplorer } from '@/features/faqs/components/faq-explorer'

export default function HelpAndSupportPage() {
  const t = useTranslations('Settings')
  const feedback = useTranslations('Feedback')

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="space-y-8 px-2">
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="mailto:support@chequecheck.com"
            className="flex flex-col items-center justify-center p-6 rounded-lg border bg-card hover:bg-muted/30 transition-all space-y-2 text-center"
          >
            <HugeiconsIcon icon={Mail} className="h-8 w-8 text-primary" />
            <span className="font-bold">{t('emailUs')}</span>
            <span className="text-xs text-muted-foreground">
              {t('getHelpViaEmail')}
            </span>
          </Link>
          <a
            href={getWhatsAppSupportLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center p-6 rounded-lg border bg-card hover:bg-muted/30 transition-all space-y-2 text-center"
          >
            <HugeiconsIcon icon={WhatsApp} className="h-8 w-8 text-primary" />
            <span className="font-bold">{t('chatOnWhatsApp')}</span>
            <span className="text-xs text-muted-foreground">
              {t('getHelpViaWhatsApp')}
            </span>
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/feedback"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            {feedback('submitTitle')}
          </Link>
          <Link
            href="/roadmap"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            {feedback('roadmapTitle')}
          </Link>
        </div>

        <FaqExplorer />

        <div className="rounded-lg bg-primary/5 border border-primary/20 p-6 text-center space-y-2">
          <h3 className="font-bold">{t('stillNeedHelp')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('supportAvailability')}
          </p>
          <a
            href={getWhatsAppSupportLink()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="mt-4 rounded-full">
              {t('contactSupport')}
            </Button>
          </a>
        </div>
      </div>
    </div>
  )
}

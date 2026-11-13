import type { Cheque, ChequeStatus, Party, Profile } from '@/types'
import { partyService } from '@/features/parties/services/party.service'
import { verifyLifetimePremium } from '@/features/monetization/services/premium-authorization'
import { toast } from '@/components/ui/toast'
import {
  getMessageTemplate,
  renderMessageTemplate,
  type MessageValues,
} from '@/features/premium-workspace/services/workspace.service'
import { businessService } from '@/features/businesses/services/business.service'
import {
  createPreferenceFormatter,
  type FormattingPreferences,
} from '@/lib/preference-format'
import { createTranslator } from 'next-intl'
import englishMessages from '../../../../messages/en.json'
import hindiMessages from '../../../../messages/hi.json'
import hinglishMessages from '../../../../messages/hi-en.json'

type MessageCheque = Pick<
  Cheque,
  'cheque_number' | 'amount' | 'cheque_date' | 'status'
> &
  Partial<Pick<Cheque, 'business_id'>>

export function buildChequeUpdateMessage(
  cheque: MessageCheque,
  party: Pick<Party, 'name'>,
  currency: string,
  status: ChequeStatus = cheque.status,
  template?: string | null,
  businessName = 'ChequeCheck',
  preferences?: FormattingPreferences | null,
): string {
  const display = createPreferenceFormatter(preferences)
  const language = preferences?.language || 'en'
  const messages =
    language === 'hi'
      ? hindiMessages
      : language === 'hi-en'
        ? hinglishMessages
        : englishMessages
  const t = createTranslator({
    locale: language,
    messages: messages.PremiumWorkspace,
  })
  const values: MessageValues = {
    party: party.name,
    cheque_number: cheque.cheque_number,
    amount: display.currency(cheque.amount, currency),
    date: display.date(cheque.cheque_date),
    status: t(`statuses.${status}`),
    business: businessName,
  }
  return template
    ? renderMessageTemplate(template, values)
    : t('defaultMessage', values)
}

export function buildSmsLink(phone: string, message: string): string {
  return `sms:${phone}?body=${encodeURIComponent(message)}`
}

export function openPartySms(phone: string, message: string): void {
  window.location.href = buildSmsLink(phone, message)
}

export function isPartySmsEnabled(
  profile: Pick<Profile, 'party_sms_enabled'> | null | undefined,
): boolean {
  return profile?.party_sms_enabled === true
}

export interface NotifyPartyActionProps {
  children: string
  onClick: () => void
}

/** Resolves an SMS toast action for a cheque's party, or undefined if the party has no phone. */
export async function buildNotifyPartyAction(
  cheque: Pick<
    Cheque,
    'party_id' | 'cheque_number' | 'amount' | 'cheque_date' | 'status'
  > &
    Partial<Pick<Cheque, 'business_id'>>,
  profile:
    | (FormattingPreferences & Pick<Profile, 'party_sms_enabled'>)
    | null
    | undefined,
  label: string,
  canNotify = false,
  accessRequiredMessage = label,
): Promise<NotifyPartyActionProps | undefined> {
  if (!canNotify || !isPartySmsEnabled(profile)) return undefined
  const currency = profile?.currency || '₹'
  try {
    const party = await partyService.getById(cheque.party_id)
    if (!party.contact) return undefined
    return {
      children: label,
      onClick: () => {
        void preparePartySms(
          label,
          party.contact,
          cheque,
          party,
          currency,
          accessRequiredMessage,
          profile,
        )
      },
    }
  } catch (error) {
    toast.add({
      title: label,
      description: error instanceof Error ? error.message : label,
      type: 'error',
    })
    return undefined
  }
}

export async function preparePartySms(
  title: string,
  phone: string,
  cheque: Parameters<typeof buildChequeUpdateMessage>[0],
  party: Parameters<typeof buildChequeUpdateMessage>[1],
  currency: string,
  accessRequiredMessage = title,
  preferences?: FormattingPreferences | null,
): Promise<void> {
  try {
    if (!(await verifyLifetimePremium())) {
      toast.add({
        title,
        description: accessRequiredMessage,
        type: 'info',
      })
      return
    }
    const template = await getMessageTemplate(cheque.business_id)
    const business =
      template?.includes('{business}') && cheque.business_id
        ? await businessService.getById(cheque.business_id)
        : null
    openPartySms(
      phone,
      buildChequeUpdateMessage(
        cheque,
        party,
        currency,
        cheque.status,
        template,
        business?.name,
        preferences,
      ),
    )
  } catch (error) {
    toast.add({
      title,
      description: error instanceof Error ? error.message : title,
      type: 'error',
    })
  }
}

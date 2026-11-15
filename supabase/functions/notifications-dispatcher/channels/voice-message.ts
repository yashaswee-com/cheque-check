import { numberToHindiWords } from '../../_shared/hindi-numbers.ts'
import type { DispatchCheque } from '../types.ts'

const CURRENCY_CODES: Record<string, string> = {
  '₹': 'INR',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
}

function formatCurrency(
  amount: number,
  currency: string | null,
  language: string,
) {
  const usesHindi = language === 'hi' || language === 'hi-en'
  const formatted = new Intl.NumberFormat(usesHindi ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: CURRENCY_CODES[currency ?? '₹'] ?? 'INR',
    currencyDisplay: 'name',
    ...(usesHindi ? { minimumFractionDigits: 0 } : {}),
  }).format(amount)
  if (!usesHindi) return formatted

  return formatted.replace(/[\d,]+(?:\.\d+)?/g, (digits) => {
    const [integer, fraction] = digits.replaceAll(',', '').split('.')
    const words = numberToHindiWords(Number(integer))
    return fraction
      ? `${words} दशमलव ${Array.from(fraction, (digit) => numberToHindiWords(Number(digit))).join(' ')}`
      : words
  })
}

export function renderVoiceReminderMessage(
  name: string,
  cheques: DispatchCheque[],
  language: string,
  currency: string | null,
): string {
  const banks: Record<string, { count: number; total: number }> = {}
  cheques.forEach((cheque) => {
    const bankName = cheque.account?.bank?.name || 'Unknown Bank'
    if (!banks[bankName]) banks[bankName] = { count: 0, total: 0 }
    banks[bankName].count++
    banks[bankName].total += Number(cheque.amount)
  })

  if (language === 'hi') {
    const bankSummaries = Object.entries(banks)
      .map(
        ([bank, data]) =>
          `${bank} में ${numberToHindiWords(data.count)} चेक, कुल ${formatCurrency(data.total, currency, language)}`,
      )
      .join(', और ')

    return `नमस्ते ${name}, यह चेक चेक की तरफ से एक रिमाइंडर है। आज आपके ${bankSummaries} आ रहे हैं। कृपया सुनिश्चित करें कि आपके बैंक खाते में पर्याप्त बैलेंस है।`
  }

  if (language === 'hi-en') {
    const bankSummaries = Object.entries(banks)
      .map(
        ([bank, data]) =>
          `${numberToHindiWords(data.count)} cheque${data.count > 1 ? 's' : ''} ${bank} mein, total ${formatCurrency(data.total, currency, language)}`,
      )
      .join(', aur ')

    return `Namaste ${name}, Cheque Check ki taraf se reminder. Aaj ${bankSummaries} aa rahe hain. Please ensure aapke bank account mein sufficient balance hai.`
  }

  const bankSummaries = Object.entries(banks)
    .map(
      ([bank, data]) =>
        `${data.count} cheque${data.count > 1 ? 's' : ''} hitting ${bank} for a total of ${formatCurrency(data.total, currency, language)}`,
    )
    .join(', and ')

  return `Hello ${name}, this is a reminder from Cheque Check. You have ${bankSummaries} today. Please ensure your accounts are sufficiently funded.`
}

export function renderVoiceSampleMessage(name: string, language: string) {
  if (language === 'hi') {
    return `नमस्ते ${name}, यह चेक चेक की तरफ से एक टेस्ट कॉल है। अगर आपने यह कॉल सुनी, तो आपकी वॉइस रिमाइंडर सेटिंग सही से काम कर रही है।`
  }

  if (language === 'hi-en') {
    return `Namaste ${name}, yeh Cheque Check ki taraf se ek test call hai. Agar aapko yeh call sunai de rahi hai, to aapka Voice Reminder setup sahi kaam kar raha hai.`
  }

  return `Hello ${name}, this is a test call from Cheque Check. If you can hear this, your Voice Reminder setup is working correctly.`
}

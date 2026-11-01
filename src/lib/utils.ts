import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_WORDS: Record<string, string> = {
  '₹': 'Rupees',
  $: 'Dollars',
  '€': 'Euros',
  '£': 'Pounds',
}

const HINDI_NUMBERS = [
  'शून्य',
  'एक',
  'दो',
  'तीन',
  'चार',
  'पाँच',
  'छह',
  'सात',
  'आठ',
  'नौ',
  'दस',
  'ग्यारह',
  'बारह',
  'तेरह',
  'चौदह',
  'पंद्रह',
  'सोलह',
  'सत्रह',
  'अठारह',
  'उन्नीस',
  'बीस',
  'इक्कीस',
  'बाईस',
  'तेईस',
  'चौबीस',
  'पच्चीस',
  'छब्बीस',
  'सत्ताईस',
  'अट्ठाईस',
  'उनतीस',
  'तीस',
  'इकतीस',
  'बत्तीस',
  'तैंतीस',
  'चौंतीस',
  'पैंतीस',
  'छत्तीस',
  'सैंतीस',
  'अड़तीस',
  'उनतालीस',
  'चालीस',
  'इकतालीस',
  'बयालीस',
  'तैंतालीस',
  'चवालीस',
  'पैंतालीस',
  'छियालीस',
  'सैंतालीस',
  'अड़तालीस',
  'उनचास',
  'पचास',
  'इक्यावन',
  'बावन',
  'तिरपन',
  'चौवन',
  'पचपन',
  'छप्पन',
  'सत्तावन',
  'अट्ठावन',
  'उनसठ',
  'साठ',
  'इकसठ',
  'बासठ',
  'तिरसठ',
  'चौंसठ',
  'पैंसठ',
  'छियासठ',
  'सड़सठ',
  'अड़सठ',
  'उनहत्तर',
  'सत्तर',
  'इकहत्तर',
  'बहत्तर',
  'तिहत्तर',
  'चौहत्तर',
  'पचहत्तर',
  'छिहत्तर',
  'सतहत्तर',
  'अठहत्तर',
  'उनासी',
  'अस्सी',
  'इक्यासी',
  'बयासी',
  'तिरासी',
  'चौरासी',
  'पचासी',
  'छियासी',
  'सत्तासी',
  'अट्ठासी',
  'नवासी',
  'नब्बे',
  'इक्यानवे',
  'बानवे',
  'तिरानवे',
  'चौरानवे',
  'पंचानवे',
  'छियानवे',
  'सत्तानवे',
  'अट्ठानवे',
  'निन्यानवे',
]

export function numberToIndianWords(
  num: number,
  currency = '₹',
  language = 'en',
): string {
  if (language === 'hi') {
    const units: Record<string, string> = {
      '₹': 'रुपये',
      $: 'डॉलर',
      '€': 'यूरो',
      '£': 'पाउंड',
    }
    const unit = units[currency] ?? units['₹']
    const convert = (value: number): string => {
      if (value < 100) return HINDI_NUMBERS[value]
      for (const [scale, label] of [
        [10000000, 'करोड़'],
        [100000, 'लाख'],
        [1000, 'हज़ार'],
        [100, 'सौ'],
      ] as const) {
        if (value >= scale) {
          const remainder = value % scale
          return `${convert(Math.floor(value / scale))} ${label}${remainder ? ` ${convert(remainder)}` : ''}`
        }
      }
      return HINDI_NUMBERS[0]
    }
    return `${convert(Number.isFinite(num) && num > 0 ? Math.floor(num) : 0)} ${unit} मात्र`
  }
  const unit = CURRENCY_WORDS[currency] ?? 'Rupees'
  if (!Number.isFinite(num) || num <= 0) return `Zero ${unit} Only`
  num = Math.floor(num)

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ]

  function convert(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '')
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        ' Hundred' +
        (n % 100 !== 0 ? ' and ' + convert(n % 100) : '')
      )
    return (
      convert(Math.floor(n / 1000)) +
      ' Thousand' +
      (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '')
    )
  }

  let result = ''

  const crores = Math.floor(num / 10000000)
  num %= 10000000
  if (crores > 0) result += convert(crores) + ' Crore '

  const lakhs = Math.floor(num / 100000)
  num %= 100000
  if (lakhs > 0) result += convert(lakhs) + ' Lakh '

  const thousands = Math.floor(num / 1000)
  num %= 1000
  if (thousands > 0) result += convert(thousands) + ' Thousand '

  if (num > 0) result += convert(num)

  // Handle paise if any (optional based on need, but keeping it simple for now)
  return `${result.trim()} ${unit} Only`
}

export function getSimilarityScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null))

  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      )
    }
  }

  const distance = track[s2.length][s1.length]
  const maxLength = Math.max(s1.length, s2.length)

  return (maxLength - distance) / maxLength
}

import type { CountryCode } from 'libphonenumber-js'
import { toE164 } from '@/lib/phone'

type PartyMatchCandidate = {
  id: string
  name: string
  contact: string | null
}

export function findPossiblePartyDuplicates(
  parties: PartyMatchCandidate[],
  name: string,
  contact: string,
  defaultCountry: CountryCode,
): string[] {
  const normalizedName = name.trim().normalize('NFKC').toLocaleLowerCase()
  const normalizedPhone =
    toE164(contact, defaultCountry) ?? contact.replace(/\D/g, '')
  const matches = new Set<string>()

  for (const party of parties) {
    const sameName =
      normalizedName.length > 0 &&
      party.name.trim().normalize('NFKC').toLocaleLowerCase() === normalizedName
    const partyPhone =
      toE164(party.contact, defaultCountry) ??
      (party.contact ?? '').replace(/\D/g, '')
    const samePhone =
      normalizedPhone.length >= 7 &&
      partyPhone.length >= 7 &&
      partyPhone === normalizedPhone
    if (sameName || samePhone) matches.add(party.name)
  }

  return [...matches]
}

import { getAllCountries } from 'countries-and-timezones'

export const DEFAULT_COUNTRY_CODE = 'IN'

export interface CountryOption {
  code: string
  name: string
}

let cached: CountryOption[] | undefined

/** All ISO 3166-1 alpha-2 countries, default country first, then by name. */
export function countryOptions(): CountryOption[] {
  cached ??= Object.values(getAllCountries())
    .map(({ id, name }) => ({ code: id, name }))
    .sort((a, b) =>
      a.code === DEFAULT_COUNTRY_CODE
        ? -1
        : b.code === DEFAULT_COUNTRY_CODE
          ? 1
          : a.name.localeCompare(b.name),
    )
  return cached
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null
  return countryOptions().find((country) => country.code === code)?.name ?? null
}

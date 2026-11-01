import {
  parse,
  TYPE,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import hi from '../../messages/hi.json'
import hinglish from '../../messages/hi-en.json'

type Catalog = { [key: string]: string | Catalog }

function flatten(catalog: Catalog, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return typeof value === 'string'
        ? [[path, value]]
        : Object.entries(flatten(value, path))
    }),
  )
}

function placeholderContract(message: string): string[] {
  const contract = new Set<string>()
  function visit(elements: MessageFormatElement[]) {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue
      contract.add(`${element.value}:${TYPE[element.type]}`)
      if (element.type === TYPE.tag) visit(element.children)
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        const selectors = Object.keys(element.options)
          .filter(
            (selector) =>
              element.type === TYPE.select || selector.startsWith('='),
          )
          .sort()
        contract.add(`${element.value}:selectors:${selectors.join(',')}`)
        if (element.type === TYPE.plural) {
          contract.add(
            `${element.value}:${element.pluralType}:offset:${element.offset}`,
          )
        }
        for (const option of Object.values(element.options)) visit(option.value)
      }
    }
  }
  visit(parse(message))
  return [...contract].sort()
}

const english = flatten(en)
const catalogs = { en: english, hi: flatten(hi), 'hi-en': flatten(hinglish) }

describe('translation catalogs', () => {
  it.each(Object.entries(catalogs))(
    '%s has exactly the English flattened keys, irrespective of ordering',
    (_locale, catalog) => {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort())
    },
  )

  it.each(Object.entries(catalogs))(
    '%s contains valid ICU messages with compatible placeholders',
    (locale, catalog) => {
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.trim(), `${locale}.${key} must not be empty`).not.toBe(
          '',
        )
        expect(
          placeholderContract(message),
          `${locale}.${key} placeholder contract`,
        ).toEqual(placeholderContract(english[key]))
      }
    },
  )

  it('translates all Common Hindi UI text except brand names', () => {
    for (const [key, message] of Object.entries(hi.Common)) {
      if (key === 'google' || key === 'facebook') {
        expect(message).toBe(en.Common[key])
      } else {
        expect(message, `Common.${key}`).not.toBe(
          en.Common[key as keyof typeof en.Common],
        )
        expect(message, `Common.${key}`).toMatch(/[\u0900-\u097f]/u)
      }
    }
  })

  it('preserves Hindi plural branches and numeric substitution', () => {
    for (const key of [
      'Onboarding.remindersPerDay',
      'Onboarding.reminderDays',
      'Settings.daysBefore',
      'Drafts.pendingSummary',
      'Tags.usageCount',
    ]) {
      const plural = parse(catalogs.hi[key]).find(
        (element) => element.type === TYPE.plural,
      )
      expect(plural?.type, key).toBe(TYPE.plural)
      if (plural?.type === TYPE.plural) {
        expect(Object.keys(plural.options).sort(), key).toEqual(
          Object.keys(
            (
              parse(english[key]).find(
                (element) => element.type === TYPE.plural,
              ) as Extract<MessageFormatElement, { type: TYPE.plural }>
            ).options,
          ).sort(),
        )
        if (key === 'Settings.daysBefore' || key === 'Tags.usageCount') {
          expect(
            plural.options.other.value.some(
              (element) => element.type === TYPE.pound,
            ),
            key,
          ).toBe(true)
        }
      }
    }
  })

  it('preserves sample identities, brands and machine-readable formats', () => {
    expect(hi.Auth.namePlaceholder).toBe(en.Auth.namePlaceholder)
    expect(hi.Onboarding.businessPhonePlaceholder).toBe(
      en.Onboarding.businessPhonePlaceholder,
    )
    expect(hi.Accounts.accountNamePlaceholder).toContain('John Doe')
    expect(hi.Accounts.ifscPlaceholder).toBe(en.Accounts.ifscPlaceholder)
    expect(hi.Onboarding.businessNamePlaceholder).toContain('Apple Inc.')
    expect(hi.Settings.teamName).toBe(en.Settings.teamName)
    expect(hi.PremiumWorkspace.importHelp).toContain('YYYY-MM-DD')
    expect(placeholderContract(hi.PremiumWorkspace.defaultMessage)).toEqual(
      placeholderContract(en.PremiumWorkspace.defaultMessage),
    )
  })
})

describe('placeholder comparison regressions', () => {
  it('allows translated text, reordered arguments and locale plural categories', () => {
    expect(
      placeholderContract(
        '{name}: {count, plural, one {# चेक} few {# चेक} other {# चेक}}',
      ),
    ).toEqual(
      placeholderContract(
        '{count, plural, other {# cheques} one {# cheque}} for {name}',
      ),
    )
  })

  it('finds nested arguments and rich-text tags, not escaped literal braces', () => {
    expect(
      placeholderContract(
        "'{literal}' <strong>{count, plural, one {{name}} other {{name}}}</strong>",
      ),
    ).toEqual([
      'count:cardinal:offset:0',
      'count:plural',
      'count:selectors:',
      'name:argument',
      'strong:tag',
    ])
  })

  it.each([
    ['{name}', '{renamed}'],
    ['{count, number}', '{count}'],
    ['{count, plural, one {one} other {many}}', '{count}'],
    ['{count, plural, =0 {none} other {#}}', '{count, plural, other {#}}'],
    ['{count, plural, offset:1 other {#}}', '{count, plural, other {#}}'],
    [
      '{status, select, active {{name}} other {none}}',
      '{status, select, active {yes} other {none}}',
    ],
  ])('detects incompatible placeholders in %s', (reference, translated) => {
    expect(placeholderContract(translated)).not.toEqual(
      placeholderContract(reference),
    )
  })

  it('rejects malformed ICU instead of matching a partial placeholder', () => {
    expect(() => placeholderContract('{count, plural, one {broken}')).toThrow()
  })
})

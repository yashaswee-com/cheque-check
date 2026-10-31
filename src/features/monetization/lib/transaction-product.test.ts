import { describe, expect, it } from 'vitest'
import { transactionProductId } from './transaction-product'
import { ALL_PRODUCT_IDS } from '../constants'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import english from '../../../../messages/en.json'
import hindi from '../../../../messages/hi.json'
import hinglish from '../../../../messages/hi-en.json'

describe('exact payment product labels', () => {
  it.each([hindi, hinglish])(
    'provides complete new shared UI and product labels in every locale',
    (messages) => {
      for (const namespace of ['SharedUI', 'ProductNames'] as const) {
        expect(Object.keys(messages[namespace]).sort()).toEqual(
          Object.keys(english[namespace]).sort(),
        )
        expect(
          Object.values(messages[namespace]).every(
            (label) => typeof label === 'string' && label.length > 0,
          ),
        ).toBe(true)
      }
    },
  )
  it.each(ALL_PRODUCT_IDS)('preserves explicit product ID %s', (product_id) => {
    expect(
      transactionProductId({
        product_id,
        type: 'top_up',
        feature_id: 'ai_scan',
      }),
    ).toBe(product_id)
  })
  it.each([
    ['lifetime', 'lifetime_premium', 'lifetime_premium'],
    ['subscription', 'ai_scanner_sub', 'ai_scanner_30d'],
    ['subscription', 'voice_reminder_sub', 'voice_reminder_30d'],
    ['top_up', 'ai_scan', 'ai_scan_250'],
    ['top_up', 'voice_reminder', 'voice_reminder_100'],
  ] as const)(
    'infers only known legacy pair %s/%s',
    (type, feature_id, expected) => {
      expect(transactionProductId({ type, feature_id })).toBe(expected)
    },
  )
  it('does not disguise unknown products as another product', () => {
    expect(
      transactionProductId({
        product_id: 'future_product',
        type: 'lifetime',
        feature_id: 'lifetime_premium',
      }),
    ).toBeNull()
    expect(
      transactionProductId({ type: 'subscription', feature_id: 'ai_scan' }),
    ).toBeNull()
  })
  it('only updates catalog display names in the forward migration', () => {
    const migration = readFileSync(
      join('supabase', 'migrations', '20261021040000_product_names.sql'),
      'utf8',
    )
    expect(migration).toContain(
      "WHEN 'ai_scanner_30d' THEN 'AI Scanner - 30-Day Pack (250 scans)'",
    )
    expect(migration).not.toMatch(
      /\b(?:amount|currency|quota_increment|entitlement_days|feature_id)\s*=/,
    )
  })
})

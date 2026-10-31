import { describe, expect, it } from 'vitest'
import { PRODUCT_IDS } from '../constants'
import {
  getPaymentProductIcon,
  paymentProductIcons,
} from './payment-product-icons'

describe('paymentProductIcons', () => {
  it('defines an icon for every payment product', () => {
    expect(Object.keys(paymentProductIcons)).toHaveLength(5)
    expect(Object.values(paymentProductIcons)).toHaveLength(5)
  })

  it('uses a distinct icon for each product', () => {
    expect(new Set(Object.values(paymentProductIcons)).size).toBe(5)
  })

  it('returns the configured icon for each supported purchase', () => {
    for (const product of Object.values(PRODUCT_IDS))
      expect(getPaymentProductIcon(product)).toBe(paymentProductIcons[product])
  })
})

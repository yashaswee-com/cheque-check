import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildChequeUpdateMessage,
  buildNotifyPartyAction,
  buildSmsLink,
  isPartySmsEnabled,
  preparePartySms,
} from './notify-party'
import hindiMessages from '../../../../messages/hi.json'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  template: vi.fn(),
  party: vi.fn(),
  business: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/features/monetization/services/premium-authorization', () => ({
  verifyLifetimePremium: mocks.verify,
}))
vi.mock(
  '@/features/premium-workspace/services/workspace.service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/premium-workspace/services/workspace.service')
    >()),
    getMessageTemplate: mocks.template,
  }),
)
vi.mock('@/features/parties/services/party.service', () => ({
  partyService: { getById: mocks.party },
}))
vi.mock('@/features/businesses/services/business.service', () => ({
  businessService: { getById: mocks.business },
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.verify.mockResolvedValue(false)
  mocks.template.mockResolvedValue(null)
  vi.stubGlobal('window', { location: { href: '' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('notify-party', () => {
  const cheque = {
    cheque_number: '123456',
    amount: 12500,
    cheque_date: '2026-09-30',
    status: 'Issued' as const,
  }

  it('builds a readable cheque update message', () => {
    expect(
      buildChequeUpdateMessage(cheque, { name: 'Acme Ltd' }, '₹'),
    ).toContain('Hi Acme Ltd')
    expect(
      buildChequeUpdateMessage(cheque, { name: 'Acme Ltd' }, '₹'),
    ).toContain('Cheque #123456')
  })
  it('localizes default SMS text, statuses, currency and dates using the profile', () => {
    const message = buildChequeUpdateMessage(
      cheque,
      { name: 'Acme' },
      '€',
      'Cleared',
      null,
      'Example',
      {
        language: 'hi',
        date_format: 'MM/dd/yyyy',
        time_zone: 'America/New_York',
      },
    )
    expect(message).toContain('€12,500')
    expect(message).toContain('09/30/2026')
    expect(message).toContain(hindiMessages.PremiumWorkspace.statuses.Cleared)
    expect(message).not.toContain('Cheque #')
    expect(message).toContain('Example')
  })

  it('offers an authorized action and rechecks access when clicked', async () => {
    mocks.party.mockResolvedValue({ name: 'Acme', contact: '+919876543210' })
    const action = await buildNotifyPartyAction(
      { ...cheque, party_id: 'p1' },
      null,
      'Notify',
      true,
      'Access required',
    )
    expect(action?.children).toBe('Notify')
    action?.onClick()
    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Access required',
          type: 'info',
        }),
      ),
    )
    expect(mocks.party).toHaveBeenCalledWith('p1')
  })

  it('skips parties without a phone and reports failed party lookups', async () => {
    mocks.party.mockResolvedValueOnce({ name: 'Acme', contact: '' })
    await expect(
      buildNotifyPartyAction(
        { ...cheque, party_id: 'p1' },
        null,
        'Notify',
        true,
      ),
    ).resolves.toBeUndefined()
    mocks.party.mockRejectedValueOnce(new Error('Party unavailable'))
    await expect(
      buildNotifyPartyAction(
        { ...cheque, party_id: 'p1' },
        null,
        'Notify',
        true,
      ),
    ).resolves.toBeUndefined()
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Notify',
      description: 'Party unavailable',
      type: 'error',
    })
  })

  it('encodes a phone number and message as an SMS link', () => {
    expect(buildSmsLink('+919876543210', 'Cheque ready')).toBe(
      'sms:+919876543210?body=Cheque%20ready',
    )
  })

  it('uses the action label when a party lookup rejects without an Error', async () => {
    mocks.party.mockRejectedValue('lookup failed')
    await expect(
      buildNotifyPartyAction(
        { ...cheque, party_id: 'p1' },
        null,
        'Notify',
        true,
      ),
    ).resolves.toBeUndefined()
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Notify',
      description: 'Notify',
      type: 'error',
    })
  })

  it('uses the title when authorization rejects without an Error', async () => {
    mocks.verify.mockRejectedValue('authorization failed')
    await preparePartySms(
      'Notify',
      '+919876543210',
      cheque,
      { name: 'Acme' },
      '₹',
    )
    expect(window.location.href).toBe('')
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Notify',
      description: 'Notify',
      type: 'error',
    })
  })

  it('treats the party SMS preference as on unless explicitly disabled', () => {
    expect(isPartySmsEnabled(undefined)).toBe(true)
    expect(isPartySmsEnabled({ party_sms_enabled: true })).toBe(true)
    expect(isPartySmsEnabled({ party_sms_enabled: false })).toBe(false)
  })

  it('skips the notify action when party SMS is disabled', async () => {
    await expect(
      buildNotifyPartyAction(
        { ...cheque, party_id: 'p1' },
        { currency: '₹', party_sms_enabled: false },
        'Notify',
      ),
    ).resolves.toBeUndefined()
  })

  it('does not offer the toast action without Premium even when SMS preference is on', async () => {
    expect(
      await buildNotifyPartyAction(
        { ...cheque, party_id: 'p1' },
        { currency: '₹', party_sms_enabled: true },
        'Notify',
      ),
    ).toBeUndefined()
    expect(mocks.party).not.toHaveBeenCalled()
  })

  it('reauthorizes the SMS action and reports lost access without opening the composer', async () => {
    await preparePartySms(
      'Notify',
      '+919876543210',
      cheque,
      { name: 'Acme' },
      '₹',
      'Upgrade required',
    )
    expect(window.location.href).toBe('')
    expect(mocks.template).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Upgrade required',
        type: 'info',
      }),
    )
  })

  it('loads the synced template and resolves all supported placeholders before opening native SMS', async () => {
    mocks.verify.mockResolvedValue(true)
    mocks.template.mockResolvedValue(
      '{party}: #{cheque_number}, {amount}, {date}, {status}. {business}',
    )
    mocks.business.mockResolvedValue({ name: 'Example Business' })
    await preparePartySms(
      'Notify',
      '+919876543210',
      { ...cheque, business_id: 'b1' },
      { name: 'Acme' },
      '₹',
    )
    const message = decodeURIComponent(window.location.href.split('body=')[1])
    expect(message).toContain('Acme: #123456')
    expect(message).toContain('Issued. Example Business')
    expect(message).not.toMatch(
      /\{(party|cheque_number|amount|date|status|business)\}/,
    )
    expect(mocks.business).toHaveBeenCalledWith('b1')
    expect(mocks.template).toHaveBeenCalledWith('b1')
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('uses the existing default message only when no saved template exists', async () => {
    mocks.verify.mockResolvedValue(true)
    await preparePartySms(
      'Notify',
      '+919876543210',
      cheque,
      { name: 'Acme' },
      '₹',
    )
    expect(decodeURIComponent(window.location.href)).toContain('Hi Acme')
    expect(mocks.business).not.toHaveBeenCalled()
  })

  it('shows template synchronization errors instead of silently sending a different message', async () => {
    mocks.verify.mockResolvedValue(true)
    mocks.template.mockRejectedValue(new Error('Message sync failed'))
    await preparePartySms(
      'Notify',
      '+919876543210',
      cheque,
      { name: 'Acme' },
      '₹',
    )
    expect(window.location.href).toBe('')
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Message sync failed',
        type: 'error',
      }),
    )
  })
})

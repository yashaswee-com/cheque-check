import { describe, expect, it } from 'vitest'
import { pushSubscriptionSchema } from './push-subscription'

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-device:APA91-test',
  expirationTime: null,
  keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) },
}

describe('browser push subscription validation', () => {
  it.each([
    subscription.endpoint,
    'https://fcm.googleapis.com/fcm/send/test-device',
    'https://fcm.googleapis.com/fcm/send/test-device~mid?token=abc123&scope=all',
    'https://updates.push.services.mozilla.com/wpush/v2/test-device',
    'https://web.push.apple.com/test-device',
    'https://test.notify.windows.com/test-device',
  ])('accepts supported provider endpoint %s', (endpoint) => {
    expect(
      pushSubscriptionSchema.safeParse({ ...subscription, endpoint }).success,
    ).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/a',
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com.evil.test/a',
    'https://fcm.googleapis.com@evil.test/a',
    'https://fcm.googleapis.com:8443/a',
    'https://fcm.googleapis.com/a#fragment',
    'https://fcm.googleapis.com/' + 'a'.repeat(2048),
  ])('rejects invalid provider endpoint %s', (endpoint) => {
    expect(
      pushSubscriptionSchema.safeParse({ ...subscription, endpoint }).success,
    ).toBe(false)
  })

  it.each([
    { p256dh: 'invalid', auth: subscription.keys.auth },
    { p256dh: subscription.keys.p256dh, auth: 'invalid' },
  ])('rejects invalid subscription keys', (keys) => {
    expect(
      pushSubscriptionSchema.safeParse({ ...subscription, keys }).success,
    ).toBe(false)
  })
})

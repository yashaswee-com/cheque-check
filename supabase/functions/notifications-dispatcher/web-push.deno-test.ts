import webpush from 'web-push'
import { createECDH, randomBytes } from 'node:crypto'
import { strict as assert } from 'node:assert'

Deno.test(
  'real Web Push encryption and VAPID request without network delivery',
  () => {
    // Ephemeral test-only key material is never logged or persisted.
    const vapid = webpush.generateVAPIDKeys()
    const browser = createECDH('prime256v1')
    browser.generateKeys()
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/local-test',
      keys: {
        p256dh: browser.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    }
    const payload = JSON.stringify({ inboxId: '1', language: 'en' })
    const request = webpush.generateRequestDetails(subscription, payload, {
      TTL: 60,
      timeout: 10000,
      vapidDetails: {
        subject: 'mailto:test@example.test',
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
    })
    assert.equal(request.method, 'POST')
    assert.equal(request.endpoint, subscription.endpoint)
    assert.equal(request.headers.TTL, 60)
    assert.equal(request.headers['Content-Encoding'], 'aes128gcm')
    assert.match(request.headers.Authorization, /^vapid /)
    assert(request.body.length > payload.length)
    assert(!request.body.includes(Buffer.from(payload)))
  },
)

export interface BrowserSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
export interface PushOutcome {
  outcome: 'accepted' | 'rejected' | 'uncertain'
  status?: number
}
export type PushSender = (
  subscription: BrowserSubscription,
  payload: string,
  options: { TTL: number; timeout: number },
) => Promise<{ statusCode: number }>

export class WebPushService {
  constructor(private send: PushSender) {}

  async deliver(
    subscription: BrowserSubscription,
    inboxId: string,
    language: string | null,
  ): Promise<PushOutcome> {
    try {
      const response = await this.send(
        subscription,
        JSON.stringify({
          inboxId,
          language: language === 'hi' || language === 'hi-en' ? language : 'en',
        }),
        { TTL: 60, timeout: 10_000 },
      )
      if (response.statusCode >= 200 && response.statusCode <= 299)
        return { outcome: 'accepted', status: response.statusCode }
      if (response.statusCode >= 400 && response.statusCode <= 599)
        return { outcome: 'rejected', status: response.statusCode }
      return { outcome: 'uncertain' }
    } catch (error) {
      // Explicit HTTP rejection is retryable; network/timeout outcomes cannot
      // prove non-delivery and must not cause blind duplicate sends.
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number' &&
        error.statusCode >= 400 &&
        error.statusCode <= 599
      ) {
        return { outcome: 'rejected', status: error.statusCode }
      }
      console.error('Web Push provider outcome is uncertain')
      return { outcome: 'uncertain' }
    }
  }
}

import type { ClaimedJob, DispatchResult } from '../types.ts'
import { Logger } from '../../_shared/logger.ts'
import type {
  ChannelDispatchContext,
  NotificationChannelHandler,
  PushDeliveryPort,
  PushProviderPort,
} from './channel.types.ts'

export class PushNotificationHandler implements NotificationChannelHandler {
  constructor(
    private readonly db: PushDeliveryPort,
    private readonly push: PushProviderPort | undefined,
  ) {}

  async dispatch(
    job: ClaimedJob,
    context: ChannelDispatchContext,
  ): Promise<DispatchResult> {
    if (!this.push) throw new Error('Web Push VAPID configuration unavailable')
    if (!job.payload.inbox_id || !/^\d{1,19}$/.test(job.payload.inbox_id))
      return context.skip(job, 'Invalid inbox push payload')
    const profile = await this.db.fetchProfile(job.user_id)
    if (!profile || profile.deleted_at)
      return context.skip(job, 'User account is unavailable')
    const admission = await this.db.startPushDelivery(job)
    if (admission.status === 'throttled') {
      context.metrics.provider_throttled++
      return { jobId: job.id, status: 'queued' }
    }
    if (admission.status === 'skipped')
      return { jobId: job.id, status: 'skipped' }
    context.state.providerStarted = true
    const result =
      Date.now() >= admission.startBefore
        ? { outcome: 'rejected' as const, status: 503 }
        : await this.push.deliver(
            admission.subscription,
            job.payload.inbox_id,
            profile.language,
          )
    context.metrics.provider_requests++
    if (result.outcome === 'accepted') context.metrics.provider_accepted++
    else if (result.outcome === 'rejected') context.metrics.provider_rejected++
    else {
      context.metrics.provider_uncertain++
      context.metrics.reconciliation_required++
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await this.db.finishPushDelivery(job, result)
        break
      } catch (error) {
        Logger.error(`Push finalization failed for job ${job.id}`, error)
        if (attempt >= 2) throw error
        context.metrics.finalization_retries++
      }
    }
    return {
      jobId: job.id,
      status:
        result.outcome === 'accepted'
          ? 'sent'
          : result.status === 404 || result.status === 410
            ? 'skipped'
            : 'failed',
    }
  }
}

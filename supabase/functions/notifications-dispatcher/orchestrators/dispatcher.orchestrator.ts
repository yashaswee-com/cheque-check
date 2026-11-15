import { Logger } from '../../_shared/logger.ts'
import type {
  ClaimedJob,
  DeliveryMetrics,
  DispatcherQueuePort,
  DispatchAttemptState,
  DispatchResult,
  DispatchScope,
} from '../types.ts'
import { createNotificationChannelRegistry } from '../channels/registry.ts'
import type {
  TestModeConfig,
  VoiceDeliveryPort,
  VoiceProviderPort,
  PushDeliveryPort,
  PushProviderPort,
} from '../channels/channel.types.ts'
import type { NotificationChannelRegistry } from '../channels/registry.ts'

export class DispatcherOrchestrator {
  private readonly handlers: NotificationChannelRegistry

  constructor(
    private db: DispatcherQueuePort & VoiceDeliveryPort & PushDeliveryPort,
    twilio: VoiceProviderPort | null,
    private testMode: TestModeConfig = { enabled: false, phone: '' },
    push?: PushProviderPort,
  ) {
    this.handlers = createNotificationChannelRegistry({
      voiceDb: this.db,
      pushDb: this.db,
      voice: twilio,
      testMode,
      push,
    })
  }

  /** Without a scope this is the global cron claim; a scope limits the claim itself. */
  async run(batchSize = 50, scope?: DispatchScope): Promise<DispatchResult[]> {
    const results: DispatchResult[] = []
    const started = Date.now()
    const deadline = started + 40_000
    const metrics: DeliveryMetrics = {
      provider_requests: 0,
      provider_duration_ms: 0,
      provider_accepted: 0,
      provider_rejected: 0,
      provider_uncertain: 0,
      reconciliation_required: 0,
      finalization_retries: 0,
      provider_throttled: 0,
    }
    let claims = 0
    let stopReason = 'max_jobs'
    let failed = true
    try {
      // Claim only what can start immediately; queued-in-memory jobs would age their leases.
      for (
        let remaining = batchSize;
        remaining > 0 && Date.now() < deadline;
        remaining -= 5
      ) {
        const jobs = await this.db.claimJobs(Math.min(5, remaining), scope)
        claims++
        if (!jobs.length) {
          stopReason =
            results.at(-1)?.status === 'queued'
              ? 'provider_capacity'
              : 'empty_queue'
          break
        }
        results.push(
          ...(await Promise.all(
            jobs.map((job) => this.dispatchSafely(job, metrics)),
          )),
        )
        const throttled = results
          .slice(-jobs.length)
          .some((result) => result.status === 'queued')
        if (jobs.length < Math.min(5, remaining)) {
          stopReason = throttled ? 'provider_capacity' : 'empty_queue'
          break
        }
        if (throttled && remaining > jobs.length) {
          // Bound database churn under shared backpressure; never sleep beyond the loop budget.
          if (Date.now() + 1000 >= deadline) {
            stopReason = 'budget'
            break
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 1000))
        }
      }
      if (
        Date.now() >= deadline &&
        results.length < batchSize &&
        stopReason !== 'empty_queue'
      )
        stopReason = 'budget'
      failed = false
      return results
    } finally {
      Logger.metric('notification.dispatcher.run', {
        ...metrics,
        duration_ms: Date.now() - started,
        claims,
        processed: results.length,
        sent: results.filter((result) => result.status === 'sent').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
        failed_jobs: results.filter((result) => result.status === 'failed')
          .length,
        queued: results.filter((result) => result.status === 'queued').length,
        failed,
        scoped: !!scope,
        stop_reason: failed ? 'error' : stopReason,
      })
    }
  }

  /** Pre-provider failures retry; started deliveries recover through their lease. */
  private async dispatchSafely(
    job: ClaimedJob,
    metrics: DeliveryMetrics,
  ): Promise<DispatchResult> {
    const state: DispatchAttemptState = { providerStarted: false }
    try {
      return await this.dispatch(job, state, metrics)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      Logger.error(`Dispatch crashed for job ${job.id}`, message)
      if (!state.providerStarted) await this.db.markFailedOrRetry(job, message)
      else metrics.reconciliation_required++
      // Started deliveries retain their reservation and cannot be blindly retried.
      // The lease reaper exposes them for provider reconciliation.
      return { jobId: job.id, status: 'failed', error: message }
    }
  }

  private async skip(job: ClaimedJob, reason: string): Promise<DispatchResult> {
    await this.db.markSkipped(job, reason)
    return { jobId: job.id, status: 'skipped', error: reason }
  }

  private async dispatch(
    job: ClaimedJob,
    state: DispatchAttemptState,
    metrics: DeliveryMetrics,
  ): Promise<DispatchResult> {
    const handler = Object.hasOwn(this.handlers, job.channel)
      ? this.handlers[job.channel]
      : undefined
    if (!handler) {
      await this.db.markSkipped(
        job,
        `channel '${job.channel}' is not implemented yet`,
      )
      return { jobId: job.id, status: 'skipped' }
    }
    return handler.dispatch(job, {
      state,
      metrics,
      skip: (skippedJob, reason) => this.skip(skippedJob, reason),
      finalize: (deliveryJob, outcome, providerId, message) =>
        this.finalize(deliveryJob, metrics, outcome, providerId, message),
    })
  }

  private async finalize(
    job: ClaimedJob,
    metrics: DeliveryMetrics,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.db.finishDelivery(job, outcome, providerId, message)
        return
      } catch (error) {
        Logger.error(`Delivery finalization failed for ${job.id}`, error)
        if (attempt === 2) throw error
        metrics.finalization_retries++
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
      }
    }
  }
}

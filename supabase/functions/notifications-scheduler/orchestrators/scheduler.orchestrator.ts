import { SchedulerDatabaseService } from '../services/database.service.ts'
import {
  NOTIFICATION_PURPOSE,
  daysBetween,
  getLocalTime,
} from '../../_shared/notifications.ts'
import { Logger } from '../../_shared/logger.ts'
import {
  NewNotificationJob,
  ReminderCheque,
  TargetedRunBlocker,
  TargetedRunRequest,
  TargetedRunResult,
} from '../types.ts'

export class SchedulerOrchestrator {
  constructor(private db: SchedulerDatabaseService) {}

  /**
   * On-demand run for one user or business (ops CLI). Skips the slot window
   * but enforces the same profile eligibility and due-cheque rules as run().
   * Each call creates fresh jobs (unique idempotency key), so it never
   * collides with or suppresses the regular slot jobs.
   */
  async runTargeted(
    request: TargetedRunRequest,
    now: Date = new Date(),
  ): Promise<TargetedRunResult> {
    const dryRun = request.dryRun === true
    const result: TargetedRunResult = {
      userId: null,
      localDate: null,
      blockers: [],
      businesses: [],
      jobIds: [],
      existingJobIds: [],
      dryRun,
    }

    let userId = request.userId ?? null
    if (request.businessId) {
      const ownerId = await this.db.fetchBusinessOwner(request.businessId)
      if (!ownerId || (userId && ownerId !== userId)) {
        result.blockers.push('business_not_found')
        return result
      }
      userId = ownerId
    }
    if (!userId) {
      result.blockers.push('profile_not_found')
      return result
    }
    result.userId = userId

    const profile = await this.db.fetchProfile(userId)
    if (!profile) {
      result.blockers.push('profile_not_found')
      return result
    }

    const blockers: TargetedRunBlocker[] = []
    if (!profile.voice_call_enabled) blockers.push('voice_disabled')
    if (!profile.phone && !request.toOverride) blockers.push('no_phone')
    if (!profile.time_zone) blockers.push('no_time_zone')

    let localDate: string | null = null
    if (profile.time_zone) {
      try {
        localDate = getLocalTime(now, profile.time_zone).date
      } catch {
        blockers.push('invalid_time_zone')
      }
    }
    result.localDate = localDate

    if (localDate) {
      const cheques = await this.db.fetchActiveChequesForUser(userId, localDate)
      result.businesses = groupByBusiness(
        cheques.filter((cheque) => isDueForReminder(cheque, localDate)),
      )
        .filter(
          ([businessId]) =>
            !request.businessId || businessId === request.businessId,
        )
        .map(([businessId, businessCheques]) => ({
          businessId,
          chequeIds: businessCheques.map((c) => c.id),
        }))
      if (result.businesses.length === 0) blockers.push('no_due_cheques')
    }

    result.blockers = blockers
    if (dryRun || blockers.length > 0) return result

    const jobs = result.businesses.map(
      ({ businessId, chequeIds }): NewNotificationJob => {
        const id = crypto.randomUUID()
        return {
          id,
          user_id: userId,
          business_id: businessId,
          channel: 'voice',
          purpose: NOTIFICATION_PURPOSE.CHEQUE_REMINDER,
          payload: {
            cheque_ids: chequeIds,
            slot: 'manual',
            trigger: 'manual',
            ...(request.requestId ? { request_id: request.requestId } : {}),
            ...(request.toOverride ? { to_override: request.toOverride } : {}),
          },
          scheduled_at: now.toISOString(),
          idempotency_key: `${NOTIFICATION_PURPOSE.CHEQUE_REMINDER}:voice:${businessId}:${localDate}:manual:${request.requestId ?? id}`,
        }
      },
    )

    if (request.requestId) {
      await this.db.enqueueJobs(jobs)
      const stored = await this.db.fetchJobIdsByKeys(
        jobs.map((job) => job.idempotency_key),
      )
      result.jobIds = jobs.map(
        (job) => stored.get(job.idempotency_key) ?? (job.id as string),
      )
      result.existingJobIds = result.jobIds.filter(
        (id, index) => id !== jobs[index].id,
      )
    } else {
      await this.db.insertJobs(jobs)
      result.jobIds = jobs.map((job) => job.id as string)
    }
    Logger.info(
      `Enqueued ${jobs.length} manual voice job(s) for user ${userId}`,
    )
    return result
  }

  /** forceRun bypasses the slot-time window - for manual testing only. */
  async run(
    now: Date = new Date(),
    forceRun = false,
  ): Promise<{ enqueued: number; completed: boolean }> {
    let enqueued = 0
    const started = Date.now()
    const deadline = started + 40_000
    let batches = 0
    let invalidTimezones = 0
    let completed = false
    let failed = true
    try {
      do {
        const batch = await this.db.scheduleBatch(now, forceRun)
        batches++
        enqueued += batch.enqueued
        invalidTimezones += batch.invalid_timezones
        if (batch.invalid_timezones)
          Logger.error('Scheduler skipped invalid time zones', {
            count: batch.invalid_timezones,
          })
        if (batch.completed) {
          completed = true
          break
        }
      } while (Date.now() < deadline)
      failed = false
      return { enqueued, completed }
    } finally {
      Logger.metric('notification.scheduler.run', {
        duration_ms: Date.now() - started,
        batches,
        enqueued,
        completed,
        failed,
        invalid_timezones: invalidTimezones,
        budget_exhausted: !failed && !completed,
      })
    }
  }
}

function isDueForReminder(cheque: ReminderCheque, localToday: string): boolean {
  if (cheque.deposit_date) {
    if (cheque.remind_before_days == null) return false
    const daysUntilDue = daysBetween(localToday, cheque.deposit_date)
    return daysUntilDue >= 0 && daysUntilDue <= cheque.remind_before_days
  }

  // No deposit date set - fall back to the cheque date itself, same-day only
  // (there's no "before" reference to count down from).
  return cheque.cheque_date === localToday
}

function groupByBusiness(
  cheques: ReminderCheque[],
): [string, ReminderCheque[]][] {
  const byBusiness = new Map<string, ReminderCheque[]>()
  for (const cheque of cheques) {
    const list = byBusiness.get(cheque.business.id) ?? []
    list.push(cheque)
    byBusiness.set(cheque.business.id, list)
  }
  return [...byBusiness.entries()]
}

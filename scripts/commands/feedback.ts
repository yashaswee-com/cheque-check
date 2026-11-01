import { defineAction } from '../lib/action'
import { UsageError } from '../lib/errors'
import { confirmMutation } from '../lib/guards'
import {
  parseChoice,
  parseDate,
  parseInteger,
  parseUuid,
} from '../lib/validators'
import {
  getFeedbackItem,
  listFeedback,
  updateFeedback,
  type FeedbackOpsPage,
  type FeedbackOpsRow,
  type FeedbackUpdateResult,
} from '../domain/ops'
import { feedbackStatuses } from '../../src/validators/feedback'
import { askValue } from './shared'

const feedbackList = defineAction<FeedbackOpsPage>({
  name: 'feedback-list',
  title: 'Review private feedback and roadmap items',
  description:
    'List recent feedback submissions. Descriptions remain private unless a feature request is published to the signed-in roadmap.',
  mutates: false,
  options: [
    {
      flags: '--status <status>',
      description: 'Filter by admin-managed status',
      choices: feedbackStatuses,
    },
    {
      flags: '--limit <n>',
      description: 'Maximum rows to show (1–100)',
      defaultValue: '50',
    },
    {
      flags: '--before-created-at <timestamp>',
      description: 'Continue before a prior page cursor timestamp',
    },
    {
      flags: '--before-id <uuid>',
      description: 'Continue before a prior page cursor UUID',
    },
  ],
  examples: [
    'ops feedback-list --env qa',
    'ops feedback-list --status under_review --limit 25 --json',
    'ops feedback-list --before-created-at 2026-11-01T10:00:00.000Z --before-id <uuid>',
  ],
  async run(ctx, options) {
    const status = options.status
      ? parseChoice(String(options.status), feedbackStatuses, 'Feedback status')
      : undefined
    const limit = parseInteger(String(options.limit ?? 50), '--limit', {
      min: 1,
      max: 100,
    })
    if (!!options.beforeCreatedAt !== !!options.beforeId)
      throw new UsageError(
        'Use both --before-created-at and --before-id for pagination.',
      )
    const before = options.beforeCreatedAt
      ? {
          createdAt: parseDate(
            String(options.beforeCreatedAt),
            '--before-created-at',
          ),
          id: parseUuid(String(options.beforeId), '--before-id'),
        }
      : undefined
    return listFeedback(ctx.db(), { status, limit, before })
  },
  render(ctx, rows) {
    ctx.ui.table(
      rows.items.map((row) => ({
        ID: row.id,
        User: row.user_id,
        Category: row.category,
        Title: row.title,
        Status: row.status,
        Published: row.roadmap_published,
        Votes: row.vote_count,
        Created: row.created_at,
      })),
      'No feedback submissions.',
    )
    if (rows.nextCursor)
      ctx.ui.kv({
        'Next page --before-created-at': rows.nextCursor.createdAt,
        'Next page --before-id': rows.nextCursor.id,
      })
  },
})

const feedbackUpdate = defineAction<FeedbackUpdateResult>({
  name: 'feedback-update',
  title: 'Update feedback status or roadmap publication',
  description:
    'Admin-managed changes are recorded in the audit log. Only feature requests can be published.',
  mutates: true,
  options: [
    { flags: '--id <uuid>', description: 'Feedback item UUID' },
    {
      flags: '--status <status>',
      description: 'Set status',
      choices: feedbackStatuses,
    },
    { flags: '--publish', description: 'Publish a feature request to roadmap' },
    {
      flags: '--unpublish',
      description: 'Remove a feature request from roadmap',
    },
    { flags: '--reason <reason>', description: 'Audit-log reason' },
  ],
  examples: [
    'ops feedback-update --id <uuid> --status planned --publish --reason "Accepted for roadmap"',
    'ops feedback-update --id <uuid> --status declined --yes',
  ],
  async run(ctx, options) {
    if (options.publish && options.unpublish)
      throw new UsageError('Choose either --publish or --unpublish.')
    const id = parseUuid(String(options.id ?? ''), 'Feedback ID')
    const status = options.status
      ? parseChoice(String(options.status), feedbackStatuses, 'Feedback status')
      : undefined
    const published = options.publish
      ? true
      : options.unpublish
        ? false
        : undefined
    if (!status && published === undefined)
      throw new UsageError('Provide --status, --publish, or --unpublish.')

    const before = await getFeedbackItem(ctx.db(), id)
    const afterStatus = status ?? before.status
    const afterPublished = published ?? before.roadmap_published
    if (
      before.status === afterStatus &&
      before.roadmap_published === afterPublished
    ) {
      throw new UsageError('The feedback item already has those values.')
    }

    await confirmMutation(ctx, {
      title: 'Update feedback item',
      changes: [
        { field: 'Status', before: before.status, after: afterStatus },
        {
          field: 'Roadmap published',
          before: before.roadmap_published,
          after: afterPublished,
        },
      ],
      notes: [
        `Feedback: ${before.id}`,
        `Category: ${before.category}`,
        `Operator: ${ctx.operator}`,
        options.reason
          ? `Reason: ${String(options.reason)}`
          : 'Reason: not provided',
      ],
      destructive: true,
    })
    return updateFeedback(ctx.db(), {
      id,
      status,
      published,
      operator: ctx.operator,
      reason: options.reason ? String(options.reason) : undefined,
    })
  },
  render(ctx, result) {
    ctx.ui.success('Feedback item updated and audited.')
    ctx.ui.kv({
      ID: result.item.id,
      Status: result.item.status,
      Published: result.item.roadmap_published,
      'Audit entry': result.audit_id,
    })
  },
})

export const feedbackActions = [feedbackList, feedbackUpdate]

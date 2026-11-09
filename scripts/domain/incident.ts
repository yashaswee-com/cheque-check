import { execFile } from 'node:child_process'
import { delimiter } from 'node:path'
import { z } from 'zod'
import { OpsError, UsageError } from '../lib/errors'

const metadataText = z
  .string()
  .max(160)
  .regex(/^[a-zA-Z0-9_.@:/-]+$/)
const issueSchema = z.object({
  id: z.string().regex(/^\d+$/),
  shortId: z.string().regex(/^CHEQUE-CHECK-WEB-[A-Z0-9]+$/),
  status: z.enum(['unresolved', 'resolved', 'ignored']),
  level: z.enum(['fatal', 'error', 'warning', 'info', 'debug']),
  count: z.string().regex(/^\d+$/),
  firstSeen: z.iso.datetime({ offset: true }),
  lastSeen: z.iso.datetime({ offset: true }),
  project: z.object({ slug: z.literal('cheque-check-web') }),
  event: z
    .object({
      id: z.string().regex(/^[a-f0-9]{32}$/),
      dateCreated: z.iso.datetime({ offset: true }),
      tags: z.array(z.object({ key: z.string(), value: z.string() })),
    })
    .nullable(),
})

const fields =
  'id,shortId,status,level,count,firstSeen,lastSeen,project.slug,event.id,event.dateCreated,event.tags'

export async function readSentryIssue(args: string[]): Promise<string> {
  const env = { ...process.env }
  // Ops loads build credentials from app env files; use the CLI's stored login.
  delete env.SENTRY_AUTH_TOKEN
  delete env.SENTRY_API_KEY
  // npm prepends a different dependency's "sentry" binary to PATH.
  env.PATH = (env.PATH ?? '')
    .split(delimiter)
    .filter((entry) => !/[/\\]node_modules[/\\]\.bin[/\\]?$/.test(entry))
    .join(delimiter)
  try {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        'sentry',
        args,
        {
          env,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout) => {
          if (error) reject(error)
          else resolve(stdout)
        },
      )
    })
  } catch {
    throw new OpsError('Sentry issue lookup failed.', {
      hint: 'Check `sentry --version` and `sentry auth status`; verify project access and event:read permission. Raw CLI output is withheld.',
    })
  }
}

export async function getIncident(
  shortId: string,
  read: (args: string[]) => Promise<string> = readSentryIssue,
) {
  if (!/^CHEQUE-CHECK-WEB-[A-Z0-9]+$/.test(shortId)) {
    throw new UsageError(
      'Pass --issue CHEQUE-CHECK-WEB-<suffix> for the cheque-check-web project.',
    )
  }
  const output = await read([
    'issue',
    'view',
    `cheque-check/${shortId}`,
    '--fresh',
    '--json',
    '--fields',
    fields,
  ])
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new OpsError('Sentry returned invalid JSON; no event data emitted.')
  }
  const result = issueSchema.safeParse(parsed)
  if (!result.success || result.data.shortId !== shortId) {
    throw new OpsError(
      'Sentry returned unexpected issue metadata; no event data emitted.',
    )
  }
  const issue = result.data
  const tag = (key: string) => {
    const value = issue.event?.tags.find((item) => item.key === key)?.value
    if (value === undefined) return null
    if (!metadataText.safeParse(value).success) {
      throw new OpsError(`Sentry returned invalid ${key} metadata.`)
    }
    return value
  }
  return {
    organization: 'cheque-check',
    project: issue.project.slug,
    id: issue.id,
    shortId: issue.shortId,
    url: `https://cheque-check.sentry.io/issues/${issue.id}/`,
    status: issue.status,
    level: issue.level,
    count: issue.count,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    latestEvent: issue.event
      ? {
          id: issue.event.id,
          dateCreated: issue.event.dateCreated,
          environment: tag('environment'),
          release: tag('release'),
        }
      : null,
  }
}

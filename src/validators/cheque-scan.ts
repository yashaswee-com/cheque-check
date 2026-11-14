import { z } from 'zod'
import { ChequeDetailsSchema } from '@/validators/ocr'
import { parsePrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import { OCR_CONSENT_VERSION } from '@/features/cheques/services/ocr-contract'

const image = z
  .string()
  .max(2048)
  .refine((value) => {
    const parsed = parsePrivateMediaUrl(value)
    return parsed?.bucket === PRIVATE_CHEQUE_BUCKET
  })
export const ScanActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    imageUrl: image,
    key: z.uuid(),
    mode: z.enum(['Inward', 'Outward']),
    consent: z.literal(OCR_CONSENT_VERSION),
  }),
  z.object({ action: z.literal('read'), imageUrl: image }),
  z.object({
    action: z.literal('consent'),
    version: z.literal(OCR_CONSENT_VERSION),
  }),
  z.object({
    action: z.enum(['accept', 'cancel', 'candidates']),
    jobId: z.uuid(),
  }),
  z.object({
    action: z.literal('confirm-party'),
    jobId: z.uuid(),
    partyId: z.uuid(),
  }),
  z.object({
    action: z.literal('remap'),
    jobId: z.uuid(),
    mode: z.enum(['Inward', 'Outward']),
  }),
  z.object({
    action: z.literal('confirm-duplicate'),
    jobId: z.uuid(),
    accountId: z.uuid(),
    chequeNumber: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal('create'),
    jobId: z.uuid(),
    kind: z.enum(['party', 'account']),
    bankId: z.uuid().nullable().default(null),
    contact: z.string().max(30).nullable().default(null),
    allowDuplicate: z.boolean().default(false),
  }),
])

export const ScanJobSchema = z.object({
  id: z.uuid(),
  image_url: image,
  draft_id: z.uuid(),
  business_id: z.uuid(),
  mode: z.enum(['Inward', 'Outward']),
  status: z.enum([
    'accepted',
    'processing',
    'ready_high',
    'ready_partial',
    'accepted_partial',
    'unusable',
    'failed',
    'timed_out',
    'cancelled',
    'superseded',
    'expired_review',
  ]),
  details: ChequeDetailsSchema.nullable(),
  reliability: z
    .record(
      z.string(),
      z.object({
        level: z.enum(['high', 'needs_review', 'unusable']),
        reason: z.string().max(50),
      }),
    )
    .nullable(),
  error_code: z.string().nullable(),
  deadline_at: z.string(),
  review_expires_at: z.string().nullable(),
  credit_state: z.enum(['reserved', 'charged', 'released']),
})
export type ScanJob = z.infer<typeof ScanJobSchema>
export const isScanPending = (job: ScanJob) =>
  ['accepted', 'processing'].includes(job.status)

export const ScanCandidatesSchema = z.object({
  parties: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  accounts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string(),
      exact: z.boolean(),
    }),
  ),
})
export type ScanCandidates = z.infer<typeof ScanCandidatesSchema>
export const ScanEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  code: z.string().optional(),
})
export const ScanAcknowledgmentSchema = z.unknown()
export const ScanEntitySchema = z.object({ id: z.uuid() })

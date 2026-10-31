import { z } from 'zod'

export const phoneAuthPurposeSchema = z.enum(['login', 'signup', 'link'])

export const phoneOtpSendSchema = z
  .object({
    phone: z.string().min(1).max(32),
    purpose: phoneAuthPurposeSchema,
    captchaToken: z.string().min(1).max(4096).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine(({ purpose, name }, context) => {
    if (purpose === 'signup' && !name) {
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Name is required for phone sign-up',
      })
    }
  })

export const phoneOtpVerifySchema = z.object({
  phone: z.string().min(1).max(32),
  token: z.string().min(1).max(16),
  purpose: phoneAuthPurposeSchema,
})

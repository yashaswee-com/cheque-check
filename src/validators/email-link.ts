import { z } from 'zod'
export const emailLinkSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
})

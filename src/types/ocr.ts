import type { z } from 'zod'
import type { ChequeDetailsSchema } from '@/validators/ocr'

export type ChequeDetails = z.infer<typeof ChequeDetailsSchema>

export interface IOcrProvider {
  processImage(imageUrl: string, modelName?: string): Promise<ChequeDetails>
}

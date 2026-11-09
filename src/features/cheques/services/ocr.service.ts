import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { getOpenAiEnv } from '@/lib/env/server'
import { ChequeDetailsSchema } from '@/validators/ocr'
import type { ChequeDetails, IOcrProvider } from '@/types/ocr'
import { getOcrImageMediaType, OCR_IMAGE_FORMAT_ERROR } from './ocr-image'

export const DEFAULT_OCR_MODEL = 'gpt-4o-mini'

export class OpenAiOcrProvider implements IOcrProvider {
  constructor(private readonly modelName = DEFAULT_OCR_MODEL) {}

  async processImage(
    imageUrl: string,
    modelName = this.modelName,
  ): Promise<ChequeDetails> {
    const mediaType = getOcrImageMediaType(imageUrl)
    if (!mediaType) throw new Error(OCR_IMAGE_FORMAT_ERROR)
    getOpenAiEnv()

    const { object } = await generateObject({
      model: openai(modelName),
      schema: ChequeDetailsSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this cheque image and extract all relevant details. Adhere strictly to these rules:
- Date: Located in the top right corner. The block letters/boxes contain the date in DDMMYYYY format. Extract and format as YYYY-MM-DD.
- Cheque Number: Located at the bottom lower left. It is between two narrow straight lines (like |123456| or "123456"). Extract ONLY these 6 contiguous digits. Do NOT confuse this with the account number.
- Account Number: Located near a block that reads "A/c no" or "Account Number". Do not interpret the black box text/labels as the account number. Usually a long numerical sequence.
- Account Name: Found below the signature area (bottom right). It could be multiple lines or a single line. Extract this exactly as written. This is NOT the payee name.
- Payee Name: The name written after "Pay" or "To".
- IFSC Code: Located at the top middle of the cheque, to the left of the date. Format is 4 alphabetic characters followed by 7 numeric digits (e.g., HDFC0001234). If not visible/unclear, return null.
- If any field is not clearly visible or legible, return null for that field. Keep processing fast and concise.`,
            },
            { type: 'file', data: new URL(imageUrl), mediaType },
          ],
        },
      ],
    })

    return object
  }
}

import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { getOpenAiEnv } from '@/lib/env/server'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { OcrRequestSchema } from '@/validators/ocr'
import { OpenAiOcrProvider } from '@/features/cheques/services/ocr.service'
import { executeOcrWorkflow } from '@/features/cheques/services/ocr-workflow'

const ocrProvider = new OpenAiOcrProvider()

function respondWithError(
  message: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return Response.json({ error: message }, { status, headers })
}

async function extractCheque(req: Request): Promise<Response> {
  try {
    let requestBody: unknown
    try {
      requestBody = await req.json()
    } catch {
      return respondWithError('Invalid JSON body.', 400)
    }
    const requestResult = OcrRequestSchema.safeParse(requestBody)
    if (!requestResult.success) {
      return respondWithError('A valid image URL is required.', 400)
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return respondWithError('Unauthorized', 401)
    setRequestUser(user)

    const result = await executeOcrWorkflow(
      requestResult.data.imageUrl,
      user.id,
      {
        consumeRateLimit: async () => {
          const { data, error } = await supabase.rpc('consume_api_rate_limit', {
            requested_endpoint: 'ocr-cheque',
            request_limit: 10,
            window_seconds: 60,
          })
          if (error) throw error
          return data
        },
        createSignedUrl: async (bucket, path, expiresIn) => {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn)
          if (error) return null
          return data?.signedUrl ?? null
        },
        consumeQuota: async () => {
          const { data, error } = await supabase.rpc('consume_user_quota', {
            requested_feature: 'ai_scan',
          })
          if (error) throw error
          return data
        },
        ensureProviderConfigured: getOpenAiEnv,
        provider: {
          processImage: (imageUrl) => {
            logger.info(
              `[OcrController] Processing request for user ${user.id}`,
            )
            return ocrProvider.processImage(imageUrl)
          },
        },
      },
    )

    if (result.kind === 'rate-limited') {
      return respondWithError(
        'Too many scan requests. Please try again shortly.',
        429,
        { 'Retry-After': '60' },
      )
    }
    if (result.kind === 'forbidden-image') {
      return respondWithError('Forbidden image reference.', 403)
    }
    if (result.kind === 'image-not-found') {
      return respondWithError('Cheque image not found.', 404)
    }
    if (result.kind === 'quota-exhausted') {
      return respondWithError(
        'AI scan quota exhausted. Please subscribe or top-up to continue.',
        402,
      )
    }
    return Response.json(result.details)
  } catch (error: unknown) {
    logger.error('[OcrController Error]', error)
    return respondWithError(
      'An unexpected error occurred during image processing.',
      500,
    )
  }
}

export async function POST(req: Request) {
  return withMonitoringRequest(req, 'ocr.extract', () => extractCheque(req))
}

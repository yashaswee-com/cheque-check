import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { getOpenAiEnv } from '@/lib/env/server'
import { parsePrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { OcrRequestSchema } from '@/validators/ocr'
import { OpenAiOcrProvider } from '@/features/cheques/services/ocr.service'

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

    const { data: rateAllowed, error: rateError } = await supabase.rpc(
      'consume_api_rate_limit',
      {
        requested_endpoint: 'ocr-cheque',
        request_limit: 10,
        window_seconds: 60,
      },
    )
    if (rateError) throw rateError
    if (!rateAllowed) {
      return respondWithError(
        'Too many scan requests. Please try again shortly.',
        429,
        { 'Retry-After': '60' },
      )
    }

    const { imageUrl } = requestResult.data
    let providerImageUrl = imageUrl
    const privateMedia = parsePrivateMediaUrl(imageUrl)

    if (privateMedia) {
      if (
        privateMedia.bucket !== PRIVATE_CHEQUE_BUCKET ||
        privateMedia.path[0] !== user.id
      ) {
        return respondWithError('Forbidden image reference.', 403)
      }
      const { data: signedImage, error: signedImageError } =
        await supabase.storage
          .from(privateMedia.bucket)
          .createSignedUrl(privateMedia.path.join('/'), 300)

      if (signedImageError || !signedImage?.signedUrl) {
        return respondWithError('Cheque image not found.', 404)
      }
      providerImageUrl = signedImage.signedUrl
    }

    getOpenAiEnv()
    const { data: quotaConsumed, error: quotaError } = await supabase.rpc(
      'consume_user_quota',
      { requested_feature: 'ai_scan' },
    )
    if (quotaError) throw quotaError
    if (!quotaConsumed) {
      return respondWithError(
        'AI scan quota exhausted. Please subscribe or top-up to continue.',
        402,
      )
    }

    logger.info(`[OcrController] Processing request for user ${user.id}`)
    return Response.json(await ocrProvider.processImage(providerImageUrl))
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

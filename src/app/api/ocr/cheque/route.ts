import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { TABLES } from '@/lib/supabase/tables'
import { getOpenAiEnv } from '@/lib/env/server'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { parsePrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import { OcrRequestSchema } from '@/validators/ocr'
import {
  DEFAULT_OCR_MODEL,
  OpenAiOcrProvider,
} from '@/features/cheques/services/ocr.service'
import {
  getOcrImageMediaType,
  OCR_IMAGE_FORMAT_ERROR,
} from '@/features/cheques/services/ocr-image'
import { executeOcrWorkflow } from '@/features/cheques/services/ocr-workflow'

const ocrProvider = new OpenAiOcrProvider()

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Product policy; a lookup failure must not fail a scan whose quota is already consumed. */
async function resolveScanModel(supabase: ServerClient) {
  const { data, error } = await supabase.rpc('resolve_ai_scan_model')
  const resolved = Array.isArray(data) ? data[0] : null
  if (error || !resolved?.model) {
    logger.warn('[OcrController] Falling back to the default OCR model', {
      error: error?.message ?? 'no model resolved',
    })
    return { product_id: 'unknown', model: DEFAULT_OCR_MODEL }
  }
  return resolved
}

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
    const { imageUrl } = requestResult.data
    const privateMedia = parsePrivateMediaUrl(imageUrl)
    if (!privateMedia || privateMedia.bucket !== PRIVATE_CHEQUE_BUCKET) {
      return respondWithError(
        'Only uploaded cheque images can be scanned.',
        400,
      )
    }
    if (!getOcrImageMediaType(imageUrl)) {
      return respondWithError(OCR_IMAGE_FORMAT_ERROR, 415)
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return respondWithError('Unauthorized', 401)
    setRequestUser(user)

    const { data: profile, error: profileError } = await supabase
      .from(TABLES.PROFILES)
      .select('ai_scan_enabled')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return respondWithError('Active profile required.', 403)
    if (!profile.ai_scan_enabled) {
      return Response.json(
        { error: 'AI Scan Mode is disabled.', code: 'AI_SCAN_DISABLED' },
        { status: 403 },
      )
    }

    const result = await executeOcrWorkflow(imageUrl, user.id, {
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
        if (error) {
          logger.warn('[OcrController] Unable to sign cheque image', {
            status: error.status,
          })
          return null
        }
        if (!data?.signedUrl) {
          logger.warn('[OcrController] Storage returned no signed cheque URL')
          return null
        }
        return data.signedUrl
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
        processImage: async (imageUrl) => {
          const { product_id, model } = await resolveScanModel(supabase)
          logger.info(
            `[OcrController] Processing request for user ${user.id} (product ${product_id}, model ${model})`,
          )
          return ocrProvider.processImage(imageUrl, model)
        },
      },
    })

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

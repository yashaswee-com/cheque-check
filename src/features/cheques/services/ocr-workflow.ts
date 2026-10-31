import { parsePrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import type { ChequeDetails, IOcrProvider } from '@/types/ocr'

export interface OcrWorkflowDependencies {
  consumeRateLimit(): Promise<boolean>
  createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number,
  ): Promise<string | null>
  consumeQuota(): Promise<boolean>
  ensureProviderConfigured(): void
  provider: IOcrProvider
}

export type OcrWorkflowResult =
  | { kind: 'success'; details: ChequeDetails }
  | { kind: 'rate-limited' }
  | { kind: 'forbidden-image' }
  | { kind: 'image-not-found' }
  | { kind: 'quota-exhausted' }

export async function executeOcrWorkflow(
  imageUrl: string,
  userId: string,
  dependencies: OcrWorkflowDependencies,
): Promise<OcrWorkflowResult> {
  if (!(await dependencies.consumeRateLimit())) {
    return { kind: 'rate-limited' }
  }

  let providerImageUrl = imageUrl
  const privateMedia = parsePrivateMediaUrl(imageUrl)

  if (privateMedia) {
    if (
      privateMedia.bucket !== PRIVATE_CHEQUE_BUCKET ||
      privateMedia.path[0] !== userId
    ) {
      return { kind: 'forbidden-image' }
    }

    const signedUrl = await dependencies.createSignedUrl(
      privateMedia.bucket,
      privateMedia.path.join('/'),
      300,
    )
    if (!signedUrl) return { kind: 'image-not-found' }
    providerImageUrl = signedUrl
  }

  dependencies.ensureProviderConfigured()
  if (!(await dependencies.consumeQuota())) {
    return { kind: 'quota-exhausted' }
  }

  return {
    kind: 'success',
    details: await dependencies.provider.processImage(providerImageUrl),
  }
}

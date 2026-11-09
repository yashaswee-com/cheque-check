import { parsePrivateMediaUrl } from '@/lib/storage'

export type OcrImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const mediaTypeByExtension: Record<string, OcrImageMediaType> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export const OCR_IMAGE_FORMAT_ERROR =
  'Only PNG, JPEG, and WebP cheque images are supported.'

export function getOcrImageMediaType(imageUrl: string) {
  const privateMedia = parsePrivateMediaUrl(imageUrl)
  let fileName: string | undefined

  if (privateMedia) {
    fileName = privateMedia.path.at(-1)
  } else {
    try {
      fileName = new URL(imageUrl).pathname.split('/').at(-1)
    } catch {
      return null
    }
  }

  if (!fileName) return null
  const extensionSeparator = fileName.lastIndexOf('.')
  if (extensionSeparator < 0) return null
  const extension = fileName.slice(extensionSeparator + 1).toLowerCase()
  return mediaTypeByExtension[extension] ?? null
}

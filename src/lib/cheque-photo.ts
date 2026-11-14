import { validateImageFile } from './storage'
import { validateImageBounds } from '../../supabase/functions/cheque-ocr/worker'

/** Re-encode camera photos before upload: normalize orientation and remove EXIF metadata. */
export async function prepareChequePhoto(file: File): Promise<File> {
  await validateImageFile(file, 10 * 1024 * 1024)
  validateImageBounds(
    new Uint8Array(await file.arrayBuffer()),
    10 * 1024 * 1024,
  )
  const image = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  })
  try {
    if (
      image.width < 200 ||
      image.height < 80 ||
      image.width * image.height > 64_000_000
    ) {
      throw new Error(
        'Photo dimensions are unsupported. Take a closer photo of one cheque front.',
      )
    }
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Unable to prepare this photo. Try another image.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob || blob.size > 5 * 1024 * 1024)
      throw new Error('Photo is too large. Retake it closer to the cheque.')
    return new File([blob], 'cheque.jpg', { type: 'image/jpeg' })
  } finally {
    image.close()
  }
}

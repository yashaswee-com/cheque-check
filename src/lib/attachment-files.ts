export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_COUNT = 2
export const attachmentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

export function validateAttachmentFiles(files: readonly File[]): boolean {
  return (
    files.length <= MAX_ATTACHMENT_COUNT &&
    files.reduce((total, file) => total + file.size, 0) <=
      MAX_ATTACHMENT_BYTES &&
    files.every(
      (file) =>
        file.size > 0 &&
        file.name.length > 0 &&
        file.name.length <= 255 &&
        !/[\x00-\x1f\x7f]/.test(file.name) &&
        attachmentTypes.some((type) => type === file.type),
    )
  )
}

export async function encodeAttachment(file: File) {
  return new Promise<{ name: string; type: string; data: string }>(
    (resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read attachment'))
      reader.onabort = () =>
        reject(new Error('Attachment reading was cancelled'))
      reader.onload = () => {
        if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
          reject(new Error('Could not read attachment'))
          return
        }
        resolve({
          name: file.name,
          type: file.type,
          data: reader.result.slice(reader.result.indexOf(',') + 1),
        })
      }
      reader.readAsDataURL(file)
    },
  )
}

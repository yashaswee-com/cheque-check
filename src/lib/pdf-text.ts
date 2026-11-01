import type { jsPDF } from 'jspdf'

/** Browser fonts preserve translated text and currency symbols without remote fonts. */
export async function saveTextPdf(
  lines: readonly string[],
  filename: string,
  pageLabel: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PDF canvas unavailable')
  await document.fonts?.ready
  ctx.font = '22px sans-serif'
  const wrapped: string[] = []
  for (const text of lines) {
    let line = ''
    for (const character of text) {
      if (ctx.measureText(line + character).width > 1110) {
        wrapped.push(line)
        line = ''
      }
      line += character
    }
    wrapped.push(line)
  }
  const count = Math.ceil(wrapped.length / 42)
  for (let page = 0; page < count; page++) {
    if (page) pdf.addPage()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111111'
    wrapped
      .slice(page * 42, (page + 1) * 42)
      .forEach((line, row) => ctx.fillText(line, 60, 80 + row * 36))
    ctx.fillText(`${pageLabel} ${page + 1} / ${count}`, 60, 1685)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297)
  }
  await pdf.save(filename, { returnPromise: true })
}

export function addPdfText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
): void {
  if (/^[\x20-\x7e]*$/.test(text)) {
    pdf.text(text, x, y)
    return
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PDF canvas unavailable')
  const fontSize = 44
  ctx.font = `${fontSize}px sans-serif`
  canvas.width = Math.ceil(ctx.measureText(text).width) + 8
  canvas.height = fontSize * 2
  ctx.font = `${fontSize}px sans-serif`
  ctx.fillStyle = '#111111'
  ctx.fillText(text, 4, fontSize)
  const mmPerPixel = (11 * 25.4) / 72 / fontSize
  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    x,
    y - fontSize * mmPerPixel,
    canvas.width * mmPerPixel,
    canvas.height * mmPerPixel,
  )
}

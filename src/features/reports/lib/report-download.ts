export interface ReportDownloadSink {
  download(content: BlobPart[], filename: string, type: string): void
}

export class BrowserReportDownloadSink implements ReportDownloadSink {
  download(content: BlobPart[], filename: string, type: string): void {
    const blob = new Blob(content, { type })
    const link = document.createElement('a')
    if (link.download === undefined)
      throw new Error('File downloads are not supported by this browser')
    const url = URL.createObjectURL(blob)
    try {
      link.href = url
      link.download = filename
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
    } finally {
      link.remove()
      URL.revokeObjectURL(url)
    }
  }
}

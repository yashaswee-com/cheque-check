import type { ChequeWithRelations } from '@/types'
import type { FormattingPreferences } from '@/lib/preference-format'
import type { ReportPdfLabels } from '../lib/business-overview'
import {
  BrowserReportDownloadSink,
  type ReportDownloadSink,
} from '../lib/report-download'
import {
  renderCsvReport,
  renderExcelReport,
  renderJsonReport,
  renderPdfReport,
} from '../lib/report-export-renderers'

export interface ReportPresentation {
  businessName?: string
  pdfLabels?: ReportPdfLabels
  includeInward?: boolean
  preferences: FormattingPreferences | null
  language: string
  title: string
  headers: string[]
  sheet: string
  page: string
  unknownParty: string
  statuses: Record<string, string>
  types: Record<string, string>
}

export interface IReportRepository {
  exportToCSV(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
  exportToJSON(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void>
  exportToPDF(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
  ): Promise<void>
  exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
  ): Promise<void>
}

export class BrowserReportRepository implements IReportRepository {
  constructor(
    private readonly downloadSink: ReportDownloadSink = new BrowserReportDownloadSink(),
  ) {}

  async exportToCSV(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const report = await renderCsvReport(cheques)
    this.downloadSink.download(report.content, filename, report.type)
  }

  async exportToJSON(
    cheques: readonly ChequeWithRelations[],
    filename: string,
  ): Promise<void> {
    if (cheques.length === 0) return
    const report = await renderJsonReport(cheques)
    this.downloadSink.download(report.content, filename, report.type)
  }

  async exportToPDF(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
  ): Promise<void> {
    if (cheques.length === 0)
      throw new Error(
        presentation?.pdfLabels?.empty ??
          'No cheques available for this report.',
      )
    const report = await renderPdfReport(cheques, presentation)
    this.downloadSink.download(report.content, filename, report.type)
  }

  async exportToExcel(
    cheques: readonly ChequeWithRelations[],
    filename: string,
    presentation?: ReportPresentation,
  ): Promise<void> {
    if (cheques.length === 0) return
    const report = await renderExcelReport(cheques, presentation)
    this.downloadSink.download(report.content, filename, report.type)
  }
}

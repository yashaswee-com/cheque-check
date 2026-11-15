import { ChequeWithRelations } from '@/types'
import {
  BrowserReportRepository,
  IReportRepository,
  type ReportPresentation,
} from '@/features/reports/repositories/report.repository'
import { monitorOperation } from '@/lib/monitoring/telemetry'
import { createLazyService } from '@/lib/lazy-service'

export class ReportService {
  constructor(
    private readonly repository: IReportRepository = new BrowserReportRepository(),
  ) {}

  async exportToCSV(
    cheques: ChequeWithRelations[],
    filename = 'cheques_report.csv',
  ): Promise<void> {
    await monitorOperation('report.export_csv', () =>
      this.repository.exportToCSV(cheques, filename),
    )
  }

  async exportToJSON(
    cheques: ChequeWithRelations[],
    filename = 'cheques_report.json',
  ): Promise<void> {
    await monitorOperation('report.export_json', () =>
      this.repository.exportToJSON(cheques, filename),
    )
  }

  async exportToPDF(
    cheques: ChequeWithRelations[],
    filename = 'cheques_report.pdf',
    presentation?: ReportPresentation,
  ): Promise<void> {
    await monitorOperation('report.export_pdf', () =>
      presentation
        ? this.repository.exportToPDF(cheques, filename, presentation)
        : this.repository.exportToPDF(cheques, filename),
    )
  }

  async exportToExcel(
    cheques: ChequeWithRelations[],
    filename = 'cheques_report.xlsx',
    presentation?: ReportPresentation,
  ): Promise<void> {
    await monitorOperation('report.export_excel', () =>
      presentation
        ? this.repository.exportToExcel(cheques, filename, presentation)
        : this.repository.exportToExcel(cheques, filename),
    )
  }
}

export const reportService = createLazyService(
  () => new ReportService(),
  ReportService.prototype,
)

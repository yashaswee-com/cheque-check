import { ChequeWithRelations } from '@/types'
import {
  BrowserReportRepository,
  IReportRepository,
} from '@/features/reports/repositories/report.repository'
import { monitorOperation } from '@/lib/monitoring/telemetry'

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
  ): Promise<void> {
    await monitorOperation('report.export_pdf', () =>
      this.repository.exportToPDF(cheques, filename),
    )
  }

  async exportToExcel(
    cheques: ChequeWithRelations[],
    filename = 'cheques_report.xlsx',
  ): Promise<void> {
    await monitorOperation('report.export_excel', () =>
      this.repository.exportToExcel(cheques, filename),
    )
  }
}

export const reportService = new Proxy(new ReportService(), {
  get(_target, property, receiver) {
    const value = Reflect.get(_target, property, receiver)
    return typeof value === 'function' ? value.bind(_target) : value
  },
})

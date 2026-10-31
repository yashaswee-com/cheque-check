import { describe, expect, it, vi } from 'vitest'
import { ReportService } from './report.service'
import type { IReportRepository } from '@/features/reports/repositories/report.repository'

describe('ReportService', () => {
  it('delegates CSV exports to the injected repository', async () => {
    const repository = {
      exportToCSV: vi.fn(),
      exportToJSON: vi.fn(),
      exportToPDF: vi.fn(),
      exportToExcel: vi.fn(),
    } satisfies IReportRepository
    const service = new ReportService(repository)

    await service.exportToCSV([], 'report.csv')

    expect(repository.exportToCSV).toHaveBeenCalledWith([], 'report.csv')
  })

  it('delegates JSON exports to the injected repository', async () => {
    const repository = {
      exportToCSV: vi.fn(),
      exportToJSON: vi.fn(),
      exportToPDF: vi.fn(),
      exportToExcel: vi.fn(),
    } satisfies IReportRepository
    const service = new ReportService(repository)

    await service.exportToJSON([], 'report.json')

    expect(repository.exportToJSON).toHaveBeenCalledWith([], 'report.json')
  })

  it('delegates PDF and Excel exports to the injected repository', async () => {
    const repository = {
      exportToCSV: vi.fn(),
      exportToJSON: vi.fn(),
      exportToPDF: vi.fn(),
      exportToExcel: vi.fn(),
    } satisfies IReportRepository
    const service = new ReportService(repository)

    await service.exportToPDF([], 'report.pdf')
    await service.exportToExcel([], 'report.xlsx')

    expect(repository.exportToPDF).toHaveBeenCalledWith([], 'report.pdf')
    expect(repository.exportToExcel).toHaveBeenCalledWith([], 'report.xlsx')
  })

  it('does not resolve before the adapter finishes and propagates async failures', async () => {
    let complete!: () => void
    const repository: IReportRepository = {
      exportToCSV: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve
          }),
      ),
      exportToJSON: vi.fn().mockRejectedValue(new Error('Export failed')),
      exportToPDF: vi.fn(),
      exportToExcel: vi.fn(),
    }
    const service = new ReportService(repository)
    const settled = vi.fn()
    const exporting = service.exportToCSV([]).then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    complete()
    await exporting
    expect(settled).toHaveBeenCalledOnce()
    await expect(service.exportToJSON([])).rejects.toThrow('Export failed')
  })
})

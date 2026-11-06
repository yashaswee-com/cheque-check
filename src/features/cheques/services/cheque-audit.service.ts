import {
  type ChequeAuditEvent,
  type ChequeAuditPage,
} from '@/features/cheques/lib/audit-log'
import { SupabaseChequeAuditRepository } from '@/features/cheques/repositories/cheque-audit.repository'

export class ChequeAuditService {
  constructor(
    private readonly repository: SupabaseChequeAuditRepository = new SupabaseChequeAuditRepository(),
  ) {}

  async getByChequeId(
    chequeId: string,
    offset = 0,
    limit = 20,
  ): Promise<ChequeAuditPage> {
    return this.repository.getByChequeId(chequeId, offset, limit)
  }
}

export const chequeAuditService = new ChequeAuditService()
export type { ChequeAuditEvent, ChequeAuditPage }

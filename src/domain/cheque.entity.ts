import { ChequeStatus, ChequeType, ChequeWithRelations } from '@/types'
import { localDay } from '@/lib/preference-format'

function copyRow(row: ChequeWithRelations): ChequeWithRelations {
  return {
    ...row,
    ...(row.party ? { party: { ...row.party } } : {}),
    ...(row.account
      ? {
          account: {
            ...row.account,
            ...(row.account.bank ? { bank: { ...row.account.bank } } : {}),
          },
        }
      : {}),
  }
}

function comparisonDay(asOf: Date | string, timeZone?: string): string {
  return typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf)
    ? asOf
    : localDay(new Date(asOf), timeZone)
}

export class Cheque {
  private readonly row: ChequeWithRelations

  private constructor(row: ChequeWithRelations) {
    this.row = copyRow(row)
  }

  static initialStatusFor(type: ChequeType): ChequeStatus {
    return type === 'Inward' ? 'Received' : 'Issued'
  }

  static canTransitionFor(
    type: ChequeType,
    currentStatus: ChequeStatus,
    nextStatus: ChequeStatus,
  ): boolean {
    return (
      nextStatus !== currentStatus &&
      (nextStatus === 'Cleared' ||
        nextStatus === 'Bounced' ||
        nextStatus === Cheque.initialStatusFor(type))
    )
  }

  static fromRow(row: ChequeWithRelations): Cheque {
    return new Cheque(row)
  }

  get id(): string {
    return this.row.id
  }

  get business_id(): string {
    return this.row.business_id
  }

  get party_id(): string {
    return this.row.party_id
  }

  get account_id(): string {
    return this.row.account_id
  }

  get cheque_number(): string {
    return this.row.cheque_number
  }

  get cheque_number_legacy(): boolean {
    return this.row.cheque_number_legacy ?? false
  }

  get amount(): number {
    return this.row.amount
  }

  get cheque_date(): string {
    return this.row.cheque_date
  }

  get deposit_date(): string | null {
    return this.row.deposit_date
  }

  get remind_before_days(): number | null {
    return this.row.remind_before_days
  }

  get status(): ChequeStatus {
    return this.row.status
  }

  get type(): ChequeType {
    return this.row.type
  }

  get notes(): string | null {
    return this.row.notes
  }

  get image_url(): string | null {
    return this.row.image_url
  }

  get created_at(): string {
    return this.row.created_at
  }

  get updated_at(): string {
    return this.row.updated_at
  }

  get is_draft(): boolean {
    return this.row.is_draft ?? false
  }

  get party(): ChequeWithRelations['party'] {
    return this.row.party ? { ...this.row.party } : undefined
  }

  get account(): ChequeWithRelations['account'] {
    return copyRow(this.row).account
  }

  canTransition(nextStatus: ChequeStatus): boolean {
    // Statuses are correctable, so the only invalid target is the pending
    // status belonging to the opposite cheque type.
    return Cheque.canTransitionFor(this.type, this.status, nextStatus)
  }

  displayStatus(asOf: Date | string = new Date(), timeZone?: string) {
    const today = comparisonDay(asOf, timeZone)
    if (this.status === 'Cleared' || this.status === 'Bounced')
      return this.status
    if (this.cheque_date === today) return 'Today'
    return this.cheque_date < today ? 'Overdue' : 'Upcoming'
  }

  isOverdue(asOf: Date | string = new Date(), timeZone?: string): boolean {
    return this.displayStatus(asOf, timeZone) === 'Overdue'
  }

  toJSON(): ChequeWithRelations {
    return copyRow(this.row)
  }
}

import type { Account } from '@/types'

export function selectDefaultAccount(
  accounts: Account[] | undefined,
  defaultId: string,
): Account[] | undefined {
  return accounts?.map((account) => ({
    ...account,
    is_default: account.id === defaultId,
  }))
}

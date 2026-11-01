import { expect, it } from 'vitest'
import type { Account } from '@/types'
import { selectDefaultAccount } from './default-account'

it('keeps only the selected account default without mutating cached rows', () => {
  const accounts = [
    { id: 'old', is_default: true },
    { id: 'new', is_default: false },
  ] as Account[]
  expect(selectDefaultAccount(accounts, 'new')).toEqual([
    { id: 'old', is_default: false },
    { id: 'new', is_default: true },
  ])
  expect(accounts[0].is_default).toBe(true)
  expect(
    selectDefaultAccount(accounts, 'pending-new-account')?.some(
      (account) => account.is_default,
    ),
  ).toBe(false)
  expect(selectDefaultAccount(undefined, 'new')).toBeUndefined()
})

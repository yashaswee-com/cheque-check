// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { accountSchema } from '@/validators'
import {
  accountDraftToFormValues,
  toAccountDraftFields,
} from '@/features/drafts/lib/draft-fields'
import { createMigratedDb, asUser } from '@/test/migrated-db'
describe('account logo persistence', () => {
  it('retains uploaded logos through draft restore and validated publication', () => {
    const draft = toAccountDraftFields({
      bank_id: 'bank',
      account_name: 'A',
      account_number: '123',
      logo_url: 'avatars/a.png',
    })
    expect(accountDraftToFormValues(draft).logo_url).toBe('avatars/a.png')
    expect(accountSchema.parse(accountDraftToFormValues(draft)).logo_url).toBe(
      'avatars/a.png',
    )
    expect(toAccountDraftFields({ logo_url: null }).logo_url).toBeNull()
  })
  it('persists the new column on the real schema without exposing foreign accounts', async () => {
    const db = await createMigratedDb(['20261105000000_account_logos.sql'])
    try {
      const a = '10000000-0000-4000-8000-000000000001',
        b = '10000000-0000-4000-8000-000000000002'
      await db.exec(`INSERT INTO auth.users(id,email) VALUES('${a}','a@test.invalid'),('${b}','b@test.invalid');
        INSERT INTO businesses(id,user_id,name) VALUES('${a}','${a}','A'),('${b}','${b}','B');
        INSERT INTO accounts(id,business_id,account_name,account_number,logo_url) VALUES('${a}','${a}','A','123','avatars/a.png')`)
      const own = await asUser<{ logo_url: string }>(
        db,
        a,
        'SELECT logo_url FROM accounts',
      )
      expect(own.rows[0].logo_url).toBe('avatars/a.png')
      expect(
        (await asUser(db, b, 'SELECT logo_url FROM accounts')).rows,
      ).toEqual([])
    } finally {
      await db.close()
    }
  }, 60000)
})

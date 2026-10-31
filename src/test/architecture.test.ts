import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const eslint = new ESLint()
const architectureRules = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
])

beforeAll(async () => {
  await eslint.calculateConfigForFile(
    resolve('src', 'components', 'bank-selector.tsx'),
  )
}, 30000)

async function violations(code: string, file: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(file) })
  return result.messages.filter((message) =>
    architectureRules.has(message.ruleId ?? ''),
  )
}

describe('shared-layer lint boundaries', () => {
  it.each([
    [
      "import { createClient } from '@supabase/supabase-js'",
      'src/features/accounts/repositories/account.repository.ts',
    ],
    [
      "import { createClient } from '@/lib/supabase/client'",
      'src/components/bank-selector.tsx',
    ],
    [
      "import { SupabaseAccountRepository } from '@/features/accounts/repositories/account.repository'",
      'src/app/(dashboard)/accounts/page.tsx',
    ],
    [
      "import { useQuery as query } from '@tanstack/react-query'",
      'src/components/bank-selector.tsx',
    ],
    ["import { z } from 'zod'", 'src/features/accounts/hooks/use-accounts.ts'],
    [
      "db.from('accounts')",
      'src/features/accounts/repositories/account.repository.ts',
    ],
    [
      "useQuery({ queryKey: ['accounts', id] })",
      'src/features/accounts/hooks/use-accounts.ts',
    ],
  ])('rejects a layer bypass: %s', async (code, file) => {
    expect(await violations(code, file)).not.toHaveLength(0)
  })

  it.each([
    [
      "import type { SupabaseClient } from '@supabase/supabase-js'",
      'src/features/auth/repositories/auth.repository.ts',
    ],
    [
      "import { createClient } from '@supabase/supabase-js'",
      'src/lib/supabase/admin.ts',
    ],
    ["import { z } from 'zod'", 'src/validators/profile.ts'],
    ["import { z } from 'zod'", 'src/features/accounts/validators/example.ts'],
    ["import type { z } from 'zod'", 'src/types/forms.ts'],
    [
      "import { useQuery } from '@tanstack/react-query'",
      'src/features/accounts/hooks/use-accounts.ts',
    ],
    [
      "import { useQueryClient } from '@tanstack/react-query'",
      'src/features/cheques/components/print-layout-editor.tsx',
    ],
    [
      'db.from(TABLES.ACCOUNTS); useQuery({ queryKey: queryKeys.accounts.list(id) })',
      'src/features/accounts/hooks/use-accounts.ts',
    ],
  ])('allows a canonical layer dependency: %s', async (code, file) => {
    expect(await violations(code, file)).toHaveLength(0)
  })
})
// @vitest-environment node

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const supabaseImports = {
  group: ['@supabase/*'],
  allowTypeImports: true,
  message:
    'Use the canonical clients in @/lib/supabase; SDK types may be imported with import type.',
}
const zodImport = {
  name: 'zod',
  allowTypeImports: true,
  message:
    'Define runtime schemas in shared or feature validators, and import the canonical schema.',
}
const testFiles = ['**/*.test.{ts,tsx}', 'src/test/**']

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
  {
    files: [
      'src/features/reports/**/*.{ts,tsx}',
      'src/features/cheques/repositories/cheque.repository.ts',
      'src/features/premium-workspace/repositories/workspace.repository.ts',
      'src/repositories/base.repository.ts',
      'src/lib/errors.ts',
      'src/validators/persisted-cheque.ts',
      'src/validators/premium-workspace.ts',
      'src/app/(dashboard)/reports/page.tsx',
      'src/domain/**/*.ts',
      'src/lib/lazy-service.ts',
      'src/validators/persisted-draft.ts',
      'src/features/{accounts,auth,businesses,cheques,drafts,monetization,parties,profile,tags}/services/**/*.ts',
      'src/features/drafts/repositories/**/*.ts',
      'src/features/cheques/hooks/use-ocr-extraction*.ts',
      'src/features/cheques/hooks/use-cheque-publish-confirmation.ts',
      'src/features/cheques/lib/publication.ts',
    ],
    ignores: testFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/supabase/**', ...testFiles],
    rules: {
      'no-restricted-imports': ['error', { patterns: [supabaseImports] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/validators/**',
      'src/lib/supabase/**',
      'src/lib/env/schema.ts',
      'src/features/monetization/constants.ts',
      ...testFiles,
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [zodImport],
          patterns: [supabaseImports],
        },
      ],
    },
  },
  {
    files: [
      'src/app/**/*.tsx',
      'src/components/**/*.{ts,tsx}',
      'src/features/*/components/**/*.{ts,tsx}',
    ],
    ignores: testFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            zodImport,
            {
              name: '@tanstack/react-query',
              importNames: [
                'useQuery',
                'useMutation',
                'useInfiniteQuery',
                'useSuspenseQuery',
                'useSuspenseInfiniteQuery',
                'useQueries',
                'useSuspenseQueries',
              ],
              message:
                'Keep data queries and mutations in shared or feature hooks.',
            },
          ],
          patterns: [
            supabaseImports,
            {
              group: ['@/lib/supabase/client', '@/lib/supabase/admin'],
              message:
                'Use feature hooks or services instead of accessing a Supabase client from UI.',
            },
            {
              group: [
                '@/repositories/**',
                '@/features/*/repositories/**',
                '**/repositories/**',
              ],
              allowTypeImports: true,
              message:
                'Use feature hooks or services instead of calling repositories from UI.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: testFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.type='Literal'][arguments.0.raw=/^['\"]/]",
          message:
            'Use TABLES for database table names, or the canonical storage bucket constants.',
        },
        {
          selector: "Property[key.name='queryKey'] > ArrayExpression",
          message:
            'Use queryKeys from @/lib/query-keys instead of declaring a local cache key.',
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/features/**/*.use-case.ts'],
    ignores: testFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [zodImport],
          patterns: [
            supabaseImports,
            {
              group: [
                'react',
                'react/**',
                'next',
                'next/**',
                'razorpay',
                '@tanstack/react-query',
                '@/lib/supabase/**',
                '@/components/**',
                '@/hooks/**',
                '@/services/**',
                '@/repositories/**',
                '@/features/*/components/**',
                '@/features/*/hooks/**',
                '@/features/*/repositories/**',
                '**/*.adapters',
              ],
              allowTypeImports: true,
              message:
                'Keep domain rules and application use cases independent of UI, transport, and concrete persistence adapters.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig

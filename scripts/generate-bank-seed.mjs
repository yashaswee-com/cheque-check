import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const catalog = JSON.parse(
  readFileSync(
    new URL('../supabase/reference/banks.json', import.meta.url),
    'utf8',
  ),
)
const quote = (value) => `'${value.replaceAll("'", "''")}'`
const sources = catalog.sources
  .map(
    (source, index) =>
      `      (${index}, ${quote(source.url)}, ${quote(source.source_as_of)}::date)`,
  )
  .join(',\n')
const banks = catalog.banks
  .map(
    (bank) =>
      `      (${quote(bank.name)}, ${quote(bank.category)}, ${bank.source})`,
  )
  .join(',\n')
const sql = `-- Generated from supabase/reference/banks.json by scripts/generate-bank-seed.mjs.
-- RBI source lists are dated; inclusion does not certify current cheque-service availability.
CREATE OR REPLACE FUNCTION public.seed_reference_banks()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $seed$
  INSERT INTO public.banks (name, category, source_url, verified_on)
  SELECT b.name, b.category::public.bank_category, s.url, ${quote(catalog.retrieved_on)}::date
  FROM (VALUES
${banks}
  ) AS b(name, category, source)
  JOIN (VALUES
${sources}
  ) AS s(id, url, source_as_of) ON s.id = b.source
  ON CONFLICT (public.bank_name_key(name)) WHERE owner_id IS NULL AND deleted_at IS NULL
  DO UPDATE SET category = EXCLUDED.category, source_url = EXCLUDED.source_url,
    verified_on = EXCLUDED.verified_on;
$seed$;
REVOKE ALL ON FUNCTION public.seed_reference_banks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_reference_banks() TO service_role;
SELECT public.seed_reference_banks();
`
const destination = new URL(
  '../supabase/migrations/20261021030100_seed_bank_catalog.sql',
  import.meta.url,
)
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== sql) {
    throw new Error(
      'Bank seed is stale. Run node scripts\\generate-bank-seed.mjs.',
    )
  }
} else {
  writeFileSync(destination, sql)
}
console.log(
  `${catalog.banks.length} dated bank references: ${fileURLToPath(destination)}`,
)

# Bank catalog

The bank selector combines shared reference entries with user-private custom banks. Reference rows are seeded by migrations; custom rows are owner-scoped and can be used by that owner's business accounts ([catalog migration](../supabase/migrations/20261021030000_bank_catalog.sql#L1-L65), [bank repository](../src/features/accounts/repositories/bank.repository.ts#L1-L58)).

## Quick reference

- The reference snapshot and seed generator define the shared catalog source ([reference data](../supabase/reference/banks.json#L1-L20), [seed generator](../scripts/generate-bank-seed.mjs#L1-L58)).
- Custom banks are private to the owner; database policies prevent cross-owner access ([bank policies](../supabase/migrations/20261021030000_bank_catalog.sql#L1-L65)).
- Custom-bank removal is soft and blocked while an active account or draft refers to the bank ([bank lifecycle](../supabase/migrations/20261021030000_bank_catalog.sql#L66-L130), [lifecycle dependency checks](../supabase/migrations/20261021000000_lifecycle.sql#L188-L252)).
- IFSC formatting is checked as an account field; it is not a live branch or account verification ([account schema](../src/validators/index.ts#L47-L54), [validator test](../src/validators/index.test.ts#L60-L74)).

## Catalog source and ownership

The checked-in JSON snapshot records reference names and source metadata, and the generator produces the corresponding seed SQL ([reference JSON](../supabase/reference/banks.json#L1-L20), [seed generator](../scripts/generate-bank-seed.mjs#L1-L58)). The migration seed function writes shared catalog rows while preserving existing identities ([seed migration](../supabase/migrations/20261021030100_seed_bank_catalog.sql#L1-L80)). Catalog counts may change with a reviewed source snapshot; use the current JSON and generator rather than a historic total ([generator](../scripts/generate-bank-seed.mjs#L1-L58)).

Custom bank rows carry an owner and are governed by RLS; account writes cannot refer to another user's private bank ([bank policies](../supabase/migrations/20261021030000_bank_catalog.sql#L1-L65), [account reference checks](../supabase/migrations/20261021000000_lifecycle.sql#L90-L149)). Custom banks are soft-deleted through a dedicated database path and dependency checks ([custom bank lifecycle](../supabase/migrations/20261021030000_bank_catalog.sql#L66-L130)).

## Selector behavior

The account feature fetches bank rows through a repository, and its selector pages visible options while preserving search behavior ([bank repository](../src/features/accounts/repositories/bank.repository.ts#L1-L58), [bank hook](../src/features/accounts/hooks/use-banks.ts#L1-L31)). Search, private-bank creation, and duplicate handling live in the account feature ([bank service](../src/features/accounts/services/bank.service.ts#L1-L77)).

## Validation and limits

The seed generator provides a `--check` mode to compare generated SQL with the checked-in reference snapshot ([generator](../scripts/generate-bank-seed.mjs#L1-L58), [seed test](../src/features/accounts/lib/bank-catalog.test.ts#L1-L68)). The account validator checks IFSC format but does not query a live registry or verify branch/account existence ([account schema](../src/validators/index.ts#L47-L54)).

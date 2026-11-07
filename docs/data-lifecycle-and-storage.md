# Data lifecycle and storage

User-owned records use logical deletion and lifecycle authorization rather than ordinary physical deletion. Private media and report exports use private storage access paths ([lifecycle migration](../supabase/migrations/20261021000000_lifecycle.sql#L188-L280), [private media bucket policy](../supabase/migrations/20260924030000_add_private_media_buckets.sql#L1-L56)).

## Quick reference

- Ordinary deletion calls lifecycle RPCs that mark rows deleted and preserve batch metadata ([delete RPC](../supabase/migrations/20261021000000_lifecycle.sql#L188-L280)).
- User-facing recovery is not available; audited operator recovery uses service-role-only paths ([recovery RPC](../supabase/migrations/20261021000000_lifecycle.sql#L280-L354), [ops CLI](../scripts/README.md#L180-L230)).
- Account/party deletion is blocked while nondeleted cheques reference them ([reference checks](../supabase/migrations/20261021000000_lifecycle.sql#L188-L252)).
- Private media reads require an authenticated owner and a live record reference; the route creates a short-lived signed URL ([media authorization route](../src/app/api/storage/%5Bbucket%5D/%5B...path%5D/route.ts#L14-L61)).

## Lifecycle model

Database lifecycle metadata is server-controlled, and active owner/business conditions are enforced for reads and writes ([lifecycle policies](../supabase/migrations/20261021000000_lifecycle.sql#L36-L149)). Deletes mark rows and descendants with a batch ID; recovery uses transactional parent-before-child checks and is restricted to service-role operations ([delete function](../supabase/migrations/20261021000000_lifecycle.sql#L188-L280), [restore function](../supabase/migrations/20261021000000_lifecycle.sql#L280-L354)).

Account and party deletion checks all nondeleted referencing cheques, including drafts and cleared history, before changing lifecycle state ([dependency checks](../supabase/migrations/20261021000000_lifecycle.sql#L188-L252)). Tag removal detaches associations rather than deleting the tagged entity ([tag lifecycle](../supabase/migrations/20261021000000_lifecycle.sql#L252-L280)).

The lifecycle implementation does not introduce a general hard-erasure/purge policy for retained business records ([lifecycle policy](../supabase/migrations/20261021000000_lifecycle.sql#L188-L354)). This is a material privacy/retention boundary; operational policy must not claim physical erasure unless a separate verified process exists.

## Private media

Private avatar and cheque-image buckets are configured with owner-folder policies and upload constraints ([bucket migration](../supabase/migrations/20260924030000_add_private_media_buckets.sql#L1-L56)). The application route authenticates a request, checks the owner path and active reference, then signs an object URL ([storage route](../src/app/api/storage/%5Bbucket%5D/%5B...path%5D/route.ts#L14-L61), [database reference check](../supabase/migrations/20261021000000_lifecycle.sql#L420-L443)). Private exports use a separate bucket and owner-scoped policies ([export storage policy](../supabase/migrations/20261031040000_background_exports.sql#L29-L55)).

## Database evolution

Database definitions are versioned in forward migrations; package scripts support Supabase setup, reset, and function deployment ([Supabase scripts](../package.json#L25-L40)). A checked-in migration does not prove it has been applied to any particular hosted project; verify migration history for the target before deploying dependent code ([deployment boundary](infrastructure-and-deployment.md#deployment-verification)).

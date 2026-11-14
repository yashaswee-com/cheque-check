# AI cheque scanning

The scanner is a bounded extraction workflow, not an autonomous agent. The browser uploads an owned cheque-front image and saves its draft before the authenticated [scan API](../src/app/api/ocr/cheque/route.ts) creates a durable database job. The [migration](../supabase/migrations/20261114010000_durable_cheque_ocr.sql) dispatches it through pg_net to the service-authorized [Edge worker](../supabase/functions/cheque-ocr/index.ts). Browser polling observes work; it does not execute or sustain it.

## User experience

- One Indian cheque front per image; no PDFs, multiple-cheque collages, or back-only extraction.
- Camera uploads accept JPEG, PNG, and WebP up to 10 MiB and 16 million pixels. [Photo preparation](../src/lib/cheque-photo.ts) checks dimensions before browser decoding, normalizes orientation, strips metadata by re-encoding, and scales the upload to at most 2400 pixels on its longest side. The worker independently checks signatures/dimensions and rejects animation/oversized input; provider decoding can still reject corrupt images.
- Versioned disclosure/acknowledgment is required before images go to OpenAI. Manual entry and the existing AI-off preference remain available.
- Upload, scanning, review, failure, timeout, cancellation, expiration, and recovery are explicit states in the [review panel](../src/features/cheques/components/ocr-review.tsx). An all-null or unusable result is not success.
- Uploaded, accepted scans recover by reopening the same draft, including another signed-in device. Unuploaded photos do not survive browser closure.
- The server processing deadline is seven seconds from acceptance, including dispatch and retries, not upload or human review. Expired work cannot be revived by polling/restart or apply late results. This is a deadline policy, not a guarantee of seven-second provider success or instantaneous feedback on a disconnected device.
- Retake guidance and manual entry remain available when the image is unreadable. Newer manual field edits and superseded-image results are protected by the [client controller](../src/features/cheques/hooks/use-ocr-extraction.ts).

## Reliability and matching

The [shared extraction contract](../supabase/functions/cheque-ocr/contract.ts) separates drawer account/name from payee, preserves leading zeros, checks real dates, positive two-decimal amounts and IFSC format, and rejects invalid candidates rather than inventing repairs. Image content is untrusted data. The provider has no tools, browsing, record-writing, or directory access. Structured output is validated independently; schema validity and a model's certainty do not prove correctness.

Fields are high / needs review / unusable, with reasons. **Automatic high-reliability charging is disabled by default until representative evaluation supports it.** Otherwise valid candidates require explicit verification. Algorithmic entity scores rank matches and are not calibrated accuracy percentages.

| Direction            | External Party                                                 | Business Account                                                                           |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Receiving (`Inward`) | Printed drawer, supported by confirmed party-bank associations | User's receiving account; handwritten payee may suggest the business, not a unique account |
| Issuing (`Outward`)  | Payee                                                          | Printed business issuing account                                                           |

Candidates come from fresh business-scoped server records. Only a unique full account/IFSC match with sufficient field reliability can be selected automatically. Fuzzy/name/partial matches are suggestions. Parties are never silently merged or created. Confirmation can retain payer-bank evidence within the same business; issuing mode does not associate the business's printed bank account with an external payee.

Name ranking uses bounded edit distance over at most 80 normalized characters, searches up to 500 records per entity type, and returns five candidates. Confirmed identity evidence is considered separately. Thresholds are provisional, not validated confidence probabilities; if a record is not suggested, users can use the normal selectors.

Creation is explicit, server-rechecked, idempotent per scan intent, and requires a real party contact rather than a fabricated placeholder. A duplicate warning requires renewed confirmation before creating an intentionally separate same-name party.

Duplicate-cheque warnings are distinct from entity matching and retry identity. A scan-scoped explicit override is bound to the exact draft/account/cheque number; ordinary duplicate uniqueness remains enforced. Changing identity requires reconfirmation.

## Credits and durable state

- Each logical start has an idempotency key and atomic credit reservation. Lost responses and duplicate clicks recover the same start, not a second charge.
- `ready_high` commits the result and charge atomically, only when evaluated automatic charging is enabled.
- `ready_partial` retains a reservation for up to 24 hours. Explicit acceptance verifies useful critical-field candidates and finalizes once. Expiration/cancellation releases the reservation.
- Failure, no useful result, cancellation that wins the completion race, or timeout releases customer credit. Provider processing/cost may nevertheless have occurred.
- A completion that already won the race remains completed/charged; cancellation must not falsely report a refund.
- Claim tokens fence stale workers. Before further provider attempts, the worker rechecks deadline, cancellation, configuration, and ownership. Only one retry of a definitive transient HTTP rejection is allowed when Retry-After and remaining time permit. Uncertain network outcomes are not blindly retried.
- Reservations are reconciled independently of browsers. Quota-period changes do not refund an old reservation into a new period. Accounting/idempotency evidence is retained separately from temporary scan content.

## Deployment and enablement

No local test certifies hosted deployment, latency, throughput, provider terms, or OCR accuracy.

1. Apply existing prerequisite migrations and the durable OCR migration with scanning disabled. It expects the repository's existing pg_cron, pg_net, and Vault infrastructure; do not silently skip missing extensions.
2. Deploy `cheque-ocr` through the existing function deployment command. Configure `OPENAI_API_KEY` **in the Edge environment**, alongside Supabase-provided URL/service-role credentials. The old Next.js-only API-key setup is insufficient.
3. Verify existing Vault `project_url` and `service_role_key` are configured/valid without printing values. Immediate dispatch posts `{job_id}` to `${project_url}/functions/v1/cheque-ocr` with service authorization after the job transaction commits.
4. Verify cron `cheque-ocr-recovery` is installed and runs every minute. It independently expires interrupted work, settles reservations, and performs retention cleanup. A minute-scale recovery schedule does not extend an original seven-second deadline.
5. Configure the singleton `public.cheque_scan_config` using service/operator access. Defaults are deliberately fail-closed:

   | Column                     | Initial setting                        |
   | -------------------------- | -------------------------------------- |
   | `enabled`                  | `false`                                |
   | `auto_charge_enabled`      | `false`                                |
   | `max_in_flight`            | `10`                                   |
   | `daily_scan_limit`         | `1000`                                 |
   | `daily_spend_limit_micros` | `0` (must configure before enablement) |
   | `scan_cost_ceiling_micros` | `100000`                               |

   Cost settings are conservative provider-cost admission estimates in millionths of a currency unit, not customer-credit prices or measured invoices. Set them consistently with provider billing and a per-scan ceiling covering permitted retries. These defaults are not capacity promises.

6. Measure immediate dispatch, cold starts, acceptance-to-result latency, provider quotas and concurrent database locks in QA. Admission is bounded; overload must reject explicitly rather than queue beyond the deadline.
7. Evaluate authorized representative banks/scripts/handwriting/quality cases. Synthetic fixtures validate behavior but cannot certify real-world accuracy. Record critical-field precision, false high classifications, coverage/abstention, correction rate, timeout rate, and operating cost before enabling automatic high charging.
8. Verify Android review/retake/recovery, consent/localization, cancellation/deadline races, cross-device ownership, no duplicate charges/entities, and the scoped duplicate override.
9. Enable scanning for all customers only after these gates. Keep automatic high charging off until its additional quality evidence exists. No gradual customer rollout is required by this implementation.

## Operations, privacy, and recovery

- Kill switch: set `cheque_scan_config.enabled=false`. This blocks admission/continuation; reconcile existing work. Do not delete the ledger or drop tables to disable scanning.
- Monitor content-free `ocr.scan.settled`, `ocr.provider.usage`, and worker failure events alongside database job outcomes, reservation age, timeout/failure rate, and admission/spend limits. Provider token counts are usage evidence, not a guaranteed invoice amount.
- Configure alerts in the deployed monitoring platform for stuck jobs, missed recovery ticks, settlement failures, provider throttling, and spend/deadline spikes; local code does not provision external alert policies.
- If dispatch or a worker fails, restore it and run recovery. Jobs beyond their original deadline become timed out; do not restart paid inference silently. A retry is a controlled new attempt.
- Retain normalized results up to seven days, job operational metadata up to 30 days, and confirmed party-bank associations while needed. Ordinary cheque deletion does not automatically erase independently confirmed associations. Active ownership/image checks still govern every access; account/business deletion and explicit erasure follow lifecycle/privacy requirements.
- Do not persist/log raw provider payloads, signed URLs, image data, prompts containing cheque data, or extracted financial values. The OCR review/creation surfaces are marked private for recording.
- Verify provider processing/retention/region terms separately; neither local settings nor consent establishes zero provider retention or India-only processing.
- Roll back by disabling new starts while preserving reconciliation and result access. Never switch back to consume-before-provider accounting while reservations exist.

## Local verification

```sh
npm test -- supabase/tests/cheque-ocr.test.ts \
  src/features/cheques/services/scan-guardrails.test.ts \
  src/features/cheques/hooks/use-ocr-extraction.test.tsx \
  src/features/cheques/hooks/cheque-scan-draft.integration.test.tsx \
  src/features/cheques/components/ocr-review.test.tsx \
  src/app/api/ocr/cheque/route.test.ts src/lib/cheque-photo.test.ts
deno check --no-lock supabase/functions/cheque-ocr/index.ts
npm run type-check
npm run build
```

Use the repository-supported Node 22 runtime. Database tests use PGlite and serialized connections; hosted multi-session contention, pg_net dispatch, real provider quality/cost, and live Android/device recovery still require deployment verification.

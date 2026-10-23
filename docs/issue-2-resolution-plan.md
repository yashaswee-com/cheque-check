# Resolution plan: 25 product, data, authentication, and UX issues

Status: implementation changes are committed on `feat/issue-2-resolution`.

This document records the requirements and implementation approach for the
reported backlog. Production rollout is separate: apply and verify database
migrations, configure deployment secrets, and validate external SMS/voice
providers in their intended environments before enabling live delivery.

## 1. Findings from the current repository

These are source-level observations, not claims about deployed environments.

| Area             | Current evidence                                                                                                                                                                  | Consequence                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Soft deletion    | Profiles, businesses, parties and accounts have `deleted_at`; cheque deletion and draft deletion call physical DELETE. Tag deletion and tag detachment also call physical DELETE. | A consistent database-level lifecycle is needed, not just additional client filters.                                          |
| Tags             | `tags` has unconditional name uniqueness; `entity_tags` has a composite primary key and no deletion metadata.                                                                     | Reuse, reattachment, usage counts, recovery and ownership must be designed together.                                          |
| Loading          | The shared Skeleton defaults to staggered entry/exit and creates exit ghosts.                                                                                                     | Remove the shared stagger mechanism rather than patch individual screens.                                                     |
| Voice operations | `voice sample --user` and `voice trigger-business --user` already exist. Immediate dispatch invokes the general dispatcher.                                                       | Reuse targeted scheduling and add strict dispatch isolation, rather than build another calling pipeline.                      |
| Phone auth       | Auth repository exposes password/OAuth, not phone OTP; checked-in Supabase SMS and Twilio configuration is disabled.                                                              | Add the complete auth flow and provider configuration. Remote readiness is unknown.                                           |
| Premium          | Seven paid panels live in a separate workspace, backed by existing services, RPCs and access-policy helpers.                                                                      | Relocate workflows without replacing the entitlement model or losing saved tools.                                             |
| Navigation       | Bottom nav is fixed but visible only on seven exact paths. Top nav has its own, inconsistent route list.                                                                          | Centralize visibility semantics and validate the actual layout on devices.                                                    |
| Duplication      | Cheque detail creates a draft with ordinary fields but does not copy tags or reminder settings.                                                                                   | Duplicate draft creation and tag copying must become atomic.                                                                  |
| Banks            | Reset seed contains 13 bank names; selector placeholder and selected avatar use different footprints.                                                                             | Expand a verified catalog, support private additions, and stabilize selector geometry.                                        |
| Statistics       | Dashboard uses direction totals and status totals in the same pie. The shared hook treats every non-Cleared cheque as outstanding.                                                | Slices overlap and Bounced cheques affect pending metrics incorrectly.                                                        |
| Storage          | Private buckets and a legacy-media migration already exist; the media route checks owner path before signing a URL.                                                               | Remove manual setup friction while preserving private storage; deleted-record visibility needs reference-aware authorization. |

Primary implementation references:

- [Tag repository](../src/features/tags/repositories/tag.repository.ts)
- [Cheque repository](../src/features/cheques/repositories/cheque.repository.ts)
- [Draft repository](../src/features/drafts/repositories/draft.repository.ts)
- [Skeleton](../src/components/ui/skeleton.tsx)
- [Voice commands](../scripts/commands/voice.ts)
- [Notification domain helpers](../scripts/domain/notifications.ts)
- [Auth repository](../src/features/auth/repositories/auth.repository.ts)
- [Supabase configuration](../supabase/config.toml)
- [Premium workspace service](../src/features/premium-workspace/service.ts)
- [Premium access policy](./premium-access.md)
- [Dashboard](<../src/app/(dashboard)/dashboard/page.tsx>)
- [Cheque statistics](../src/features/cheques/hooks/use-cheque-stats.ts)
- [Media route](../src/app/api/storage/[bucket]/[...path]/route.ts)

## 2. Behavior requirements

### Data lifecycle

- Soft-delete all user-deletable saved records, including tags, attachments,
  drafts, Premium saved tools/layouts and private custom banks.
- Retain soft-deleted rows indefinitely for now. Recovery is admin-only;
  no Trash UI or scheduled purge is included.
- Preserve immutable financial, delivery and administrative audit records.
  They are not ordinary user-deletable objects.
- Deleting a business soft-deletes its business-owned records atomically.
  Shared reference banks and user-private banks are not business descendants.
- Block account/party deletion when nondeleted cheque records reference them.
  "Nondeleted" is independent of payment status: Cleared historical records
  still carry references. Include draft references in the dependency check.
- Deleting a tag deletes its attachments logically, never the tagged entities.
- Permit reuse of identifiers/names where uniqueness is scoped to active rows.
- Recovery restores only a selected deletion batch, not earlier independent
  deletions. Report uniqueness conflicts; do not overwrite or auto-rename.
- Normal Delete account means reversible deactivation, not permanent erasure.
  Deny access immediately and revoke sessions; do not rely on a profile flag
  or sign-out alone to invalidate already issued access.
- Retain deleted/replaced private media. Ordinary app/storage access must not
  expose deleted-only media. Preserve access through legitimate active
  references when an object is shared.
- Permanent privacy erasure and financial/legal retention require a separate
  documented admin policy. No automatic permanent erasure is in this scope.

### Enumerated values

- Use PostgreSQL ENUMs for genuinely closed categorical sets, with matching
  generated TypeScript types and runtime validation.
- Use catalog references for expandable choices such as products and banks.
- Inventory every finite-choice field before conversion, including profile
  options, tag entity types, notification channels/statuses/purposes and saved
  tool kinds. Do not silently map unknown stored values to a default.
- Bounded numeric measurements are not categorical enums: retain suitable
  numeric constraints for scores, amounts and numeric ranges. For numeric UI
  choices, explicitly classify whether the persisted value is a closed choice
  or a configurable quantity before choosing its representation.
- Do not freeze external extensible standards such as IANA time zones into an
  application enum merely because today's picker has a short list.
- Keep the four existing cheque statuses: Issued, Received, Cleared, Bounced.
  Do not add Cancelled.

### Phone login and operations

- Add phone OTP alongside email/password and existing OAuth methods.
- Permit phone signup and onboarding; support accounts without email.
- Restrict initial OTP sending to Indian +91 numbers. Enforce this at a trusted
  boundary, not just the country picker.
- Use Supabase Auth phone OTP with a supported Twilio SMS provider.
  Supabase remains the authentication/session authority; do not introduce a
  second, competing OTP validation system.
- Verified login phone is separate from the reminder contact phone.
- Existing users link a phone while authenticated and after OTP verification.
  Never auto-link or merge accounts using an unverified profile phone.
  Conflicts must stop with clear support guidance.
- Apply provider-supported resend/rate limits, expiry and CAPTCHA controls.
- Voice ops supports sample calls and actual due-cheque reminders, one
  business or explicitly selected eligible businesses for one user.
- Respect opt-in, valid recipient, access and quota. Send-now may bypass only
  the scheduled time after confirmation, not eligibility rules.
- Immediate targeted dispatch must process only the selected jobs for that
  request/user. Keep global cron dispatch behavior unchanged.

### UI and product contracts

- Remove staggered skeleton entry/exit only. Keep simultaneous subtle pulse,
  unrelated interaction motion, and reduced-motion support.
- Rename product display labels consistently; keep stable IDs, prices, quotas,
  durations and entitlement semantics unchanged.
- Features keeps purchase/upgrade controls, access/quota refresh, voice setup
  and test calls. Remove payment history/activity links and its bottom footer.
  Settings > Transactions remains the history destination.
- Premium tools become native actions/panels in existing screens. Preserve
  access rules, contextual locked actions, saved data and old deep links.
- New Party becomes a single-page mobile-first form with editable contact
  import, manual fallback, primary name/phone fields, collapsed optional
  details, duplicate warnings, drafts and existing Premium contact gating.
- Bottom nav appears on authenticated viewing/list/detail/settings/report
  screens; exclude auth, onboarding, create/edit and deliberate full-screen
  workflows. Hide it while the software keyboard is open.
- Top nav keeps title/back and search; use a compact business-switcher row
  where relevant and an accessible More menu for secondary actions.
- Dashboard quick actions scroll horizontally as equal-size tiles.
- Remove Delete from cheque cards only; keep confirmed deletion on detail.
- Blur/dim the background while Tag Selector is open, without blurring the
  selector or breaking nested overlays and keyboard/focus behavior.
- Extend the existing Button for configurable pending states rather than
  introduce another button design system.
- Update English, Hindi and Hinglish. Avoid unrelated visual redesign.

## 3. Delivery sequence and issue coverage

| Release                         | Issues                    | Scope                                                                                 | Prerequisites                                               |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A: data foundation              | 1, 4, 5                   | Lifecycle inventory, database soft deletion, recovery provenance, closed-choice types | Confirmed policies; isolated DB fixture                     |
| B: shared UI and shell          | 2, 15, 17, 18, 19, 20, 23 | Loading, navigation, quick actions, card cleanup, selector backdrop                   | Route inventory; Button and overlay contracts               |
| C: correctness                  | 16, 25                    | Atomic tagged duplication and non-overlapping statistics                              | A; date/status contracts                                    |
| D: commerce clarity             | 3, 8, 9                   | Product labels, Features cleanup, payment-history cards                               | B's pending-state primitive                                 |
| E: native Premium tools         | 14, 24                    | Relocate tools; put consolidated tools in Businesses                                  | A, B; preserve existing entitlement/RPC behavior            |
| F: parties and banks            | 7, 21, 22                 | Party form, sourced catalog, private custom banks, stable selector                    | A, B; bank-source verification                              |
| G: voice operations             | 6                         | Verify existing targeted commands; isolated dispatch and audit                        | A's deleted-data guards and enum compatibility              |
| H: phone auth and configuration | 10, 11, 12, 13            | Phone login/linking, automated storage setup, environment segregation                 | A, B; provider/environment readiness before live activation |

These are focused delivery units, not an instruction to deploy every unit
immediately. B can be developed alongside A. D can follow B independently of C.
Provider onboarding and bank-source research can proceed while code work runs.
Do not enable features whose database or external prerequisites are missing.

## 4. Implementation work packages

### A. Database lifecycle and closed-choice types

1. Produce a table/action inventory: ordinary CRUD, drafts, saved tools,
   attachments, layouts, custom banks, deactivation, imports, bulk operations,
   notification consumers and admin restoration.
2. Add forward-only migrations for missing deletion metadata. Track deletion
   batch/provenance sufficiently to restore cascades without reviving records
   that were already deleted. Do not rewrite applied migration history.
3. Replace unconditional uniqueness with active-row uniqueness where approved,
   including tag names and published cheque numbers. Preserve draft semantics.
4. Use authorized transactional database operations for delete/restore/cascade
   invariants. Validate tenant ownership and active parent relationships on
   attach, create, update, import and publication, including concurrent writes.
5. Remove authenticated physical DELETE paths/privileges for retained records.
   Ordinary clients cannot restore by directly clearing deletion fields.
   Separate admin restore from normal update authorization.
6. Keep entity-tag link identity stable when possible: detachment marks the
   link deleted; reattachment explicitly reactivates it, with correct batch
   metadata/audit behavior. Do not blindly upsert deletion metadata.
7. Ensure all list/detail/search/tag counts/balances/reports/Premium RPCs,
   reminders, storage access and exports exclude deleted data and inactive
   parents. Client filters supplement database enforcement, not replace it.
8. Extend the existing admin restore command with batch-aware recovery,
   parent/dependency checks and conflict diagnostics. Record lifecycle actions
   in the existing audit pattern.
9. Plan account deactivation as an idempotent, retryable administrative flow:
   database access guards take effect before session/provider cleanup; partial
   provider failures are visible and recoverable. Block OTP/OAuth re-entry
   into deactivated accounts until explicit recovery.
10. Inventory stored enum candidates and invalid values. Define migrations,
    function signatures, defaults, indexes, policy expressions and deployment
    compatibility together. Preserve existing API value spellings.
11. Regenerate Supabase types against the migrated schema. Replace duplicated
    finite unions/constants where practical; align Zod and ops/Edge consumers.
12. Update lifecycle, notification and Premium documentation, including the
    existing intentional TEXT-purpose policy that this requirement changes.

Acceptance: direct authenticated database requests cannot physically delete,
revive, mutate or newly reference deleted records; business cascades roll back
fully on failure; repeat deletion is safe; restore rejects conflicts; another
user cannot delete/restore/reference these records. Test live/deleted/draft
combinations and deletion-versus-write races in a real isolated PostgreSQL
environment, not only source-text migration assertions.

### B. Loading primitives, navigation and shared UX

- Simplify Skeleton and its CSS; remove stagger counters, delays and exit
  ghosts, and update related tests/callers without affecting image loading.
- Extend Button with `loading`, `loadingText` and spinner placement, including
  icon-only behavior. Keep normal labels measurable so pending states do not
  resize the control. Set `aria-busy`, prevent repeated activation and preserve
  existing variants, refs, render composition and native form behavior.
- Inventory async actions in auth, CRUD, drafts, import/export, payments,
  settings, calls and dialogs; migrate action-local pending UI. Do not replace
  page-loading skeletons or convert all links/toggles into loading buttons.
- Centralize route classification shared by top/bottom nav and related shell
  controls. Enumerate current route families and deliberate exclusions; do not
  replace the exact-path list with an equally brittle substring test.
- Validate fixed positioning, shell overflow/transform ancestors, stacking,
  safe-area padding, scroll-to-bottom clearance and keyboard viewport changes.
  Keyboard detection must not interpret ordinary browser-chrome resizing or
  zoom as a keyboard.
- Implement the compact top-nav layout and More menu. Keep routes/actions
  discoverable, localized and keyboard accessible.
- Make quick-action tiles fixed/minimum width in a contained horizontal scroller
  with visible continuation, focus visibility and no document overflow.
- Remove card-level delete callbacks, triggers and unused dialog wiring from
  every cheque-card consumer. Retain the detail delete flow.
- Add a Tag Selector-specific modal backdrop/overlay treatment using existing
  overlay primitives. Preserve multi-select, outside close, Escape, focus
  return and nested-dialog behavior; do not blur every popover globally.

Acceptance: all loading placeholders enter/leave together; pending buttons do
not shift width or double-submit; the bottom nav follows the agreed route
matrix and remains visible during scrolling except agreed exclusions/keyboard.
At 320, 390, 430 and desktop widths, top nav and quick actions do not overflow.

### C. Tagged duplication and accurate statistics

**Duplication**

- Add a single authorized transactional operation that creates a duplicate
  draft and copies its active tag attachments.
- Copy party, account, amount, direction, notes and reminder settings.
- Clear cheque number, images and deposit date; use today's local date
  consistently with the user's time-zone utilities. Derive initial status when
  publishing; do not copy a terminal source status.
- Hydrate copied tags in the create form and preserve them through autosave,
  reload, edits and publication. Source and duplicate links are independent.
- Revalidate ownership, active parents/tags and Premium authorization at the
  execution boundary. Do not leave an orphaned partial draft on tag failure.

Acceptance: publish a duplicate with several tags, detach a tag from the
duplicate, and verify the source is unchanged. Test no tags, deleted tags,
access expiry, failure rollback and repeated-click protection.

**Statistics**

- Replace direction-plus-status slices with mutually exclusive status slices.
- Default to count; provide amount mode and All/Outward/Inward filtering.
  Apply the existing selected cheque-date range consistently.
- Each qualifying active, non-draft cheque contributes once. Slice count sum
  equals filtered cheque count; slice amount sum equals filtered total amount.
- Count mode center/tooltip/legend show counts and percentage; amount mode
  shows currency amounts and percentage. Handle zero denominators explicitly.
- Pending financial/upcoming/overdue metrics include Issued and Received only;
  exclude Bounced and Cleared. Use user-local date boundaries.
- Fully cleared, nonempty data renders 100% Cleared. Empty data is neutral.
  Bounced-only data is not described as All cleared. Do not infer actual bank
  cash balance from pending cheque net movement.
- Find every consumer of the shared hook/chart and every All cleared label;
  update the actual shared logic, not just the dashboard presentation.

Acceptance: deterministic mixed, all-cleared, all-bounced, empty, single-record,
filtered, amount-mode and local-midnight fixtures prove totals and labels.
Keep unrelated date-range behavior unchanged.

### D. Product naming and payment-history UX

Approved display names:

| Stable product ID    | Display name                              |
| -------------------- | ----------------------------------------- |
| `lifetime_premium`   | Premium - Lifetime                        |
| `ai_scanner_30d`     | AI Scanner - 30-Day Pack (250 scans)      |
| `voice_reminder_30d` | Voice Reminders - 30-Day Pack (100 calls) |
| `ai_scan_250`        | AI Scanner - Top-Up (250 scans)           |
| `voice_reminder_100` | Voice Reminders - Top-Up (100 calls)      |

- Use equivalent localized typography/labels in the UI; these ASCII table
  separators do not prescribe a typography change.
- Update catalog names through a new migration and update matching UI,
  checkout descriptions, history labels and ops output. Stable product/feature
  IDs and existing provider order records stay unchanged.
- Remove Features activity section, its anchor/history links, unnecessary
  transaction query/polling and footer. Relocate access/quota refresh so it
  remains available without a payment-history dependency.
- Payment cards prioritize exact product, amount/currency, date and status.
  Expand reference IDs and offer copy feedback. Preserve filtering, sorting,
  loading, empty, retry and all stored payment states.
- Do not turn authorized payments into successful activation or add unsupported
  receipts/refund actions. Existing webhook/RPC authority remains unchanged.

Acceptance: each product is named consistently on every consumer; pricing and
fulfillment are unchanged; Features has no activity/history/footer; pending,
captured, failed and refunded history remain distinct and understandable.

### E. Premium tools integrated into native UI

| Tool                           | Native destination                                  |
| ------------------------------ | --------------------------------------------------- |
| Cheque CSV/Excel import        | Cheques actions, with existing preview/confirmation |
| Party CSV/Excel import         | Parties actions                                     |
| Cheque templates               | Cheques list/create workflow                        |
| Saved filters/views            | Cheques filter UI and native list                   |
| Bulk status changes            | Cheques multi-selection and confirmation            |
| Party statements               | Party detail                                        |
| Custom party message templates | Business detail/settings                            |
| Print layouts                  | Account detail and cheque print workflow            |
| Consolidated reports/overview  | Businesses                                          |

- Reuse current validation, import limits, atomic RPCs, printing, statements
  and entitlement helpers. Extract shared UI only where needed.
- Connect native tools to the existing business context, query keys, filters
  and selection state. Refresh all affected views after mutations.
- Keep locked actions contextual and visible; execution remains freshly
  authorized, including finite/trial/paused/expired/error states.
- Preserve existing saved tools, layouts and free data-portability behavior.
- Remove standalone workspace navigation and dashboard consolidation entry.
  Retain compatibility routing for old `/premium` links, fragments and
  `partyId` context; validate destination ownership before selection.
- Update Features benefit links, Settings links, global navigation and tests
  to native destinations.

Acceptance: every existing tool works from its native screen for active/trial
access; free/expired users see the correct upgrade context without executing
paid actions; old deep links reach equivalent destinations. Consolidation
appears in Businesses, not the main dashboard.

### F. Party creation and bank selection

**Party**

- Replace the stepper while retaining the existing service/validation/draft
  lifecycle and cheque return-to flow.
- Contact import remains browser-native and Premium-gated. Explain unsupported
  browsers and provide manual entry; do not promise iOS address-book support.
- Preserve user activation for opening the native picker. Canceling is not an
  error. Normalize selected phone values and let users edit imported fields.
- Warn on likely duplicate phone/name matches in the active business without
  silently merging or preventing legitimate separate parties.
- Keep optional email/address/notes/avatar/tags reachable and draft-safe.

**Banks**

- Build a dated source inventory from authoritative RBI lists, then verify
  cheque/account applicability. Document public/private, small-finance,
  regional rural, cooperative and foreign-bank coverage and exclusions.
- Do not claim all banks are covered based on a longer hard-coded list alone.
  Resolve aliases/mergers and retain referenced IDs. Avoid unlicensed bank
  logos or unofficial third-party logo dependencies.
- Update deterministic reset seed and add a forward migration/import for
  existing databases; make repeated application safe.
- Add Other/Add bank for a user-private reusable custom bank, available across
  their businesses but not other users or the global catalog.
- Require a name; warn about likely duplicates. Optional account IFSC is
  format-validated, not represented as proof of bank/branch existence.
- Apply lifecycle and reference rules to custom-bank deletion; do not break
  existing accounts when a catalog entry is hidden/deleted.
- Reserve identical icon/avatar/text geometry before and after selection.
  Anchor dropdown width and constrain long names and asynchronous loading.

Acceptance: unsupported contact-picker browsers can finish manual creation;
draft/resume and return-to-cheque work; aliases do not create duplicate seeded
banks; private banks are isolated; selector bounding boxes are stable before
and after selection, including long names and failed logo loads.

### G. Targeted voice operations

- Preserve and test the existing sample/trigger-business commands and user
  selection by UUID/email/phone, including ambiguous-user errors.
- Add an explicit one-user/all-eligible-businesses path using the existing
  targeted scheduler. Preview recipient, businesses, due cheques, call count,
  quota effect and environment.
- Extend dispatcher claim/invocation contracts to accept the authorized target
  job scope. Enforce the scope in the database claim, not just response filters.
  No target means the existing global cron behavior.
- Preserve normal quota consumption, idempotency, retries and consent checks.
  Validate inactive users, deleted businesses/cheques, invalid recipients and
  exhausted access/quota before delivery.
- Show queued/provider-accepted/failed outcomes truthfully. A provider accepting
  a call is not proof the user answered. Keep job/provider IDs in ops output.
- Record operator, reason, target, request/job IDs and outcome through the
  repository's admin audit conventions.

Acceptance: with jobs for users A and B in the queue, a manual run targeting A
cannot claim B's jobs; cron still processes both normally. Repeat requests,
multi-business scope, disabled voice, no due cheques, quota exhaustion, retry
and dry-run perform the expected action without duplicate calls.

### H. Phone authentication, storage automation and configuration

**Application flow**

- Extend auth repository/service with phone OTP send/verify and authenticated
  phone-link/change verification. Keep existing methods and cookie/session
  integration.
- Implement phone entry, send, verify, resend cooldown, edit number, expiry,
  invalid-code, retry and accessible error/loading states. Do not expose
  credentials, full OTPs or verification tokens in logs/analytics.
- Enforce +91 policy and abuse controls at supported trusted Auth/provider
  boundaries. If hosted Supabase settings cannot enforce a required control,
  verify a supported Auth hook/gateway design before shipping; do not assume a
  browser restriction is sufficient.
- Handle account conflicts without automatic merging. Verify phone-only
  profile creation, optional email, onboarding, redirects, recovery/support,
  checkout contact handling and ops lookup; do not fabricate email addresses.
- Keep reminder-phone changes independent from authentication-phone changes.
- Fail visibly for deactivated accounts and provider outages; never fake a
  successful send/session.

**Provider setup**

- Verify current hosted Supabase Auth/Twilio supported configuration before
  choosing SMS versus Verify-specific settings.
- Confirm Twilio account readiness, sender/Messaging Service or supported Verify
  service, India sender/template compliance, geographic permissions, spend
  controls and delivery diagnostics.
- Put Auth SMS credentials in Supabase Auth's supported configuration/secret
  mechanism, not in browser variables or Vercel merely for convenience.
- Keep existing Voice Edge Function credentials scoped to Supabase secrets.
- Configure test delivery without production numbers or real sends first;
  never enable fixed test OTPs for public production accounts.

**Storage**

- Trace and remove the manual SQL setup instruction/step from the actual setup
  workflow. Provision required private buckets/policies through versioned
  migrations and the normal setup CLI.
- Preserve historical migrations and existing objects/URLs. Keep legacy media
  conversion an explicit, backed-up migration when required, not an automatic
  destructive setup task.
- Verify active-reference authorization for retained media, including direct
  Storage API access and already issued signed URLs. Stop new access
  immediately after deletion; document the maximum residual lifetime of issued
  bearer URLs/cache copies. If strict immediate revocation is required,
  proxy/stream through authorization rather than promise signed-URL revocation.

**Configuration matrix**

| Kind                                                           | Correct home                                              | Rule                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Browser-safe Supabase URL/public key and public UI config      | Vercel environment-scoped public variables                | Only deliberately public data uses `NEXT_PUBLIC_`; validate build-time binding. |
| Next server secrets, e.g. required payment/service credentials | Vercel sensitive environment variables                    | Only the server gets these; scope to the target environment and runtime need.   |
| Supabase Auth SMS provider configuration                       | Hosted Supabase Auth configuration/secret mechanism       | Not an ordinary Next runtime variable.                                          |
| Voice/webhook Edge Function secrets                            | Supabase Edge Function secrets                            | Isolate QA and production credentials/providers.                                |
| Cron invocation credentials                                    | Supabase Vault using existing design                      | No hard-coded credentials in SQL or cron text.                                  |
| Operator-only credentials                                      | Local/CI protected secret store and git-ignored env files | Preserve CLI confirmation and project guards.                                   |

- Confirm mappings for local, QA, Preview and Production; Preview must never
  silently fall back to production. Decide explicitly whether Preview uses QA.
- Inventory variable names, consumers, sensitivity, required/optional status,
  build/runtime phase and environment. Do not copy real values into the plan.
- Add appropriate typed/server-side startup validation and setup checks.
  Preserve the existing uncommitted environment-example edits.
- Document env locations, deployment sequence, callback URLs and secret rotation.
  Audit client bundles and logs for accidental server-secret inclusion.

Acceptance: mocked OTP signup/login/linking and existing login regressions pass;
fresh migration-based setup needs no manual bucket SQL; each environment binds
to its intended backend; server/provider secrets are absent from client bundles.
Live delivery is a separate approved acceptance step, not a unit test.

## 5. Validation and release gates

1. Before implementation, read the relevant installed Next.js version's guides.
   Use repository tools and conventions; do not assume older routing/auth APIs.
2. Establish targeted baselines for touched features; preserve unrelated dirty
   files. Do not reset or migrate a shared database for convenience.
3. Run focused Vitest tests per work package, then lint/type-check/build for
   the coordinated change. Use existing tooling, not a parallel test stack.
4. Execute migrations on both a clean isolated schema and a representative
   upgraded fixture. Exercise RLS, privileges, real SQL functions and races.
   Regenerate types and inspect the resulting contract changes.
5. Run focused Playwright flows for auth, cheques, drafts, tags, parties,
   accounts, businesses, dashboard, Features, Premium destinations, preferences,
   reports and transactions as each release touches them.
6. Check 320/390/430 px and desktop, light/dark, English/Hindi/Hinglish, keyboard,
   focus, safe areas, long labels, loading/error/empty states and reduced motion.
7. Validate Android Chrome, real iOS Safari and installed PWA behavior for
   keyboard/nav/contact limitations. Desktop WebKit emulation is useful but
   does not replace real-device checks.
8. Deploy compatible additive schema first, then code/Edge Functions, then
   stricter constraints or activation where required. Enum conversions must
   account for old RPC signatures and live consumers; stage incompatible
   conversions rather than claim they are automatically zero-downtime.
9. Back up before any approved data migration. Revert application releases
   only where schema compatibility is established; use forward fixes rather
   than destructive rollback of retained records.
10. Monitor auth delivery failures, call scope/outcomes, quota usage, deleted
    data leakage, stale native Premium links and UI error rates after release.

## 6. Open operational prerequisites

| Item                                                     | Status                      | Required before                            |
| -------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| Actual Vercel project/environment to Supabase mapping    | Not supplied                | Applying environment changes or deployment |
| Twilio SMS/Voice account and sender/template readiness   | Unknown/not checked         | Live OTP or voice acceptance               |
| India compliance and supported provider settings         | To verify                   | Enabling public +91 OTP                    |
| CAPTCHA provider/configuration and rate/spend policy     | To configure and verify     | Public OTP launch                          |
| Production backup and migration window                   | To agree                    | Live data migrations                       |
| Approved test recipients and explicit real-send approval | Not authorized              | Any real SMS/call test                     |
| Dated RBI source inventory and coverage validation       | Implementation prerequisite | Claiming bank coverage                     |
| Privacy-erasure/legal retention policy                   | Separate policy work        | Any permanent purge                        |

These do not prevent local implementation with mocks and isolated databases.
They do prevent declaring live authentication, provider delivery or production
configuration complete.

## 7. Definition of done

All 25 issues are covered by the release table and their acceptance criteria.
Completion requires implemented, persistent changes and recorded validation,
not just a passing build or a configuration checklist. Each release should
report changes, tests, remaining operational gates and deployment status.

This planning deliverable changes documentation only. No application tests or
live infrastructure operations were performed during planning.

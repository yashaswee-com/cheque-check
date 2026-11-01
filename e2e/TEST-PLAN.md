# E2E Test Plan — Severity, Risk, Complexity, Frequency

This plan prioritizes the user-facing features in the app, scores them, and assigns a severity
tier that determines whether (and how thoroughly) it's covered by Playwright specs under
`e2e/specs/`. See `e2e/README.md` for how to run the suite and what's structurally out of scope.

## Unit coverage measurement

`npm run test:coverage` uses Vitest's V8 coverage provider. Its line
coverage gate is **95% in every executable production file**, not just the
global average, across all production TypeScript and TSX files in
`src/`, including files no test imports. Tests, test setup, and TypeScript
declarations are excluded; scripts and E2E files are outside the source scope.
Production pages and UI components remain included.

Coverage is calculated from executable source locations, not total physical
file lines:

`Line coverage = covered executable lines / total executable lines * 100`

The aggregate is a weighted ratio of covered and total lines across files,
not an average of each file's percentage. Statement coverage measures executed
statements, function coverage measures called functions, and branch coverage
measures exercised alternatives. Only line coverage has a 95% per-file gate;
the other metrics are still reported. Files with zero executable lines (for
example type-only declarations or barrel exports) have no line coverage to
improve and do not represent untested behavior.

Reports are written to the ignored `coverage/` directory: `index.html` for
interactive uncovered-line inspection, `coverage-summary.json` for per-file
and global totals, and `coverage-final.json` for detailed execution counts.
Playwright test passes do not automatically contribute to these unit metrics.
High coverage indicates exercised code, not proof of correctness; assertions,
failure paths, integration tests, and E2E flows are still necessary.

Feature-wise unit tests exercise repositories, services, hooks, components,
route handlers, environment accessors, Supabase cookie/session adapters, and
monitoring lifecycle/privacy behavior. External boundaries such as Supabase,
payment, OCR, SMS, and monitoring SDKs are mocked: these tests verify application
contracts and failure handling, not live provider availability or delivery.
The `server-only` test alias is a boundary-marker shim for importing server
modules in Vitest; it does not replace their implementations or affect Next.js.

Verified after the per-file expansion: 1,461 tests passed across 187 files, with
only the acknowledged bank-seed test skipped. All 288 executable production
files exceed 95% line coverage (lowest: 95.12%). Global coverage is 99.16% lines
(5,950/6,000), 98.27% statements, 98.22% functions, and 89.50% branches.
These are a measured snapshot, not a guarantee that future changes retain
these values; the per-file line gate enforces the minimum on subsequent runs.

The subsequent feature-wide expansion adds more validation, error-path,
hook lifecycle, UI, and streamed-download tests. The 100% all-metric target
was stopped by request; the existing 95% per-file line gate remains unchanged.
The snapshot above belongs to the earlier verified coverage run, not this
newer test batch. Generated `coverage/` and `coverage-*/` reports are ignored
by Git and can be regenerated locally when needed.
The expanded unit suite passed 1,947 tests across 215 files, with only the
acknowledged bank-seed freshness case skipped. This verification did not
collect coverage and does not establish a new coverage percentage.

The known bank-seed freshness failure is not disabled in the repository.
To measure coverage while leaving only that acknowledged test unexecuted:

```powershell
npm run test:coverage -- --testNamePattern='^(?!.*keeps migration seeding synchronized with the source snapshot)' --hookTimeout=60000 --testTimeout=30000 --maxWorkers=2
```

This coverage run limits workers and allows longer test/hook timeouts to avoid
resource-contention failures during instrumentation. It does not skip any
additional tests or alter application behavior.

## Scoring model

Each flow is scored 1 (low) - 3 (high) on three axes, then mapped to a severity tier:

- **Risk** — impact if this breaks: data loss, incorrect financial state (cheque amounts/status),
  locked-out users, or silent data leakage across businesses score 3; degraded UX with a
  workaround scores 2; cosmetic/informational breakage scores 1.
- **Frequency** — how often a typical active user hits this flow (every session = 3, weekly/
  monthly = 2, rarely/once = 1).
- **Complexity** — engineering complexity of the flow (multi-step forms, gestures, optimistic
  updates, third-party integrations, cross-entity state = 3; a single form or list = 2; static
  content = 1). Higher complexity flows need more edge-case test cases per flow, independent of
  severity.

`Severity = Critical` when Risk=3 and Frequency>=2, or when a first-run flow with Risk=3 blocks
all use of the product. `High` when Risk>=2 and Frequency>=2, or Risk=3 with Frequency=1 that
does not block first use. `Medium` when Risk=2 and Frequency=1, or Risk=1 with Frequency>=2.
`Low` otherwise (Risk=1, Frequency=1, e.g. static pages). Complexity does not change impact
severity; it increases the number of branches and assertions expected in the spec.

## P0 — Critical

Core cheque lifecycle. Breakage here means incorrect financial state or a blocked daily workflow.

Phone login also has isolated browser coverage in `phone-auth.spec.ts`: invalid
mobile numbers, expired-code recovery, resend cooldown, provider-error retry,
and switching back to email. OTP and CAPTCHA are mocked; these tests do not
cover SMS delivery or successful session creation. See `e2e/README.md` for
running this spec without the hosted QA setup.

| Flow                                                                               | Risk | Freq          | Complexity | Spec                                           |
| ---------------------------------------------------------------------------------- | ---- | ------------- | ---------- | ---------------------------------------------- |
| Signup/login/logout/forgot-password (reached from the login page)                  | 3    | 3             | 2          | `auth.spec.ts`                                 |
| Landing page entry points and auth route guards                                    | 3    | 3             | 1          | `landing.spec.ts`                              |
| Onboarding wizard + first-run empty cheque list                                    | 3    | 1 (once/user) | 2          | `onboarding.spec.ts`                           |
| First day: first cheque with inline party/account creation from an empty workspace | 3    | 1 (once/user) | 3          | `first-run.spec.ts`                            |
| Cheque create (Outward; Premium Inward; invalid-value blocking)                    | 3    | 3             | 3          | `cheques.spec.ts`, `cheque-management.spec.ts` |
| Cheque status transition via swipe + detail actions + pending-status correction    | 3    | 3             | 3          | `cheque-management.spec.ts`                    |
| Bounced cheque re-presented and cleared; party outstanding follows each status     | 3    | 2             | 3          | `cheque-lifecycle.spec.ts`                     |
| Crore-scale amounts keep exact value and amount in words                           | 3    | 1             | 2          | `cheque-lifecycle.spec.ts`                     |
| Cheque edit                                                                        | 3    | 2             | 2          | `cheque-management.spec.ts`                    |
| Cheque delete (type-to-confirm)                                                    | 3    | 2             | 2          | `cheque-management.spec.ts`                    |
| Per-business data isolation when switching active business                         | 3    | 2             | 3          | `businesses.spec.ts`                           |
| Dashboard pending net + today's cheque list                                        | 3    | 3             | 2          | `dashboard.spec.ts`                            |
| Free-plan Premium walls (Inward, duplicate, print, reports) lead to the plan       | 3    | 2             | 2          | `premium-gating.spec.ts`                       |

## P1 — High

Frequently used supporting flows; broken state degrades UX but has a workaround.

| Flow                                                                                                                      | Risk | Freq | Complexity | Spec                     |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---------- | ------------------------ |
| Cheque list filter/search/sort (status, party, date/amount)                                                               | 2    | 3    | 2          | `cheques.spec.ts`        |
| Cheque/party/account drafts: save, resume, publish                                                                        | 2    | 2    | 3          | `drafts.spec.ts`         |
| Interrupted cheque entry: leave sheet saves a draft, resume, then discard                                                 | 2    | 2    | 3          | `drafts.spec.ts`         |
| Tags: create, assign to cheque, verify linked cheque                                                                      | 2    | 2    | 2          | `tags.spec.ts`           |
| Party create/edit/delete                                                                                                  | 2    | 3    | 2          | `parties.spec.ts`        |
| Party with optional details + inline tag, duplicate warning, linked cheques                                               | 2    | 3    | 3          | `parties.spec.ts`        |
| Account create/edit/delete                                                                                                | 2    | 3    | 2          | `accounts.spec.ts`       |
| Accounts: bank catalog search, private bank, IFSC validation, opening balance, default account preselected on new cheques | 2    | 2    | 3          | `accounts.spec.ts`       |
| Business create/edit/delete                                                                                               | 2    | 1    | 3          | `businesses.spec.ts`     |
| Business switching from the list; delete only after typing the exact name                                                 | 2    | 1    | 2          | `businesses.spec.ts`     |
| Global search across cheques/parties/accounts                                                                             | 2    | 2    | 2          | `search.spec.ts`         |
| Mobile navigation: bottom tabs, create button per tab, back button                                                        | 2    | 3    | 2          | `navigation.spec.ts`     |
| Settings > Preferences (currency/date format propagation)                                                                 | 2    | 1    | 2          | `preferences.spec.ts`    |
| Reports: PDF/Excel download, CSV/JSON background export jobs, cancel a job                                                | 2    | 2    | 3          | `reports.spec.ts`        |
| Premium duplicate cheque to a prefilled draft                                                                             | 2    | 2    | 2          | `cheque-premium.spec.ts` |
| Settings > Preferences language switch (locale propagation)                                                               | 2    | 1    | 2          | `locale.spec.ts`         |

## P2 — Medium

Occasional configuration/management flows; workarounds exist.

| Flow                                                             | Risk | Freq | Complexity | Spec                                             |
| ---------------------------------------------------------------- | ---- | ---- | ---------- | ------------------------------------------------ |
| Settings > Notifications (reminder-day save)                     | 1    | 1    | 1          | `settings-misc.spec.ts`                          |
| Settings > Notifications (channel state persists after reload)   | 1    | 1    | 2          | `settings-misc.spec.ts`, `notifications.spec.ts` |
| Settings > Transactions route and history view load              | 1    | 1    | 1          | `settings-misc.spec.ts`                          |
| Settings hub: every entry opens a working page                   | 1    | 2    | 1          | `settings.spec.ts`                               |
| Profile name change; account deletion blocks later sign-in       | 3    | 1    | 2          | `profile.spec.ts`                                |
| Premium checkout opened and dismissed; failed order is explained | 2    | 1    | 2          | `premium-checkout.spec.ts`                       |
| Feedback / NPS prompt                                            | 1    | 1    | 2          | `feedback.spec.ts`                               |
| Premium paywall correctness for non-premium users                | 2    | 1    | 1          | `reports.spec.ts`                                |
| Tags: edit/delete existing tag                                   | 2    | 1    | 2          | `tags.spec.ts`                                   |

## P3 — Low

Static/informational, cosmetic only, rarely changes.

| Flow                                                                  | Risk | Freq | Complexity | Spec                                       |
| --------------------------------------------------------------------- | ---- | ---- | ---------- | ------------------------------------------ |
| About / Help & Support / Privacy Policy / Terms / What's New / Refund | 1    | 1    | 1          | `static-pages.spec.ts`, `settings.spec.ts` |
| Calculator widget from the top bar "More actions" menu                | 1    | 2    | 1          | `calculator.spec.ts`                       |
| PWA service worker registration                                       | 1    | 1    | 1          | `pwa.spec.ts`                              |
| Premium workspace: bulk status change for one party's cheques         | 2    | 1    | 3          | `premium-workspace.spec.ts`                |

## Out of scope (unchanged from `e2e/README.md`)

Google/Facebook OAuth, real Razorpay payments, OpenAI OCR cheque-scan extraction, completion of
background report exports by the worker, and reminder (voice/SMS/email) delivery. Premium-only
flows seed an entitlement row directly via `grantLifetimePremium()` in `e2e/admin-client.ts`;
checkout is exercised only up to a stubbed Razorpay modal.

## Shared infrastructure added for this plan

- `e2e/admin-client.ts`: `grantLifetimePremium(userId)` inserts an active `lifetime_premium`
  row into `user_entitlements` so premium-only flows (Reports/export) are reachable without
  Razorpay.
- `src/components/speed-dial-fab.tsx`: `SpeedDialAction.testId` plus testids on the menu toggle
  and edit link — this shared detail-page menu (cheques/parties/accounts/businesses/tags) had no
  testids before, so status-transition/delete/edit actions were only reachable via translated
  text (the app ships `en`/`hi`/`hi-en` locales, so text selectors are unreliable).
- `src/components/ui/delete-dialog.tsx`: `data-testid="delete-dialog-confirm-button"` on the
  shared type-to-confirm delete flow used by cheques/parties/accounts/businesses/tags. The
  confirm-name input already has `id="confirm_name"`, consistent with the rest of the app's form
  selectors.
- `src/app/(dashboard)/settings/preferences/page.tsx`: `testId="preferences-language"` and
  `testId="preferences-time-format"` on the two Combobox fields that previously had none
  (currency/date-format already had testids).
- `src/app/(dashboard)/settings/notifications/page.tsx`: `data-testid` per channel `Switch`
  (`notifications-toggle-${channel.key}`) so each channel can be targeted individually instead
  of only `getByRole('switch').first()`.
- `src/app/onboarding/page.tsx`: `data-testid="onboarding-back-button"` on the stepper's back
  button (previously unreachable except by icon).
- `e2e/flows.ts`: `signInAsNewOnboardedUser(page, label, { premium })` creates an isolated
  user, signs in, completes onboarding, and waits on `/dashboard` (optionally after granting
  Premium). Journeys that need their own account or Premium use it instead of the shared session.
- `e2e/pages/app-shell.page.ts`, `profile.page.ts`: shell navigation (tabs, create button, back,
  "More actions" menu, contextual Premium sheets) and profile actions. `AccountsPage` covers catalog
  search, private banks, opening balance, IFSC, and the default-account checkbox.
- New `data-testid`s where only styled text existed: `report-export-job` (with `data-format` and
  `data-status`), `account-detail-ifsc`, `account-detail-opening-balance`,
  `account-default-checkbox`, `party-detail-outstanding`, `party-detail-total-cheques`,
  `cheque-detail-duplicate`, `cheque-detail-print`, and `cheque-amount-words`.
- Account create/edit now show the IFSC validation message; previously an invalid IFSC blocked
  submission without feedback.

# Shared shell and commerce

## Pending actions

Use the shared `Button` with `loading` for form submissions and externally
owned pending states. Promise-returning `onClick` handlers are tracked
automatically; return the promise instead of discarding it with `void`.
Keep ordinary children constant: pending always shows the shared `Spinner`
centered in place of the label and icons, never ellipses or alternate text.
The ordinary content stays measurable and accessible while transparent,
so pending preserves the button's dimensions and accessible name.
Synchronous navigation and toggles do not enter a loading state.
Accepted pointer and keyboard clicks replay a 550ms decorative shimmer without
replacing labels or pending spinners. Disabled/pending clicks do not replay it.
OS and profile reduced-motion preferences hide it; cleanup does not depend on
animation events.

Keep the shared `loading` prop consistent. Name boolean state with an `is`
prefix and its setter with `setIs`: `isPending` for tracked async clicks,
`isSubmitting` for a complete form submission, and `isSaving`/`isUploading`
for action-specific owners. Use `pendingAction`/`setPendingAction` for an
action discriminator (`'upload' | 'delete' | null`), not a boolean `loading`
or `busy` variable. Derive `isLoading` when combining pending sources.

Pending buttons expose `aria-busy`, ignore activation and are disabled. Preserve
the action's own execution guard, especially forms submitted with Enter.
Icon-only actions must provide an accessible `aria-label`; their spinner
replaces the icon visually without changing the name. Existing variants, sizes,
refs, native form attributes and Base UI `render` composition remain supported.
Shared deletion, draft-save, tag create/edit/select, account/business forms,
Features checkout, phone save, test call, access refresh, payment retry and
reference-copy actions use the API. Native Premium, Party and auth owners
maintain their corresponding action-local pending states; page fetch skeletons
and ordinary navigation/toggles are not replaced.
Page fetches still use `Skeleton`, whose simultaneous pulse respects reduced
motion. There are no stagger counters, entry delays or exit ghost nodes.

## Route and viewport contract

`src/lib/navigation-routes.ts` centralizes top-level, active-tab, business-row,
create-action and bottom-navigation classification. Entity lists, drafts and
details, Settings descendants, reports, Features and profile show bottom tabs.
Auth, onboarding, entity create/edit and the deliberate full-screen legacy
Premium entry do not. Entity IDs containing words such as `create` or `edit`
are not workflows. New full-screen route families need an explicit policy.

The bottom bar and list create action are shell-mounted, fixed, and clear the
safe area. The dashboard layout reserves bar height plus the safe-area inset.
Editable focus plus a substantial unzoomed Visual Viewport reduction hides
these controls while typing; browser-chrome movement and zoom alone do not.
The existing application frame remains the fixed-position containing block.
Top navigation retains back/title/search; secondary actions are named controls
inside the More popover. Dashboard quick actions scroll within their own
equal-size, keyboard-focusable horizontal row.
The row includes Tags and links to the existing `/tags` entity page.

Global search does not display loading text while fetching results. Existing
results remain usable, no-results feedback waits for loading to finish, and
fetch failures still show the error message.

## Display preferences

`ProfileProvider` publishes saved preferences through `FormattingContext`.
Use `useDisplayFormat` for displayed dates, timestamps, numbers and amounts,
and `createPreferenceFormatter` for non-React output. Successful saves update
the profile cache before refetching. Saved language synchronizes the locale
cookie and refreshes translated routes, including on a new browser and after
onboarding; failed saves do not switch language.

Calendar dates (`YYYY-MM-DD`) never shift with the time zone. Timestamps use
the selected zone and 12/24-hour clock; named zones account for daylight
saving. Today/overdue badges, business summaries and dashboard period presets
use that same local day. Month-only policy dates retain month/year precision.
`DateInput` accepts and displays the preferred pattern, uses the localized
calendar picker and keeps ISO form values. Invalid dates and out-of-range
values show a translated error. Malformed dates clear the canonical form value
rather than submitting a previous valid date; out-of-range calendar dates
retain their ISO value for interval validation. Invalid optional dates block
report, saved-view and template actions instead of becoming unbounded filters.
ISO entry remains accepted for imports and
automated entry. Min/max constraints apply to both typing and calendar selection.
Calendar month/week labels and application strings use English, Hindi or
Hinglish; Hinglish maps to `en-IN` for Intl number/time formatting. Entity form
validation messages are translated at presentation time, preserving the
validator/API contract.

Search, drafts, cards, totals, charts, tables, message previews and SMS use the
display currency without exchange conversion. PDF statements, report PDFs,
print layouts and Excel exports use preferred dates and translated labels;
browser-font PDF rendering preserves Hindi and currency symbols. Excel amounts
remain numeric with the selected currency cell format. CSV/JSON exports,
imports, API/database dates and filename dates remain machine-readable.
Actual product prices and payment-history currencies are never relabeled as
the user's display currency. Brands, language names, currency codes, time-zone
identifiers and user-authored text are not automatically translated.

Cheque cards no longer expose deletion; confirmed detail deletion remains.
Tag Selector alone opts into a modal dim/blur backdrop. Other popovers do not
receive it. The selector retains multi-select, outside dismissal, Escape,
focus restoration, and nested-overlay handling from Base UI.

## App version and What's New

About, the launch splash, and What's New share `APP_VERSION` from
`src/lib/app-version.ts`, sourced from the root `package.json`. They display
`vMAJOR.MINOR.PATCH` without an unrelated build label. The package version is
the source of truth; UI changes do not automatically increment it.

Use Semantic Versioning for releases: major for incompatible changes, minor
for backward-compatible features, and patch for backward-compatible fixes.
While the major version is zero, the app remains in initial development and
its public API is not yet stable.

What's New summarizes committed, user-visible improvements in English,
Hindi, and Hinglish. Its last-updated date refers to the covered changes,
not an inferred release date. When publishing a release, update the package
version and localized highlights together. Do not invent intermediate
versions from commit dates or include internal-only test and tooling changes.

## Commerce

`20261021040000_product_names.sql` changes only catalog display names. Apply it
through the normal migration process; it does not change product IDs, prices,
quotas, durations, payment-provider orders or entitlement rules. Checkout and
ops catalog consumers receive the authoritative catalog name. UI translations
use `ProductNames` in English, Hindi and Hinglish.

Features retains checkout, access/quota refresh, voice preferences and test
calls, but does not query or poll transactions or link to activity/history.
Settings > Transactions remains the payment-history destination. Cards show
the exact product (including pack versus top-up), amount/currency, date and
stored state; expandable references offer copy success/failure feedback.
Filtering, sorting, loading, empty and retry behavior remain. Unknown product
IDs are not silently relabeled as another product; legacy known feature/type
pairs may resolve to their exact product.

Created, authorized, captured, failed and refunded remain distinct. Neither a
history badge nor client checkout completion authorizes Premium activation;
webhook/database fulfillment and refreshed entitlements remain authoritative.

### Product-specific AI models

Apply `20261107010000_product_ai_model_policies.sql` after the existing AI policy
migration. `ai_model_policies.product_id` references `payment_products.id`;
each product has a model and an explicit priority (1–10,000 for paid products).
The highest-priority eligible owned product wins, with product ID breaking ties.
Existing custom models are preserved: scanner defaults to priority 20, Lifetime
to 10. Only service-role operators manage policies.

The inactive `free` catalog reference (`is_free=true`, amount zero, priority zero)
is not a sale or Premium entitlement. Existing free pricing presentation is
unchanged. Catalog checks and payment/checkout triggers prevent buying it,
including through admin grant transaction helpers.

`user_entitlements.product_id` records one current product per feature, matching
the existing entitlement model. Migration backfills captured purchases first,
then matching catalog products for legacy/admin trials. Subsequent captured
purchases record their exact SKU atomically. Top-ups add quota only and cannot
have model policies. Retiring a product from sale does not remove existing access.
Expired, paused, canceled, unbounded subscription and inactive-account access
do not qualify; finite valid trials continue to qualify.

Operators configure model/priority on the product policy row, not a plan label.
Missing paid policies use the eligible free policy; a completely missing policy
raises an explicit database error. OCR retains its existing logged default-model
fallback if policy lookup fails after quota consumption.

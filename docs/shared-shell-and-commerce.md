# Shared shell and commerce

## Pending actions

Use the existing `Button` with `loading`, optional `loadingText`, and
`spinnerPosition="start" | "end"` (default `start`). Keep its ordinary children
constant rather than swapping the label or manually rendering a spinner.
Buttons that receive `loading` reserve spinner and label space in both states.
An alternate label remains measurable while hidden, so pending does not change
width. Ordinary buttons without these props retain their existing layout.

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

Global search does not display loading text while fetching results. Existing
results remain usable, no-results feedback waits for loading to finish, and
fetch failures still show the error message.

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

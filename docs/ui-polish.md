# UI polish

Editable profile, business, party, account and custom-bank creation surfaces reuse
the existing center-crop uploader, with an accessible camera badge for touch.
Account logos persist through draft creation, restore, publication and editing.
Apply `20261105000000_account_logos.sql`. Existing storage policy and account RLS
remain in effect; read-only avatars never become upload controls.

Tag selectors use the shared 50-option paging/search helper. Inline creation opens
a name/color sheet, selects the saved tag without losing prior selection, and
updates the business-scoped cache immediately. Failures leave the sheet usable.

Creation/onboarding success screens draw a white SVG tick and fire one confetti
burst on mount, never on Continue or destination navigation. OS/profile reduced
motion disables tick/pulse animation and confetti. Post-cheque NPS timing remains
on navigation independently of celebration.

Settings displays the build's `package.json` version immediately below Sign Out.

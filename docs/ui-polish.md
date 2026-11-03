# UI polish

Editable profile, business, party, account and custom-bank creation surfaces reuse
the existing center-crop uploader, with an accessible camera badge for touch.
Account logos persist through draft creation, restore, publication and editing.
Apply `20261105000000_account_logos.sql`. Existing storage policy and account RLS
remain in effect; read-only avatars never become upload controls.
Cheque cards, details, creation previews and account selectors prefer the account
logo, falling back to the bank logo when no account logo has been saved.

Tag selectors use the shared 50-option paging/search helper. Inline creation opens
a name/color sheet, selects the saved tag without losing prior selection, and
updates the business-scoped cache immediately. Failures leave the sheet usable.

Creation/onboarding success screens draw a white SVG tick and fire one confetti
burst on mount, never on Continue or destination navigation. OS/profile reduced
motion disables tick/pulse animation and confetti. Post-cheque NPS timing remains
on navigation independently of celebration.

Settings displays the build's `package.json` version immediately below Sign Out.

Appearance defaults to System and persists in profile plus local theme storage.
A static head script sets the root class before paint; System follows OS changes.
Failed profile saves restore the previous theme with an explicit error.
Focus refreshes profile preferences across devices.
Apply `20261105010000_profile_appearance.sql`.

Profile always shows login email and phone, sourced from confirmed Supabase Auth
identity rather than editable contact fields. Phone OTP linking retains its existing
feature gate and claimed-number checks; when disabled the field remains visible.
Phone-only users can request email-change verification (five sends/hour), and the UI
never marks the email linked on send. Auth's unique identity rules reject claimed
emails without merging accounts. Configure verified email change and the existing
PKCE `/auth/callback?next=/profile` allow-list in hosted Auth before deployment.
No production Auth configuration or provider credentials are changed by this work.

Apply `20261105020000_first_run_tour.sql`: existing users are opted out, new profiles
default to pending. The dashboard offers five keyboard-accessible spotlight steps
after the latest announcement is acknowledged and installation is confirmed,
explicitly dismissed, or unavailable. Acceptance alone is not installation proof.
Skip/Finish persist to profile; failed saves keep the dialog open for retry.
Replay in Settings re-enables the tour across devices. Background controls remain
inert, so the tour never creates records or bypasses quotas/premium checks.
The tour card sits on the half opposite the spotlight, inset by safe areas. It
overrides the CSS `translate` property rather than adding a `transform`, so it
stays fully on screen on mobile.

`npm run test:scaling` includes owner-scoped appearance reads, tour completion,
and replay on the existing 10,000-profile fixture, with the same 1,000ms p95
budget. This is a local single-connection SQL regression check, not proof of
production browser or multi-connection capacity.

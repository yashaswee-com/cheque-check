# UI polish

Editable profile, business, party, account and custom-bank creation surfaces reuse
the existing center-crop uploader, with an accessible camera badge for touch.
Account logos persist through draft creation, restore, publication and editing.
Apply `20261105000000_account_logos.sql`. Existing storage policy and account RLS
remain in effect; read-only avatars never become upload controls.

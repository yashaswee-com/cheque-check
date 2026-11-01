# App privacy and PIN security

Apply `20261106000000_privacy_cover.sql`. The profile-backed preview cover defaults
on, uses solid white/black according to appearance, and covers the full browser
viewport on focus loss or hidden visibility. PrintScreen detection briefly covers
the view where the browser delivers that key. It does not access the clipboard.

This is **best effort**, not screenshot prevention: operating systems may capture
before browser events, and screen recording, external cameras and task-switcher
thumbnails cannot be reliably blocked by a web app. The preference text states
these limits. The cover also runs on public/auth routes; it never replaces Auth.

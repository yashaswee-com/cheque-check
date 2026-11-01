# Installation

After first-business onboarding, the dashboard offers a nonblocking install card.
Chromium installation requires an explicit click and `beforeinstallprompt`.
iOS (including iPad desktop mode) gets Safari Share > Add to Home Screen guidance.
Already installed apps and unsupported browsers do not display the card.
Later, or dismissing the browser prompt, suppresses the card for seven days on that browser.
Permission for push is a separate explicit action; installation never requests it.
The worker uses scope `/`, bypasses the HTTP cache when updating, and does not
cache authenticated cheque data for offline use.

Validate on HTTPS (or localhost) with the existing web manifest and icons.
Automated component tests cover install consent, dismissal, iOS, standalone,
unsupported browsers, and errors; actual browser installability needs device testing.

# Application shell and localization

The authenticated shell centralizes navigation, onboarding, profile preferences, form feedback, and responsive controls; public pages use a separate shell selection path ([root layout](../src/app/layout.tsx#L40-L127), [dashboard layout](../src/app/%28dashboard%29/layout.tsx#L1-L35)).

## Quick reference

- Shared route classification lives in the navigation route registry ([route definitions](../src/lib/navigation-routes.ts#L1-L77)).
- Locale resolution uses the locale cookie with Hinglish fallback ([request locale](../src/i18n/request.ts#L1-L17)).
- The service worker supports push handling and a generic offline navigation fallback, but never caches application data ([worker](../public/sw.js)).
- Browser installation prompts are explicit and separate from push permission ([PWA registration](../src/components/pwa-registrar.tsx#L1-L28), [manifest](../public/site.webmanifest#L1-L17)).

## Shell and route policy

The dashboard layout mounts authenticated application providers and shell-level controls ([dashboard layout](../src/app/%28dashboard%29/layout.tsx#L1-L35)); root layout selects the public or authenticated shell from request context ([root layout](../src/app/layout.tsx#L40-L127)). Route classification is centralized for active tabs, business rows, create actions, and bottom navigation ([navigation registry](../src/lib/navigation-routes.ts#L1-L77)). The visible shell controls and route policy should be changed together when adding a route family ([navigation tests](../src/lib/navigation-routes.test.ts#L1-L82)).

## Preferences and localization

The app resolves the locale from the request and falls back to Hinglish if the cookie is missing or unsupported; a valid saved locale remains in effect ([locale resolution](../src/i18n/request.ts#L1-L17)). New profiles and onboarding default to Hinglish, while existing profile preferences are preserved. The catalog test checks message-key and placeholder compatibility across the shipped locales ([catalog tests](../src/i18n/catalogs.test.ts#L1-L70)). Profile preferences feed shared formatting context for dates, times, and amounts ([display-format hook](../src/features/profile/hooks/use-display-format.ts#L1-L19), [formatting implementation](../src/lib/preference-format.ts#L1-L27)).

## PWA behavior

The app manifest defines its install metadata ([manifest](../public/site.webmanifest#L1-L17)). The registrar uses browser install support and explicit user interaction before requesting installation ([registrar](../src/components/pwa-registrar.tsx#L1-L28)).

The [service worker](../public/sw.js) precaches only the generic [offline document](../public/offline.html) and its [script](../public/offline.js). Failed same-origin GET document navigations show that fallback without redirecting the requested URL. Retry reloads that URL; visiting the fallback document directly retries the public homepage. Online/offline events update an accessible status without automatically reloading. Browser connectivity reports are advisory, not a server-readiness check.

The standalone page offers English, Hindi, and Hinglish, initially selected as Hinglish. The temporary selection does not read app cookies, profile preferences, or storage. Offline assets bypass authentication middleware so signed-out users can install the fallback too. Updating the fallback assets requires bumping the worker's offline cache version.

Only a successfully installed and activated controlling service worker provides this fallback. A first visit while offline, unsupported browsers, blocked service workers, or cleared/evicted caches are not covered. A failed precache does not activate the new worker. Already-loaded pages and forms remain in place; API, RSC/client-side navigation, prefetch, and cross-origin requests retain existing behavior. No account/cheque pages or user records are cached and no offline edits are queued. HTTP error responses are preserved rather than relabeled as offline. [Worker tests](../scripts/test/offline-service-worker.test.ts) and [page tests](../scripts/test/offline-page.test.ts) cover these boundaries and manual recovery.

Installation and push permission are separate browser capabilities ([registrar](../src/components/pwa-registrar.tsx#L1-L28), [push service](../src/features/notifications/services/push.service.ts#L13-L57)). See [notifications](notifications.md) for push registration and delivery behavior.

Settings provides an inline [install card](../src/components/pwa-install-card.tsx) immediately below the profile summary. It shares the existing captured prompt and explicit install handler with the automatic modal, but ignores that modal's session dismissal. The automatic post-onboarding install/tour flow is deferred while visiting Settings routes and remains available elsewhere.

The card hides in standalone mode or after a browser `appinstalled` confirmation. Confirmation is remembered for the current browser-tab session, including navigation back to Settings; it is not a cross-device or OS installation inventory. Declining installation leaves the card available, with manual guidance until the browser offers another prompt. Accepted prompts show a waiting state until confirmation; prompt errors remain visible and retryable. iOS, Android, macOS Safari, and other browsers receive appropriate manual instructions when native prompting is unavailable. Browsers without an install option are explicitly described as unavailable; no installation or notification permission is requested automatically.

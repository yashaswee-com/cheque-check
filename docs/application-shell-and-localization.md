# Application shell and localization

The authenticated shell centralizes navigation, onboarding, profile preferences, form feedback, and responsive controls; public pages use a separate shell selection path ([root layout](../src/app/layout.tsx#L40-L127), [dashboard layout](../src/app/%28dashboard%29/layout.tsx#L1-L35)).

## Quick reference

- Shared route classification lives in the navigation route registry ([route definitions](../src/lib/navigation-routes.ts#L1-L120)).
- Locale resolution uses the locale cookie with English fallback ([request locale](../src/i18n/request.ts#L1-L17)).
- The service worker supports push handling but does not cache application data for offline use ([worker](../public/sw.js#L1-L39)).
- Browser installation prompts are explicit and separate from push permission ([PWA registration](../src/components/pwa-registrar.tsx#L1-L28), [manifest](../public/site.webmanifest#L1-L17)).

## Shell and route policy

The dashboard layout mounts authenticated application providers and shell-level controls ([dashboard layout](../src/app/%28dashboard%29/layout.tsx#L1-L35)); root layout selects the public or authenticated shell from request context ([root layout](../src/app/layout.tsx#L40-L127)). Route classification is centralized for active tabs, business rows, create actions, and bottom navigation ([navigation registry](../src/lib/navigation-routes.ts#L1-L120)). The visible shell controls and route policy should be changed together when adding a route family ([navigation tests](../src/lib/navigation-routes.test.ts#L1-L100)).

## Preferences and localization

The app resolves the locale from the request and falls back to English if the cookie is unsupported ([locale resolution](../src/i18n/request.ts#L1-L17)). The catalog test checks message-key and placeholder compatibility across the shipped locales ([catalog tests](../src/i18n/catalogs.test.ts#L1-L70)). Profile preferences feed shared formatting context for dates, times, and amounts ([formatting provider](../src/features/profile/providers/formatting-provider.tsx#L1-L90), [format helpers](../src/features/profile/lib/formatters.ts#L1-L110)).

## PWA behavior

The app manifest defines its install metadata ([manifest](../public/site.webmanifest#L1-L17)). The registrar uses browser install support and explicit user interaction before requesting installation ([registrar](../src/components/pwa-registrar.tsx#L1-L28)). The service worker handles push events/clicks but contains no fetch caching handler; offline authenticated data caching is not implemented in the checked-in worker ([service worker](../public/sw.js#L1-L39)).

Installation and push permission are separate browser capabilities ([registrar](../src/components/pwa-registrar.tsx#L1-L28), [push service](../src/features/notifications/services/push.service.ts#L13-L57)). See [notifications](notifications.md) for push registration and delivery behavior.

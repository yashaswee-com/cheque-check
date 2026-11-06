# Changelog

This log captures the product story across the project’s full Git history: 524 commits from August 5 to November 6, 2026. It is organized by year, month, and date, and grouped by the major themes shipped along the way.

## Highlights

- Started from a strong product foundation with the initial app shell, cheque workflows, dashboard, and account management.
- Improved OCR, data capture, and entity handling to make cheque creation and verification more reliable.
- Added monetization, premium access, notifications, and monitoring infrastructure as the product matured.
- Refined the public-facing experience with better localization, navigation, support flows, and product polish.

## 2026

### August 2026

#### August 5, 2026

- Product foundation and early app shell
  - Built the initial app foundation with Next.js and Supabase, including business switching, navigation, dashboards, settings, search, and the first cheque management flows.
  - Commits: `d736982`, `f1d4a3e`, `f59bf61`, `7dc99de`, `6d0cf69`, `cffa8ef`, `1d1d0fd`

- Cheque creation and onboarding flow
  - Added the first account management, image-upload, onboarding, and cheque-creation experiences to establish the product’s core journey.
  - Commits: `2c967e3`, `50dda45`, `05f51be`, `0b1be24`, `6894a9f`, `c9ac7c4`, `3dcf806`

#### August 6, 2026

- OCR and document intelligence
  - Improved cheque extraction, fuzzy matching, OCR tuning, validation, and inline entity creation so the scanning experience became far more reliable.
  - Commits: `2594191`, `2afd049`, `22e0d07`, `aa9a704`, `d94dad6`, `06f818b`, `b5825bc`, `005651b`, `d94c49f`

- Shared design system and UI polish
  - Refined the app shell, navigation patterns, stepper interactions, badges, sheets, and layout constraints to create a more coherent product experience.
  - Commits: `1b66dfb`, `772b049`, `bbfc10d`, `6b1ccf9`, `577b63d`, `13d323c`, `5c175c5`, `32acc6f`

#### August 7, 2026

- Monetization and premium groundwork
  - Introduced premium flows, feature management, Razorpay integration, and PWA support as the app moved toward a sustainable monetized model.
  - Commits: `25029e5`, `7f8f222`, `8cadada`, `0b7770a`, `1011fa0`, `e4e5d11`

- Operational tooling and reminders
  - Added daily voice summaries, automation hooks, and internal alerting support to improve service operations and follow-up workflows.
  - Commits: `c64249c`, `2dbf8c7`, `b5825bc`

### September 2026

#### September 24, 2026

- Quality foundation and release hardening
  - Tightened TypeScript safety, repository contracts, test scaffolding, and CI quality gates to reduce regression risk before the wider launch push.
  - Commits: `1307867`, `0902fea`, `0ee2c33`, `c609fd8`, `0bc61ca`, `5ac8dfc`, `c9b219d`, `6f13500`, `dcd634c`

- Payments, quotas, and secure data handling
  - Added payment catalog support, atomic fulfillment paths, stricter cheque-status rules, and more secure media and reminder handling.
  - Commits: `8a201c5`, `f0ca05f`, `e4ba96c`, `10fdd46`, `3d8291f`, `bbfb2ee`, `7e8dabc`

#### September 25, 2026

- Architecture cleanup and service organization
  - Reorganized code by feature, adopted clearer service boundaries, and improved typed Supabase setup and registry infrastructure.
  - Commits: `63aeb1b`, `2869583`, `8270693`, `75170e2`, `f42d00d`, `50c115d`, `7165136`, `d84f0de`

- Shared mutation patterns and reliability improvements
  - Standardized optimistic mutation patterns, shared entity actions, and cache handling to reduce duplication and improve edit consistency.
  - Commits: `fb777bb`, `d6a0c41`, `483fe56`, `342b999`, `576f81a`, `11658fb`, `b355067`, `8758790`, `4845684`

#### September 27–28, 2026

- Drafts and mobile UX improvements
  - Added server-saved drafts, bottom-sheet confirmations, skeleton loading states, and improved mobile interactions across the editing flow.
  - Commits: `0e73644`, `b933097`, `a0c94d9`, `1c701c4`, `b536f38`, `b9b9479`, `d7a4a41`, `1a05e24`, `5ed1470`

- Dashboard, feedback, and localization polish
  - Improved dashboard metrics, NPS prompts, confetti moments, and localization coverage to make the app feel more polished and user-friendly.
  - Commits: `34bacce`, `ab3a963`, `5f2c1d7`, `d7a4a41`, `3a6c19c`, `b097607`, `773321d`, `419f438`

### October 2026

#### October 1–2, 2026

- Query and repository simplification
  - Centralized cache-key generation, cleaned up shared repository helpers, and extracted OCR logic to reduce duplication and make the codebase easier to extend.
  - Commits: `1d58071`, `9d7ac3d`, `003d0ee`, `ce1c8c3`, `d77cf86`, `d09c3a4`

#### October 14–18, 2026

- Monitoring and operational readiness
  - Added standard ops tooling, admin audit logging, runtime monitoring, session correlation, privacy-safe Sentry instrumentation, and deployment documentation.
  - Commits: `ca174f4`, `69bbb21`, `6f433fb`, `a5a1fe6`, `4112550`, `254d7d4`, `fc96083`, `ca8107a`, `b3e272c`, `0e0cc66`

- Notifications and scheduler infrastructure
  - Expanded the notification platform with schedulers, dispatchers, voice-call features, and better reminder orchestration.
  - Commits: `fddb330`, `c90c5ec`, `d33cdc0`, `7a61fa1`, `0e0cc66`, `b3e272c`

#### October 17, 2026

- Premium access controls and monetization maturity
  - Centralized premium authorizations, gated convenience workflows, and refined purchase tracking and business workspace access across the app.
  - Commits: `9b351ac`, `bbc1bef`, `785ca8b`, `103fe81`, `9c820f4`, `0dc701a`, `1ef33f3`

#### October 20, 2026

- Public launch scaffolding and monitoring
  - Introduced a public landing page, dashboard routing, analytics controls, and safer monitoring setup to support broader production use.
  - Commits: `63da880`, `69bbb21`, `6f433fb`, `a5a1fe6`, `4112550`, `8ba09ff`, `c0f877b`, `8638cb1`

#### October 23, 2026

- Phone auth, bank catalog, and lifecycle controls
  - Added Twilio-based phone OTP sign-in, RBI bank catalog and custom bank support, premium workspace integration, and lifecycle governance improvements.
  - Commits: `8cd6a87`, `7f9504f`, `a33f5ff`, `3ec0b60`, `cd72eff`, `4b64e5c`, `6c9eee0`, `d09c3a4`

### November 2026

#### November 2, 2026

- Public site and help experience
  - Localized public pages, FAQ flows, roadmap and feedback experiences, and improved navigation made the public side feel more complete and self-serve.
  - Commits: `cf0d2ad`, `be9f9ef`, `ec33a68`, `f57937c`, `2a64b5b`, `40e433e`, `f910ebc`, `279ff6f`

- Security and privacy hardening
  - Tightened PIN locking, privacy previews, middleware safety, and account-wide verification flows to raise the bar on trust and protection.
  - Commits: `a613008`, `492827c`, `9473580`, `87fe186`, `1155a6d`, `c9b219d`, `b14c6e9`, `65ea464`, `8082aec`, `43624f1`

- Dashboard and guidance improvements
  - Added more contextual help, quota visibility, and dashboard actions to improve discoverability and product comprehension.
  - Commits: `2e87b7f`, `bd258e1`, `eb09ef0`, `8c275ff`, `8082aec`, `a613008`

#### November 3, 2026

- Unified edit flows and draft system
  - Reworked the edit-save experience into a more consistent model and launched a centralized drafts page across tags, cheques, parties, accounts, and businesses.
  - Commits: `5c06aa0`, `2afc74d`, `2abfef2`, `04271df`, `c15d37b`, `21fb653`, `a224df3`, `5d5a7ba`, `b1bab4b`, `3dd66f7`, `755ea8d`, `066737e`, `5df3056`, `221e1f3`, `ae03092`

- Security, notification, and profile polish
  - Refined PIN settings, profile validation, notification inbox states, and preference controls to improve reliability and day-to-day usability.
  - Commits: `818994e`, `f939104`, `35da634`, `484dcc5`, `2667142`, `144d071`, `0f339bc`, `221e1f3`, `ae03092`

- Shareable UI refinements
  - Improved mobile layouts, sticky pagination, floating action menus, and personalization patterns to give the app a more premium, consistent finish.
  - Commits: `712c97f`, `65b9d5f`, `de5ef7e`, `a0ad65e`, `ba82998`, `2716076`, `106f391`, `8eacb4f`, `aa379f3`, `22dcaa3`, `eb09ef0`, `1013a83`, `589927c`, `223e690`, `2d0ca58`, `b04c2ba`, `aa4e6a9`, `c677ca2`, `0851b28`, `be5ca9d`

#### November 4, 2026

- Push delivery and environment readiness
  - Hardened push validation around FCM endpoints and added a Supabase example environment configuration to streamline setup and deployment work.
  - Commits: `765c865`, `f39c379`, `b6ac7ba`

#### November 5, 2026

- Support experience and analytics
  - Completed support navigation, announcements, analytics instrumentation, and signed-out auth handling to improve app resilience and customer support quality.
  - Commits: `196b706`, `12d6f4b`, `a92c1e1`, `5dcfb96`, `d8c06dd`

#### November 6, 2026

- Navigation, locale, and app polish
  - Refined the landing page, header actions, avatar menu, settings icon visibility, and locale UX to create a more polished finish.
  - Commits: `7df018d`, `8873ddb`, `b1d036e`, `bbf5818`, `a148353`

- Auth diagnostics and failure handling
  - Improved phone-provider troubleshooting and sanitized auth logging so support and engineering can diagnose failures faster.
  - Commits: `440dec2`, `5060771`, `f225fbe`, `6934c45`, `1c89b4f`

---

## Product arc summary

Across this release history, the team focused on four core themes:

- Founding the app and establishing the cheque-management workflow
- Hardening the platform through security, monitoring, and infrastructure work
- Building premium, notifications, and monetization capabilities
- Polishing the product experience for public launch, localization, and day-to-day usability

This changelog is intentionally summarized at the milestone level so it remains readable while still preserving specific commit references for the work behind each theme.

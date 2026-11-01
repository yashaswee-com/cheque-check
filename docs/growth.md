# Growth features

The shared Premium mark and Lifetime product icon use a crown. Only current paid
Lifetime ownership receives muted styling; trial, Scanner and Voice access do not.
The gold crown shine is disabled for OS or profile reduced-motion preferences.

The dashboard uses the existing bounded `free_plan_usage` RPC for cross-business
active cheque usage and current scan/voice quotas. Lifetime/trial users do not
see the card. Scanner/Voice subscriptions alone do not hide the cheque cap.
Warnings begin at exactly 80%; exhausted counters show zero remaining.
Loading/errors never masquerade as zero usage. Focus and cheque/business
mutations refresh the card.

Developer messages are server-managed `announcements` with locale copy, immutable
versions, publish and expiry dates. The latest published message appears on About
and in a dashboard sheet after onboarding until acknowledged. Acknowledgement is
idempotent per user/announcement across devices. The installation card waits until
acknowledgement; no announcement push is sent. Apply
`20261104010000_developer_announcements.sql`. Trusted operators publish a new
version through SQL using service-role access; clients cannot author content.

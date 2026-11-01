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

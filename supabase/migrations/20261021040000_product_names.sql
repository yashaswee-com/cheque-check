-- Display labels only: identifiers, prices, durations and fulfillment stay unchanged.
UPDATE public.payment_products
SET name = CASE id
  WHEN 'lifetime_premium' THEN 'Premium - Lifetime'
  WHEN 'ai_scanner_30d' THEN 'AI Scanner - 30-Day Pack (250 scans)'
  WHEN 'voice_reminder_30d' THEN 'Voice Reminders - 30-Day Pack (100 calls)'
  WHEN 'ai_scan_250' THEN 'AI Scanner - Top-Up (250 scans)'
  WHEN 'voice_reminder_100' THEN 'Voice Reminders - Top-Up (100 calls)'
END
WHERE id IN (
  'lifetime_premium', 'ai_scanner_30d', 'voice_reminder_30d',
  'ai_scan_250', 'voice_reminder_100'
);

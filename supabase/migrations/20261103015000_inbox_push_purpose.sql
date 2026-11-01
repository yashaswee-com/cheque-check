-- Commit the enum addition before the next migration creates its producer.
ALTER TYPE public.notification_purpose ADD VALUE IF NOT EXISTS 'inbox_event';

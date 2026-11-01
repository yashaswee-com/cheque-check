ALTER TABLE public.profiles ADD COLUMN tour_status text CHECK(tour_status IN ('pending','completed','skipped'));
-- Existing users opt in with Replay tour; new profiles are eligible automatically.
UPDATE public.profiles SET tour_status='skipped';
ALTER TABLE public.profiles ALTER COLUMN tour_status SET DEFAULT 'pending';
ALTER TABLE public.profiles ALTER COLUMN tour_status SET NOT NULL;

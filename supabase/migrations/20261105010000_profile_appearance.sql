ALTER TABLE public.profiles ADD COLUMN appearance text NOT NULL DEFAULT 'system'
  CHECK(appearance IN ('light','dark','system'));

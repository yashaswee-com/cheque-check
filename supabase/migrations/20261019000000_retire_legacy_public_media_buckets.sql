DO $$
DECLARE
  previous_allow_delete TEXT := current_setting('storage.allow_delete_query', true);
BEGIN
  -- Keep the emptiness check valid until the bucket records are removed.
  LOCK TABLE storage.buckets, storage.objects IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('avatars', 'cheque-images')
  ) THEN
    RAISE EXCEPTION
      'Legacy public media buckets are not empty. Migrate or remove their objects before retiring them.';
  END IF;

  DROP POLICY IF EXISTS "Public Access" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload cheque images" ON storage.objects;
  DROP POLICY IF EXISTS "Avatar Public Access" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their avatars" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their avatars" ON storage.objects;

  -- Supabase Storage requires an explicit opt-in even for empty buckets.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.buckets
  WHERE id IN ('avatars', 'cheque-images');
  PERFORM set_config('storage.allow_delete_query', COALESCE(previous_allow_delete, 'false'), true);
END;
$$;

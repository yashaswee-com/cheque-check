DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('avatars', 'cheque-images')
  ) THEN
    RAISE EXCEPTION
      'Legacy public media buckets are not empty. Migrate or remove their objects before retiring them.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload cheque images" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their avatars" ON storage.objects;

DELETE FROM storage.buckets
WHERE id IN ('avatars', 'cheque-images');

-- Add avatar_url to profiles and parties
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
ALTER TABLE parties ADD COLUMN avatar_url TEXT;

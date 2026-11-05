
-- Add tags column to categories table for filtering/tagging support
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add hero_visible column to control visibility on homepage hero section
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS hero_visible boolean DEFAULT true;

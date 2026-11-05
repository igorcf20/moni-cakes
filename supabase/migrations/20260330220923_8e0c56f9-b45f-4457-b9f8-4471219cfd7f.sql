-- Add phone column to newsletter_subscriptions
ALTER TABLE public.newsletter_subscriptions 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add a column to store which list they joined (newsletter vs broadcast)
ALTER TABLE public.newsletter_subscriptions 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'newsletter';

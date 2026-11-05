-- Add name column to newsletter_subscriptions
ALTER TABLE public.newsletter_subscriptions 
ADD COLUMN IF NOT EXISTS name TEXT;

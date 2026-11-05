ALTER TABLE public.order_designs ADD COLUMN IF NOT EXISTS upload_complete boolean NOT NULL DEFAULT false;
-- Backfill: existing rows that already have files are assumed complete (no way to verify here without I/O).
-- We mark rows older than 1 day as complete to avoid breaking existing orders' UI.
UPDATE public.order_designs SET upload_complete = true WHERE created_at < now() - interval '1 day';
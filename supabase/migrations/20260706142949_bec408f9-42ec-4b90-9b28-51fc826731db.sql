
-- Revoke EXECUTE on backend-only SECURITY DEFINER functions from anon/authenticated.
-- These are called only from triggers or Edge Functions using service_role.

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
-- LOJA 3D (base própria): email_queue_wake() e email_queue_dispatch() eram criadas fora das
-- migrations pela ferramenta de e-mail da Lovable; só se revogam se existirem.
DO $$
BEGIN
  IF to_regprocedure('public.email_queue_wake()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
  END IF;
  IF to_regprocedure('public.email_queue_dispatch()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_delivery_method() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_billing_default() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_design_cleanup_on_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_secure_amounts() FROM anon, authenticated;

-- Storage usage is admin-only; revoke and re-grant just to authenticated (admins pass through JWT).
-- Function has no internal admin check but returns aggregate counts across buckets; restrict at RPC layer.
REVOKE EXECUTE ON FUNCTION public.get_storage_usage() FROM anon;

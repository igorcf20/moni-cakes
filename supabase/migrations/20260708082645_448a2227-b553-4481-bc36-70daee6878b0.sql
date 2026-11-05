
CREATE OR REPLACE FUNCTION public.request_order_cancellation(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
BEGIN
  SELECT id, user_id, status, cancellation_status
    INTO o
    FROM public.orders
   WHERE id = _order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF o.user_id IS NULL OR o.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;
  IF o.cancellation_status = 'requested' THEN
    RAISE EXCEPTION 'Já existe um pedido de cancelamento em análise';
  END IF;
  IF o.status NOT IN ('pending','awaiting_payment','paid') THEN
    RAISE EXCEPTION 'Este pedido já não pode ser cancelado';
  END IF;

  UPDATE public.orders
     SET cancellation_status = 'requested',
         cancellation_requested_at = now(),
         cancellation_reason = NULLIF(btrim(_reason), '')
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.order_status_history (order_id, status, note, created_by)
    VALUES (_order_id, o.status, 'Cancelamento solicitado pelo cliente' ||
      CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> '' THEN ' — ' || _reason ELSE '' END,
      auth.uid());
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
END;
$function$;

-- Corrige o histórico de encomendas e a coluna paid_at.
--
-- 1) As funções request_order_cancellation e admin_set_payment_status inseriam em order_status_history
--    usando as colunas "note" e "created_by", mas a tabela tem "notes" e "changed_by". O erro era engolido
--    pelo bloco EXCEPTION (undefined_column) e o histórico nunca ficava registado (pedido de cancelamento
--    do cliente e alteração do estado de pagamento pelo admin).
-- 2) admin_set_payment_status atualiza orders.paid_at, mas essa coluna nunca foi criada em nenhuma migration.
--    Sem ela, a função falha sempre ("column paid_at does not exist") e o admin não consegue marcar um
--    pagamento como pago (por exemplo, ao aprovar um comprovativo). O trigger orders_secure_amounts já
--    prevê a coluna, por isso criá-la é seguro.
--
-- Executar no SQL Editor. Seguro de repetir.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

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

  -- Indica ao trigger orders_secure_amounts que esta alteração é de confiança (só nesta transação).
  PERFORM set_config('app.bypass_orders_lock', '1', true);

  UPDATE public.orders
     SET cancellation_status = 'requested',
         cancellation_requested_at = now(),
         cancellation_reason = NULLIF(btrim(_reason), '')
   WHERE id = _order_id;

  PERFORM set_config('app.bypass_orders_lock', '', true);

  INSERT INTO public.order_status_history (order_id, status, notes, changed_by)
  VALUES (_order_id, o.status, 'Cancelamento solicitado pelo cliente' ||
    CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> '' THEN ': ' || _reason ELSE '' END,
    auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_payment_status(
  _order_id uuid, _payment_status text, _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cur record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _payment_status NOT IN ('pending','paid','failed','refunded') THEN
    RAISE EXCEPTION 'payment_status inválido';
  END IF;

  SELECT id, status, payment_status INTO cur FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido não encontrado'; END IF;

  PERFORM set_config('app.bypass_orders_lock', '1', true);
  UPDATE public.orders
     SET payment_status = _payment_status,
         paid_at = CASE WHEN _payment_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
   WHERE id = _order_id;
  PERFORM set_config('app.bypass_orders_lock', '', true);

  INSERT INTO public.order_status_history (order_id, status, notes, changed_by)
  VALUES (_order_id, cur.status,
    'Pagamento marcado como ' || _payment_status ||
    CASE WHEN _note IS NOT NULL AND btrim(_note) <> '' THEN ': ' || _note ELSE '' END,
    auth.uid());
END $$;

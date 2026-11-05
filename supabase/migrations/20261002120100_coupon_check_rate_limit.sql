-- Cupões: só clientes com sessão iniciada, com limite de tentativas falhadas.
--
-- Antes, validate_coupon podia ser chamada por qualquer visitante sem limite, o que permitia adivinhar
-- códigos por força bruta. Agora o site usa check_coupon: exige sessão e bloqueia 15 minutos depois de
-- 10 códigos errados. A gravação da encomenda já não depende de validate_coupon (o trigger da encomenda
-- valida o cupão diretamente na tabela).
-- Executar no SQL Editor (depois de 20261002100100). Seguro de repetir.

CREATE TABLE IF NOT EXISTS public.coupon_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_attempts_user_time_idx ON public.coupon_attempts (user_id, created_at DESC);
ALTER TABLE public.coupon_attempts ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só a função abaixo (SECURITY DEFINER) lê e escreve.

CREATE OR REPLACE FUNCTION public.check_coupon(_code text)
RETURNS TABLE(code text, discount_type text, discount_value numeric, min_purchase numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  failures integer;
  found_row record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicie sessão para usar um cupão.';
  END IF;

  SELECT count(*) INTO failures FROM public.coupon_attempts
   WHERE user_id = uid AND NOT success AND created_at > now() - interval '15 minutes';
  IF failures >= 10 THEN
    RAISE EXCEPTION 'Demasiadas tentativas de cupão. Tente novamente dentro de 15 minutos.';
  END IF;

  SELECT c.code, c.discount_type, c.discount_value, c.min_purchase INTO found_row
    FROM public.coupons c
   WHERE c.active = true
     AND lower(c.code) = lower(btrim(COALESCE(_code, '')))
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.max_uses IS NULL OR COALESCE(c.current_uses, 0) < c.max_uses)
   LIMIT 1;

  INSERT INTO public.coupon_attempts (user_id, success) VALUES (uid, found_row.code IS NOT NULL);
  DELETE FROM public.coupon_attempts WHERE created_at < now() - interval '1 day';

  IF found_row.code IS NOT NULL THEN
    RETURN QUERY SELECT found_row.code::text, found_row.discount_type::text, found_row.discount_value::numeric, found_row.min_purchase::numeric;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_coupon(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coupon(text) TO authenticated;

-- A função antiga deixa de estar aberta a visitantes e clientes (continua disponível para o servidor).
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text) FROM PUBLIC, anon, authenticated;

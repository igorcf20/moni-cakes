-- Códigos do produto: além do SKU e do GTIN (20261006220000_product_variants.sql), o código interno de controle da
-- loja (internal_code, único na loja, sem diferença de maiúsculas) e o código da marca ou do fabricante (mpn, livre).
-- Onde cada código aparece ao cliente fica em store_settings.product_codes (src/lib/productCodes.ts).
-- Vazio vira NULL. Repetir o código interno de outro produto: erro internal_code_taken (o Admin traduz).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS mpn text;

ALTER TABLE public.products
  ADD CONSTRAINT products_internal_code_len CHECK (internal_code IS NULL OR char_length(internal_code) BETWEEN 1 AND 64),
  ADD CONSTRAINT products_mpn_len CHECK (mpn IS NULL OR char_length(mpn) BETWEEN 1 AND 70);

CREATE OR REPLACE FUNCTION public.products_codes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.internal_code := nullif(btrim(regexp_replace(coalesce(NEW.internal_code, ''), '\s+', ' ', 'g')), '');
  NEW.mpn := nullif(btrim(regexp_replace(coalesce(NEW.mpn, ''), '\s+', ' ', 'g')), '');
  IF NEW.internal_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products p
     WHERE lower(p.internal_code) = lower(NEW.internal_code) AND p.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'internal_code_taken' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_codes_guard ON public.products;
CREATE TRIGGER products_codes_guard
  BEFORE INSERT OR UPDATE OF internal_code, mpn ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_codes_guard();

-- Também garante a regra com escrita em paralelo (o trigger só vê o que já foi gravado).
CREATE UNIQUE INDEX IF NOT EXISTS products_internal_code_unique ON public.products (lower(internal_code)) WHERE internal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_mpn_idx ON public.products (lower(mpn)) WHERE mpn IS NOT NULL;

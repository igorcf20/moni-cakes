-- Página pública de avaliações (/avaliacoes, recurso store_reviews).
-- Avaliações da loja = home_section_items kind 'testimonial' (aprovadas no Admin > Avaliações); a vista
-- home_section_items_public é security_invoker e os visitantes não leem a tabela base, por isso o site lê por aqui.
-- Avaliações de produtos = product_reviews aprovadas de produtos ativos. Só colunas seguras; o nome do cliente vai
-- abreviado (primeiro nome e inicial do último), nunca o e-mail.

CREATE OR REPLACE FUNCTION public._review_short_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(btrim(_name), '') = '' THEN NULL
    WHEN array_length(regexp_split_to_array(btrim(_name), '\s+'), 1) = 1 THEN btrim(_name)
    ELSE split_part(btrim(_name), ' ', 1) || ' '
      || upper(left((regexp_split_to_array(btrim(_name), '\s+'))[array_length(regexp_split_to_array(btrim(_name), '\s+'), 1)], 1)) || '.'
  END
$$;

CREATE OR REPLACE FUNCTION public.store_reviews_public(_kind text DEFAULT 'store', _limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 20), 1), 50);
  off integer := greatest(coalesce(_offset, 0), 0);
  store_summary jsonb;
  product_summary jsonb;
  items jsonb;
BEGIN
  IF NOT public.feature_enabled('store_reviews', true) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT jsonb_build_object(
    'count', count(*),
    'average', round(avg(rating)::numeric, 2),
    'dist', jsonb_build_array(
      count(*) FILTER (WHERE rating = 5), count(*) FILTER (WHERE rating = 4), count(*) FILTER (WHERE rating = 3),
      count(*) FILTER (WHERE rating = 2), count(*) FILTER (WHERE rating = 1)))
  INTO store_summary
  FROM public.home_section_items
  WHERE kind = 'testimonial' AND status = 'approved' AND is_active AND rating BETWEEN 1 AND 5;

  SELECT jsonb_build_object(
    'count', count(*),
    'average', round(avg(r.rating)::numeric, 2),
    'dist', jsonb_build_array(
      count(*) FILTER (WHERE r.rating = 5), count(*) FILTER (WHERE r.rating = 4), count(*) FILTER (WHERE r.rating = 3),
      count(*) FILTER (WHERE r.rating = 2), count(*) FILTER (WHERE r.rating = 1)))
  INTO product_summary
  FROM public.product_reviews r
  JOIN public.products p ON p.id = r.product_id AND p.is_active
  WHERE r.approved AND r.rating BETWEEN 1 AND 5;

  IF _kind = 'products' THEN
    SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
      SELECT r.id, r.rating, r.title, r.comment AS body, r.created_at, r.verified, r.image_url,
             r.admin_reply,
             public._review_short_name(coalesce(nullif(r.customer_name, ''), up.full_name)) AS author,
             p.id AS product_id, p.name AS product_name, p.slug AS product_slug, p.image AS product_image
      FROM public.product_reviews r
      JOIN public.products p ON p.id = r.product_id AND p.is_active
      LEFT JOIN public.user_profiles up ON up.user_id = r.user_id
      WHERE r.approved AND r.rating BETWEEN 1 AND 5
      ORDER BY r.created_at DESC, r.id
      LIMIT lim OFFSET off
    ) x;
  ELSE
    SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
      SELECT h.id, h.rating, h.title, h.body, h.created_at,
             public._review_short_name(h.author_name) AS author, h.author_role, h.author_location
      FROM public.home_section_items h
      WHERE h.kind = 'testimonial' AND h.status = 'approved' AND h.is_active AND h.rating BETWEEN 1 AND 5
      ORDER BY h.created_at DESC, h.id
      LIMIT lim OFFSET off
    ) x;
  END IF;

  RETURN jsonb_build_object('enabled', true, 'store', store_summary, 'products', product_summary, 'items', items);
END;
$$;

REVOKE ALL ON FUNCTION public.store_reviews_public(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_reviews_public(text, integer, integer) TO anon, authenticated;
REVOKE ALL ON FUNCTION public._review_short_name(text) FROM PUBLIC;

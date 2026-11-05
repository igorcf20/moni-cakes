-- Execute manualmente no SQL Editor do Supabase antes de publicar o frontend.
-- Controla por área se a arte participa na pré-visualização 3D. A área continua
-- disponível para upload, observações, preço e dados da encomenda quando false.
ALTER TABLE public.product_print_areas
  ADD COLUMN IF NOT EXISTS preview_enabled boolean NOT NULL DEFAULT true;

-- Ajuste apenas dos exemplos criados pela migration da Brindes M&L. Depois
-- desta execução, o administrador controla o valor individualmente no produto.
UPDATE public.product_print_areas
SET preview_enabled = false
WHERE product_id = 'bml-tshirt-navy'
  AND key = 'custom'
  AND label = 'Área personalizada';

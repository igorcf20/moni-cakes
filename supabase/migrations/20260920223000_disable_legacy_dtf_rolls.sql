-- Retira o fluxo legado de montagem/verificação de rolos DTF.
-- Os dados e tabelas históricos são preservados para encomendas antigas.
-- O preço por metro de um MATERIAL de personalização é independente desta opção.

INSERT INTO public.store_settings (key, value)
VALUES ('roll_verification_enabled', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();


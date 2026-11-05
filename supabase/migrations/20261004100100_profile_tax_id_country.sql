-- LOJA 3D, FASE 2: o documento fiscal do perfil passa a dizer de que país é (CPF/CNPJ no Brasil, NIF em Portugal...).
-- tax_id guarda só letras e dígitos (o CNPJ alfanumérico tem letras). Executar depois de 20261004100000_countries.sql.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS tax_id_country text REFERENCES public.countries(code);
COMMENT ON COLUMN public.user_profiles.tax_id IS 'Documento fiscal sem pontuação (CPF, CNPJ, NIF...), do país em tax_id_country.';
COMMENT ON COLUMN public.user_profiles.tax_id_country IS 'País do documento fiscal (countries.code). Vazio em perfis antigos: tratados como Portugal.';

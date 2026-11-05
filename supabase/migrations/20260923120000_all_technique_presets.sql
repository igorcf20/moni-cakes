-- Permite guardar presets para todos os métodos já usados nas áreas.
-- Executar após 20260920183000_customization_technique_pricing.sql.
-- LOJA 3D: sem BEGIN/COMMIT explícitos; o deploy/migrate.sh já corre cada ficheiro numa transação.
ALTER TABLE public.customization_technique_presets
  DROP CONSTRAINT IF EXISTS customization_technique_presets_technique_check;
ALTER TABLE public.customization_technique_presets
  ADD CONSTRAINT customization_technique_presets_technique_check
  CHECK (technique IN ('dtf', 'dtf_uv', 'sublimacao', 'serigrafia', 'bordado', 'gravacao_laser', 'vinil'));

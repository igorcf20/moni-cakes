-- =============================================================================================
-- Financeiro (recurso finance): Admin > Visão geral > Financeiro.
--  A receita das vendas, os impostos, o frete e o custo dos produtos vêm dos pedidos (orders, order_items,
--  products.cost_price); esta migration só guarda o que não está nos pedidos:
--  finance_categories  categorias de despesas e de outras entradas (code = categoria padrão, nome no i18n
--                      enquanto name estiver vazio; o dono pode renomear, criar e esconder)
--  finance_entries     despesas e outras entradas lançadas à mão: valor em centavos com a moeda ao lado, data,
--                      situação (pago / por pagar), vencimento, fornecedor, forma de pagamento, notas;
--                      repeat_group liga as cópias de um lançamento mensal
--  finance_settings    regras das contas (uma linha, só Admin): data que conta, % do frete que é custo, imposto
--                      estimado, taxas dos meios de pagamento, comissões de afiliados, meta do mês.
--                      Fica fora de store_settings porque essa tabela é de leitura pública.
--  Tudo só Admin (RLS por has_role); gravar exige o recurso finance ligado.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  code text UNIQUE,
  name text,
  color text NOT NULL DEFAULT 'orange',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_categories_kind CHECK (kind IN ('expense', 'income')),
  CONSTRAINT finance_categories_named CHECK (code IS NOT NULL OR char_length(btrim(coalesce(name, ''))) > 0),
  CONSTRAINT finance_categories_len CHECK ((name IS NULL OR char_length(name) <= 60) AND (code IS NULL OR code ~ '^[a-z_]{1,40}$')),
  CONSTRAINT finance_categories_color CHECK (color ~ '^[a-z]{1,20}$')
);
COMMENT ON TABLE public.finance_categories IS 'Categorias dos lançamentos do Admin > Financeiro. code = categoria padrão (nome no i18n enquanto name for vazio).';

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  occurred_on date NOT NULL DEFAULT current_date,
  due_on date,
  status text NOT NULL DEFAULT 'paid',
  payment_method text,
  counterparty text,
  reference text,
  notes text,
  repeat_group uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_entries_kind CHECK (kind IN ('expense', 'income')),
  CONSTRAINT finance_entries_status CHECK (status IN ('paid', 'pending')),
  CONSTRAINT finance_entries_amount CHECK (amount_cents > 0 AND amount_cents <= 100000000000000),
  CONSTRAINT finance_entries_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT finance_entries_len CHECK (
    char_length(btrim(description)) BETWEEN 1 AND 200
    AND (payment_method IS NULL OR char_length(payment_method) <= 60)
    AND (counterparty IS NULL OR char_length(counterparty) <= 120)
    AND (reference IS NULL OR char_length(reference) <= 120)
    AND (notes IS NULL OR char_length(notes) <= 2000))
);
CREATE INDEX IF NOT EXISTS finance_entries_date_idx ON public.finance_entries (occurred_on DESC);
CREATE INDEX IF NOT EXISTS finance_entries_pending_idx ON public.finance_entries (status, due_on) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS finance_entries_category_idx ON public.finance_entries (category_id);
CREATE INDEX IF NOT EXISTS finance_entries_group_idx ON public.finance_entries (repeat_group) WHERE repeat_group IS NOT NULL;
COMMENT ON TABLE public.finance_entries IS 'Despesas e outras entradas lançadas à mão no Admin > Financeiro. Só admin.';

CREATE TABLE IF NOT EXISTS public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_settings_single CHECK (id),
  CONSTRAINT finance_settings_object CHECK (jsonb_typeof(value) = 'object' AND pg_column_size(value) < 20000)
);
COMMENT ON TABLE public.finance_settings IS 'Regras das contas do Admin > Financeiro (uma linha). Só admin.';

-- Acesso: só Admin; criar e mudar só com o recurso ligado.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories', 'finance_entries', 'finance_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins read %s" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins insert %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role) AND public.feature_enabled(''finance'', true))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins update %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins update %s" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role) AND public.feature_enabled(''finance'', true))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins delete %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins delete %s" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Lançamento: textos limpos, autor e datas pelo servidor; código da categoria padrão não muda.
CREATE OR REPLACE FUNCTION public.finance_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.description := btrim(NEW.description);
  NEW.payment_method := nullif(btrim(coalesce(NEW.payment_method, '')), '');
  NEW.counterparty := nullif(btrim(coalesce(NEW.counterparty, '')), '');
  NEW.reference := nullif(btrim(coalesce(NEW.reference, '')), '');
  NEW.notes := nullif(btrim(coalesce(NEW.notes, '')), '');
  NEW.currency := upper(NEW.currency);
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS finance_entries_guard ON public.finance_entries;
CREATE TRIGGER finance_entries_guard BEFORE INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_guard();

CREATE OR REPLACE FUNCTION public.finance_categories_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := nullif(btrim(coalesce(NEW.name, '')), '');
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.code := OLD.code;
    NEW.kind := OLD.kind;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS finance_categories_guard ON public.finance_categories;
CREATE TRIGGER finance_categories_guard BEFORE INSERT OR UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.finance_categories_guard();

CREATE OR REPLACE FUNCTION public.finance_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS finance_settings_touch ON public.finance_settings;
CREATE TRIGGER finance_settings_touch BEFORE INSERT OR UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.finance_settings_touch();

-- Categorias padrão (nome no i18n: cat_<code>); o dono pode renomear ou esconder.
INSERT INTO public.finance_categories (kind, code, color, display_order) VALUES
  ('expense', 'materials', 'orange', 10),
  ('expense', 'packaging', 'amber', 20),
  ('expense', 'shipping', 'blue', 30),
  ('expense', 'marketing', 'magenta', 40),
  ('expense', 'software', 'violet', 50),
  ('expense', 'rent', 'aqua', 60),
  ('expense', 'salaries', 'green', 70),
  ('expense', 'taxes', 'red', 80),
  ('expense', 'equipment', 'gray', 90),
  ('expense', 'fees', 'amber', 100),
  ('expense', 'other_expense', 'gray', 110),
  ('income', 'services', 'green', 10),
  ('income', 'investment', 'blue', 20),
  ('income', 'other_income', 'gray', 30)
ON CONFLICT (code) DO NOTHING;

-- Registo de atividade do Admin (mesma função das outras tabelas).
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.finance_categories;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.finance_categories
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.finance_entries;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.finance_entries
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.finance_settings;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.finance_settings
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

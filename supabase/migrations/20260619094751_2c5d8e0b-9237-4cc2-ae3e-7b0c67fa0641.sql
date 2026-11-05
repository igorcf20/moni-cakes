
-- ===== Credentials seguros (Viva Wallet, CTT, Resend) =====
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL DEFAULT 'demo',
  is_active BOOLEAN NOT NULL DEFAULT false,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all" ON public.integration_credentials FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE TRIGGER integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Auth attempts =====
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT,
  identifier TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON public.auth_attempts (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_ident_idx ON public.auth_attempts (identifier, created_at DESC);
GRANT ALL ON public.auth_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auth_attempts_id_seq TO service_role;
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all" ON public.auth_attempts FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ===== Rate limit log =====
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_log_bucket_idx ON public.rate_limit_log (bucket, created_at DESC);
GRANT ALL ON public.rate_limit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_log_id_seq TO service_role;
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all" ON public.rate_limit_log FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ===== CTT tracking events =====
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_code TEXT NOT NULL,
  status_code TEXT,
  status_label TEXT,
  description TEXT,
  occurred_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracking_events_order_idx ON public.tracking_events (order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS tracking_events_code_idx ON public.tracking_events (tracking_code);
GRANT SELECT ON public.tracking_events TO authenticated, anon;
GRANT ALL ON public.tracking_events TO service_role;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see events of own orders" ON public.tracking_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "Admins see all tracking events" ON public.tracking_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anon read tracking" ON public.tracking_events FOR SELECT TO anon USING (true);

-- ===== Viva Wallet sessions =====
CREATE TABLE IF NOT EXISTS public.viva_payment_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  viva_order_code TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  checkout_url TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viva_sessions_order_idx ON public.viva_payment_sessions (order_id);
CREATE INDEX IF NOT EXISTS viva_sessions_code_idx ON public.viva_payment_sessions (viva_order_code);
GRANT ALL ON public.viva_payment_sessions TO service_role;
ALTER TABLE public.viva_payment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all" ON public.viva_payment_sessions FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE TRIGGER viva_sessions_updated_at BEFORE UPDATE ON public.viva_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Email templates =====
CREATE TABLE IF NOT EXISTS public.email_templates (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  intro TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_templates TO authenticated, anon;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage email templates" ON public.email_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone read templates" ON public.email_templates FOR SELECT TO anon, authenticated USING (true);
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.email_templates (key, display_name, subject, intro) VALUES
  ('order_new', 'Nova encomenda', 'Obrigado pela tua encomenda #{order_id}', 'Recebemos a tua encomenda e vamos começar a preparar tudo. Enviaremos novidades em breve.'),
  ('payment_pending', 'Pagamento pendente', 'A aguardar pagamento — Encomenda #{order_id}', 'Estamos a aguardar a confirmação do pagamento da tua encomenda. Quando recebermos, avançamos com a produção.'),
  ('payment_confirmed', 'Pagamento confirmado', 'Pagamento confirmado — Encomenda #{order_id}', 'Recebemos o teu pagamento! Vamos começar a preparar a encomenda.'),
  ('order_shipped', 'Encomenda enviada', 'A tua encomenda está a caminho — #{order_id}', 'A tua encomenda foi expedida. Podes acompanhá-la com o código de rastreio abaixo.'),
  ('account_created', 'Conta criada', 'Bem-vindo à BOM DTF', 'A tua conta foi criada com sucesso. Já podes acompanhar as tuas encomendas no painel.'),
  ('account_confirmation', 'Confirma o teu email', 'Confirma o teu email — BOM DTF', 'Clica no botão para confirmar o teu endereço de email e ativar a conta.')
ON CONFLICT (key) DO NOTHING;

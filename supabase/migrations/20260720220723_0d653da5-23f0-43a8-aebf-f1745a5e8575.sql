
CREATE TABLE public.site_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'Geral',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_faqs TO authenticated;
GRANT ALL ON public.site_faqs TO service_role;

ALTER TABLE public.site_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FAQs are publicly readable when active"
  ON public.site_faqs FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage FAQs"
  ON public.site_faqs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_site_faqs_updated_at
  BEFORE UPDATE ON public.site_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed FAQ content (PT-PT)
INSERT INTO public.site_faqs (category, question, answer, display_order) VALUES
('Encomendas', 'Como posso fazer uma encomenda na Brindes M&L?', 'Escolha o produto, selecione tamanho e cor, defina as áreas de personalização, envie a sua arte e finalize a encomenda no checkout. Receberá um email de confirmação imediato com o resumo da encomenda e as instruções de pagamento.', 1),
('Encomendas', 'Existe quantidade mínima de encomenda?', 'A maioria dos produtos não tem mínimo — pode encomendar a partir de 1 unidade. Para brindes corporativos e kits personalizados aplicam-se descontos por volume automáticos a partir de 10 unidades.', 2),
('Encomendas', 'Posso alterar ou cancelar a minha encomenda?', 'Sim, enquanto o estado do pedido for "Aguardar Pagamento" ou "Pendente". No painel de cliente, na secção "Os meus pedidos", pode pedir o cancelamento e a nossa equipa responde em até 24 horas úteis.', 3),

('Personalização', 'Que ficheiros posso enviar para personalizar os produtos?', 'Aceitamos PNG, JPG e PDF até 20 MB por área de personalização. Para melhor resultado recomendamos PNG com fundo transparente, no mínimo 1500 px no lado maior e 300 DPI.', 10),
('Personalização', 'Como sei se a minha arte tem qualidade suficiente para imprimir?', 'O nosso sistema analisa automaticamente cada ficheiro enviado: verifica resolução, DPI, transparência e se cabe dentro da área máxima em centímetros. Ficheiros com baixa resolução exibem um aviso e exigem aceitação explícita antes da produção.', 11),
('Personalização', 'Posso personalizar várias áreas do mesmo produto?', 'Sim. Cada produto tem áreas configuradas (frente, costas, manga, etc.) e pode enviar um ficheiro diferente para cada área, com preço calculado automaticamente por tamanho e técnica.', 12),
('Personalização', 'Que técnicas de personalização utilizam?', 'Trabalhamos com DTF, DTF UV, sublimação, bordado, serigrafia, gravação laser e corte de vinil. A técnica é escolhida em função do produto e da arte enviada.', 13),

('Envio', 'Qual é o prazo de produção e envio?', 'Produção entre 3 a 5 dias úteis após confirmação do pagamento e da arte. Envio via CTT Expresso em 24 a 48 horas úteis para Portugal Continental. Ilhas e envios internacionais têm prazos específicos apresentados no checkout.', 20),
('Envio', 'Fazem envios para as Ilhas e para o estrangeiro?', 'Sim, entregamos em Portugal Continental, Açores, Madeira e União Europeia. Os portes e prazos são calculados no checkout de acordo com o destino, peso e volume da encomenda.', 21),
('Envio', 'Posso levantar a encomenda?', 'Sim, disponibilizamos a opção "Levantamento em Loja" no checkout, sem custo de envio. Receberá um email quando a encomenda estiver pronta para levantamento.', 22),

('Pagamento', 'Que métodos de pagamento aceitam?', 'Aceitamos Multibanco, MB WAY, transferência bancária, cartão de crédito e débito. Todos os pagamentos são processados por gateway seguro com encriptação SSL.', 30),
('Pagamento', 'É seguro pagar no vosso site?', 'Sim. Todas as ligações são encriptadas com SSL e os pagamentos são processados por operadores certificados PCI-DSS. Não guardamos dados de cartões nos nossos servidores.', 31),
('Pagamento', 'Emitem fatura com NIF para empresas?', 'Sim, emitimos fatura eletrónica com NIF. Basta indicar o NIF no checkout ou no perfil da conta e a fatura é enviada automaticamente por email.', 32),

('Devoluções', 'Posso devolver um produto personalizado?', 'Produtos personalizados feitos por medida não têm direito a devolução por desistência, conforme legislação portuguesa (Decreto-Lei 24/2014). No entanto, se o produto tiver defeito de fabrico ou não corresponder ao pedido, aceitamos troca ou reembolso.', 40),
('Devoluções', 'O que fazer se o produto chegar com defeito?', 'Contacte-nos até 14 dias após a receção através de geral@brindesml.pt com fotografias do defeito. Depois de validado, oferecemos reimpressão gratuita ou reembolso integral.', 41),

('Empresas', 'Fazem brindes corporativos e kits personalizados?', 'Sim, é a nossa especialidade. Criamos kits de boas-vindas, brindes para eventos, uniformes personalizados e merchandising para empresas. Peça orçamento personalizado em /contatos.', 50),
('Empresas', 'Trabalham com revendedores e agências de publicidade?', 'Sim, temos condições especiais para revendedores, agências e gráficas. Contacte-nos para receber a tabela de preços B2B.', 51);

# Administração de produtos e Viva Wallet

## Migrations

As migrations de `supabase/migrations/` são aplicadas pelo próprio deploy no VPS (serviço `migrate` do
`deploy/compose.yaml`, chamado pelo `deploy/sync.sh`), por ordem de nome e uma só vez cada. A migration
`20260920143000_repair_admin_presets_and_viva.sql` é idempotente e:

- cria a matriz variação × tamanho antes de adicionar o acréscimo;
- completa presets de tamanhos e cores sem apagar dados antigos;
- mantém presets antigos com acréscimo padrão zero;
- acrescenta as ordens independentes de catálogo, categoria e destaques;
- acrescenta o UUID e a causa de falha às sessões Viva.

## Edge Functions Viva

As funções (`viva-create-order`, `viva-verify-payment`, `viva-webhook`, `viva-test-connection`) correm no
serviço `functions` do VPS, que o `deploy/sync.sh` recria a cada push no `main`. O `viva-webhook` tem
`verify_jwt = false` em `supabase/config.toml`.

O webhook precisa aceitar pedidos da Viva sem JWT; a confirmação de pagamento é feita novamente no servidor consultando a transação pelo UUID.

No painel Viva, configurar a fonte de pagamento com:

- Success URL: `https://SEU-DOMINIO/pagamento/viva/retorno`
- webhook: `https://SEU-DOMINIO/functions/v1/viva-webhook` (o mesmo domínio do site)
- eventos: 1796 (pago), 1797 (reembolso/reversão), 1798 (falha) e 4865 (cancelamento/atualização da ordem)

O frontend usa Smart Checkout hospedado. Dados de cartão não passam pela aplicação.

## Fluxo administrativo de produtos

- Produtos novos entram no final do catálogo.
- Produtos duplicados são criados inativos, no final da lista, com tamanhos, variações, disponibilidade, galeria, categorias, preços, FAQ, escalões, relações e áreas de personalização copiados.
- Se uma etapa da duplicação falhar, a cópia incompleta é removida.
- A lista permite ordenar separadamente o catálogo geral, a categoria selecionada e os destaques, incluindo “Mover para primeiro”.
- A galeria permite definir a imagem principal, reordenar, mover entre variações e remover com confirmação.
- Ao mover uma imagem para outra variação, ela entra no fim do grupo e não colide com a ordem existente.
- O editor rico valida protocolos de links e permite limpar formatação e inserir separadores.

## Testes manuais essenciais

1. Criar produto com referência, nome, categoria e preço; confirmar que aparece no fim.
2. Duplicar produto personalizável; confirmar que a cópia está inativa e contém as áreas, imagens, tamanhos e variações.
3. Em “Todos”, mover um produto e confirmar que categoria/destaques não mudaram.
4. Selecionar uma categoria, mover para primeiro e abrir a página pública dessa categoria.
5. Selecionar “Destaques”, mover para primeiro e verificar a secção pública de destaques.
6. Na galeria, mover imagem entre variações, definir como principal e eliminar outra imagem.
7. No painel de integrações, guardar Client ID, Client Secret, Source Code e Webhook Key e executar “Testar ligação”.
8. Criar uma encomenda em Demo, seguir para a Viva e regressar; confirmar `payment_status = paid`, histórico e `viva_transaction_id`.
9. Recarregar o checkout antes de pagar e confirmar que a sessão Viva recente é reutilizada.

## Segurança do pagamento (Viva) — resumo

- `supabase/config.toml` define `verify_jwt = false` só para `viva-webhook`; as restantes funções exigem sessão.
- Todos os estados de pagamento vêm da API *Retrieve Transaction* (nunca do corpo do webhook nem do URL de retorno): estado `F`, `orderCode` da nossa sessão, moeda EUR e valor ≥ total (a Viva devolve euros; a encomenda usa cêntimos).
- Eventos repetidos são idempotentes; pagamento duplicado, pagamento após cancelamento e pagamento com ficheiros por validar ficam registados em `order_status_history` para revisão.
- Falhas (1798) nunca revertem uma encomenda já paga. Reembolso (1797) só é aceite como nova transação da mesma ordem.
- `viva-create-order`: limite de 6 sessões/hora por encomenda, bloqueia encomendas canceladas/reembolsadas.
- Segredo opcional `VIVA_WEBHOOK_STRICT_IP=true` rejeita chamadas que não venham dos IPs da Viva.
- A função `viva-charge-token` (Native Checkout, sem uso) foi removida: apague-a também no Supabase.

Ao ativar Produção mudam Client ID, Client Secret, Source Code e Webhook Key; o URL do webhook regista-se de novo na conta live.

# Artes por área: medidas, qualidade e confirmação

## Fluxo atual

Só os produtos personalizáveis abrem o formulário existente. Cada área conserva
o seu limite, preço, técnica, imagem e observações configurados no painel.
Não há visualização 3D, geração de produção nem alteração de ficheiros originais.

- PNG: dimensões físicas do pHYs com unidade em metros.
- JPEG: resolução EXIF (prioritária) ou JFIF com unidade física válida.
- PDF: CropBox e rotação da página, convertidos de pontos; uma página por área.
- Sem unidade física verificável (incluindo WEBP e SVG): o cliente informa a
  largura pretendida e a altura segue a proporção. Não se inventa um tamanho
  original a partir de uma suposição de 300 ppp.

O tamanho refere-se ao ficheiro/página completo, incluindo espaços e fundos,
não ao bounding box dos elementos visíveis. A análise não remove fundos.
As dimensões do pedido são guardadas sem arredondamento de cálculo; interface
e nome de download mostram até duas casas decimais.

`fitArtwork` aplica `min(1, limiteL/largura, limiteA/altura)` aos dois eixos.
Uma arte de 32 × 44 cm numa área de 30 × 40 cm ocupa **29,09 × 40 cm**:
30 × 40 achataria a proporção. Uma arte menor não é ampliada automaticamente.

## Qualidade e aceite

A estimativa usa o menor ppp efetivo entre os eixos nas medidas finais.
Menos de 150 ppp: baixa; entre 150 e 300: aceitável; 300 ou mais: recomendada.
São indicadores técnicos centrais, não garantia de qualidade de impressão.
Não avaliam nitidez, cores, conteúdo, transparência ou imagens dentro de PDFs.
PDFs/ficheiros sem resolução verificável recebem aviso de revisão manual.

Cada área exige confirmação explícita das medidas; qualidade baixa ou não
verificável exige também aceite do aviso. Trocar ficheiro ou dimensões invalida
o aceite. Envio rápido usa o mesmo fluxo, sem ignorar estas confirmações.

## Dados e painel

O original continua em `fileDataUrl` (base64 dos mesmos bytes, sem canvas,
compressão ou conversão). `artwork` guarda nome original, bytes, SHA-256,
píxeis, medida de origem e se foi embutida ou indicada pelo cliente.
O payload inclui medidas finais, limites, técnica, observações, preço,
resultado de qualidade, assinatura dos aceites e instante da confirmação.
`cart_items.design_data.customization.areas` e posteriormente
`order_items.design_data.customization.areas` conservam estes campos.
`CustomizationAreaFiles` apresenta os dados no carrinho/checkout/pedido/painel.
Os nomes de download identificam área e tamanho; o nome original é preservado.

Não é necessário SQL nem nova Edge Function: usam-se as colunas JSON existentes
e as permissões existentes dos pedidos. Nada é enviado como encomenda só por
abrir a modal: o painel recebe os ficheiros quando o pedido é criado.
Aceites são registos de UX do cliente, não assinatura criptográfica ou validação
server-side de preço. SHA-256 identifica bytes, não certifica autoria.

## Verificação

`node scripts/test-artwork-sizing.mjs` verifica proporção, limites, valores
inválidos, PNG/JPEG, PDF/rotação/múltiplas páginas, resolução, preservação de
bytes/SHA-256 e invalidação de aceite por ficheiro/medidas.
Executar também TypeScript e build. No navegador:

1. Enviar PNG/JPEG com medidas físicas conhecidas e superior ao limite.
2. Conferir original e medida ajustada; antes do aceite não pode confirmar.
3. Alterar largura/altura e verificar que a outra acompanha a proporção e os
   aceites voltam a ser necessários.
4. Sem metadados: indicar largura pretendida e confirmar a medida calculada.
5. Baixa resolução/PDF: aceitar o aviso adicional; testar observações por área.
6. Criar pedido com conta de teste e conferir dados/download no painel; comparar
   SHA-256 do download com o original. Não efetuar pagamento para este teste.

## Limitações anteriores e compatibilidade

Pedidos antigos sem `artwork` continuam a ser apresentados normalmente.
O carrinho visitante ainda usa localStorage e pode exceder a quota com artes
grandes. Agora a falha é mostrada e a modal não fecha nem anuncia sucesso;
não se reduzem bytes para contornar a quota. Migração para armazenamento privado
de anexos é uma etapa separada, com políticas e estratégia de retenção próprias.
O endpoint `guest-order` do repositório desativa checkout visitante; não foi
reativado. A confirmação real de entrega requer um pedido autenticado de teste.

Na revisão de navegador foi testada a modal em desktop e telemóvel: envio,
medida pretendida, redução proporcional, dois aceites, observações, alteração de
medida invalidando aceite e gravação no carrinho visitante. O carrinho apresentou
original, píxeis, medidas pretendidas/finais, limite, qualidade e observações.
Não foi criado pedido real nem efetuado pagamento. O aviso legado de react-helmet
em StrictMode permanece. O build também avisa que pdf-lib já tem import estático
no exportador antigo, pelo que este import dinâmico não cria um chunk separado;
é um aviso de bundle, não falha de compilação.

## Ficheiros desta etapa

- `src/lib/artworkSizing.ts`: metadados, proporção, qualidade, aceite e integridade.
- `src/components/customizer/ArtworkSizingReview.tsx`: revisão e confirmação.
- `src/components/customizer/MultiAreaCustomizer.tsx`: integração por área.
- `src/components/customizer/QuickUploadModal.tsx`: entrada reutilizando o fluxo.
- `src/components/customizer/uploadUtils.ts`: rejeição de imagens não verificáveis.
- `src/components/customizer/CustomizationAreaFiles.tsx`: dados e download do original.
- `src/hooks/useCart.tsx`: gravação assíncrona e mensagem útil em falhas.
- `src/pages/ProductDetail.tsx`: aguardar a gravação antes de fechar a modal.
- `src/pages/Cart.tsx`: apresentação dos anexos e dados por área.
- `src/pages/Checkout.tsx`: dados completos no resumo do checkout.
- `scripts/test-artwork-sizing.mjs`: regressões sem dependência de backend vivo.
- `docs/ARTES_MEDIDAS_QUALIDADE.md`: decisões, limites e roteiro de teste.

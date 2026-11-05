// Brasil (pt-BR): LGPD (Lei nº 13.709/2018), Código de Defesa do Consumidor (Lei nº 8.078/1990),
// Decreto nº 7.962/2013 (comércio eletrônico) e Marco Civil da Internet (Lei nº 12.965/2014).
import { brTaxIdLabel, mailLink, paymentNames, telLink } from './shared';
import type { LegalBlock, LegalContext, LegalDoc, LegalPack } from './types';

/** Data da última atualização destes textos. Mude sempre que o conteúdo mudar. */
export const UPDATED = '2026-10-05';

const CONTACT_PAGE = '[página de contato](/contatos)';

/** "pelo e-mail x@y" ou, sem e-mail cadastrado (a página de contato também não o mostra), o formulário de contato. */
const via = (c: LegalContext) => (c.email ? `pelo e-mail ${mailLink(c.email)}` : `pelo formulário da ${CONTACT_PAGE}`);

const identity = (c: LegalContext) => ({
  kind: 'facts' as const,
  items: [
    { label: 'Loja', value: c.store },
    c.taxId && { label: brTaxIdLabel(c.taxId), value: c.taxId },
    c.email && { label: 'E-mail', value: mailLink(c.email) },
    c.phone && { label: 'Telefone', value: telLink(c.phone) },
  ],
});

const complaintChannels = {
  kind: 'links' as const,
  items: [
    { label: 'consumidor.gov.br', text: 'Plataforma pública e gratuita para registrar reclamações e negociar com a empresa.', href: 'https://www.consumidor.gov.br' },
    { label: 'Procon', text: 'O órgão de defesa do consumidor do seu estado ou município.' },
  ],
};

/** Cookies: ferramentas ligadas no Admin > Privacidade e cookies, ou a frase de que não há nenhuma. */
const cookieTools = (c: LegalContext): LegalBlock[] =>
  c.tools.length
    ? [
        { kind: 'p', text: 'Com o seu consentimento, o site usa estas ferramentas de terceiros:' },
        {
          kind: 'entities',
          items: c.tools.map((t) => ({
            name: t.name,
            place: t.provider,
            text: t.category === 'analytics'
              ? 'Estatística: conta visitas e páginas vistas de forma agregada. Só é carregada se você aceitar Estatística.'
              : 'Marketing: mede o resultado de anúncios e permite mostrar campanhas relevantes. Só é carregada se você aceitar Marketing.',
          })),
        },
        { kind: 'p', text: 'Estas empresas podem tratar dados fora do Brasil (transferência internacional, art. 33 da LGPD), com as garantias contratuais que oferecem. Se você retirar o consentimento, os cookies delas são apagados.' },
      ]
    : [{ kind: 'p', text: 'Hoje o site não usa ferramentas de estatística nem de marketing. Se passar a usar, elas só serão ativadas com o seu consentimento e descritas nesta seção.' }];

const consentRecord = (c: LegalContext): LegalBlock => ({
  kind: 'p',
  text: `A sua escolha vale por ${c.consentMonths} meses; depois perguntamos de novo. Para podermos demonstrar o consentimento, guardamos um registro da escolha (código, categorias, data e versão do aviso), sem o seu IP. O código aparece nas preferências de cookies.`,
});

function privacy(c: LegalContext): LegalDoc {
  const pays = paymentNames(c.country);
  return {
    intro: [
      `Esta política explica como a **${c.store}** trata os seus dados pessoais quando você navega no site, cria uma conta, faz um pedido ou fala com a gente, de acordo com a Lei Geral de Proteção de Dados Pessoais (LGPD, Lei nº 13.709/2018).`,
      'Em resumo: usamos os seus dados para vender, produzir e entregar as suas peças, cumprir a lei e manter o site seguro. Não vendemos dados pessoais.',
    ],
    sections: [
      {
        id: 'controlador',
        title: 'Quem é o controlador dos dados',
        blocks: [
          { kind: 'p', text: 'O controlador é quem toma as decisões sobre o tratamento dos seus dados pessoais. Neste site, o controlador é:' },
          identity(c),
          !c.email && { kind: 'p', text: `Para falar com a gente, use o formulário da ${CONTACT_PAGE}.` },
        ],
      },
      {
        id: 'dados',
        title: 'Quais dados tratamos',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Cadastro e conta:** nome, e-mail, telefone, CPF ou CNPJ, senha (guardada de forma criptografada pelo serviço de autenticação) e preferências de comunicação.',
              '**Pedidos e entrega:** endereço de entrega e de cobrança (CEP, rua, número, complemento, bairro, cidade e estado), produtos, valores, histórico e status do pedido. Se você comprar sem conta, tratamos os mesmos dados do pedido.',
              '**Peças personalizadas:** textos, nomes, medidas, cores, imagens e arquivos que você envia para personalizar uma peça.',
              '**Pagamento:** meio de pagamento escolhido, status e identificadores da transação e, quando o meio exigir, o comprovante que você enviar. Os dados completos do cartão são digitados no ambiente do provedor de pagamento e não passam pelo nosso site.',
              '**Atendimento:** mensagens que você envia pelo formulário de contato, por e-mail ou por outros canais de atendimento.',
              '**Avaliações:** nota e comentário que você publicar sobre um produto.',
              '**Newsletter:** o seu e-mail, se você se inscrever.',
              '**Dados técnicos e de segurança:** endereço IP, data e hora de acesso, navegador, tentativas de login e as informações de cookies descritas na seção Cookies.',
            ],
          },
          { kind: 'p', text: 'Os arquivos analisados no Orçamento 3D são lidos apenas no seu navegador e não são enviados para nós.' },
          { kind: 'p', text: 'Não pedimos dados sensíveis, como origem racial, saúde ou religião. Evite incluí-los nos textos e arquivos de personalização.' },
        ],
      },
      {
        id: 'finalidades',
        title: 'Para que usamos os dados e com qual base legal',
        blocks: [
          { kind: 'p', text: 'Cada uso dos seus dados tem uma base legal prevista no art. 7º da LGPD:' },
          {
            kind: 'list',
            items: [
              '**Criar e gerenciar a sua conta, processar o pedido, produzir as peças, entregar e dar suporte:** execução de contrato e de procedimentos preliminares a pedido seu (art. 7º, V).',
              '**Emitir o documento fiscal e guardar registros fiscais e contábeis:** cumprimento de obrigação legal ou regulatória (art. 7º, II).',
              '**Guardar registros de acesso ao site, como exige o Marco Civil da Internet:** cumprimento de obrigação legal (art. 7º, II).',
              '**Prevenir fraudes e proteger a sua conta e o site:** legítimo interesse (art. 7º, IX).',
              '**Responder a reclamações e defender direitos em processos:** exercício regular de direitos (art. 7º, VI).',
              '**Enviar a newsletter e usar cookies opcionais:** consentimento (art. 7º, I), que você pode revogar quando quiser.',
            ],
          },
          { kind: 'p', text: 'Quando usamos o legítimo interesse, avaliamos se ele não se sobrepõe aos seus direitos, e você pode se opor a esse uso.' },
        ],
      },
      {
        id: 'compartilhamento',
        title: 'Com quem compartilhamos',
        blocks: [
          { kind: 'p', text: 'Não vendemos os seus dados pessoais. Compartilhamos apenas o necessário com empresas que nos ajudam a operar a loja (operadores), sempre para as finalidades desta política:' },
          {
            kind: 'entities',
            items: [
              { name: 'Hospedagem do site', text: 'Servidor contratado pela loja onde ficam o site, o banco de dados, o login e os arquivos, inclusive os de personalização. Usamos o software livre Supabase instalado nesse servidor.' },
              {
                name: pays.length ? pays.join(', ') : 'Provedor de pagamento',
                place: pays.includes('Mercado Pago') ? 'Brasil' : undefined,
                text: 'Processa os pagamentos feitos pelos meios oferecidos no checkout e faz a análise antifraude da transação.',
              },
              { name: 'Correios e transportadoras', text: 'Recebem nome, endereço e telefone para entregar o pedido.' },
              { name: 'ViaCEP', place: 'Brasil', text: 'Consulta o endereço a partir do CEP digitado. Só o CEP é enviado.' },
              { name: 'Serviço de e-mail transacional', text: 'Envia os e-mails de conta e de pedido.' },
              { name: 'WhatsApp (Meta)', text: 'Só se você escolher falar com a gente por lá. Nesse caso, valem também os termos do WhatsApp.' },
            ],
          },
          { kind: 'p', text: 'Também podemos compartilhar dados com autoridades públicas quando a lei exigir ou por ordem judicial.' },
        ],
      },
      {
        id: 'transferencia',
        title: 'Transferência internacional',
        blocks: [
          {
            kind: 'p',
            text: 'O servidor de hospedagem e alguns fornecedores podem guardar ou tratar dados fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD: com cláusulas contratuais que garantem um nível de proteção adequado, incluindo as cláusulas-padrão aprovadas pela ANPD, ou quando ela é necessária para cumprir o contrato com você.',
          },
        ],
      },
      {
        id: 'retencao',
        title: 'Por quanto tempo guardamos',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Conta:** enquanto ela estiver ativa. Você pode excluí-la a qualquer momento.',
              '**Pedidos, documentos fiscais e registros contábeis:** pelo prazo exigido pela legislação tributária e civil, em geral ao menos 5 anos.',
              '**Registros de acesso ao site (IP, data e hora):** 6 meses, como exige o art. 15 do Marco Civil da Internet.',
              '**Arquivos de personalização:** pelo tempo necessário para produzir o pedido e atender eventuais reclamações.',
              '**Newsletter e cookies opcionais:** até você revogar o consentimento.',
              '**Dados necessários para defesa em processos:** até o fim do prazo de prescrição aplicável, como os 5 anos do art. 27 do CDC.',
            ],
          },
          { kind: 'p', text: 'Depois desses prazos, os dados são excluídos ou anonimizados.' },
        ],
      },
      {
        id: 'direitos',
        title: 'Os seus direitos',
        blocks: [
          { kind: 'p', text: 'O art. 18 da LGPD garante a você, a qualquer momento:' },
          {
            kind: 'list',
            items: [
              'confirmação de que tratamos os seus dados e acesso a eles;',
              'correção de dados incompletos, inexatos ou desatualizados;',
              'anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;',
              'portabilidade dos dados a outro fornecedor;',
              'eliminação dos dados tratados com o seu consentimento, salvo as exceções da lei;',
              'informação sobre com quem compartilhamos os seus dados;',
              'informação sobre a possibilidade de não dar consentimento e o que acontece nesse caso;',
              'revogação do consentimento;',
              'oposição a um tratamento feito em desacordo com a lei.',
            ],
          },
          {
            kind: 'p',
            text: 'Na sua conta, em [Privacidade](/dashboard?tab=privacidade), você pode baixar os seus dados e excluir a conta. Ao excluir, perfil, endereços, favoritos, carrinho e avaliações são apagados; os pedidos ficam anonimizados e guardados só pelo prazo exigido pela lei fiscal.',
          },
          { kind: 'p', text: `Para os outros pedidos, fale com a gente ${via(c)}. Respondemos em até 15 dias e podemos pedir uma confirmação de identidade para proteger os seus dados.` },
        ],
      },
      {
        id: 'encarregado',
        title: 'Encarregado e ANPD',
        blocks: [
          {
            kind: 'p',
            text: c.email
              ? `O canal de comunicação com o encarregado pelo tratamento de dados pessoais (art. 41 da LGPD) é o e-mail ${mailLink(c.email)}.`
              : `O canal de comunicação com o encarregado pelo tratamento de dados pessoais (art. 41 da LGPD) é o formulário da ${CONTACT_PAGE}.`,
          },
          { kind: 'p', text: 'Se você não ficar satisfeito com a nossa resposta, pode apresentar uma petição à Autoridade Nacional de Proteção de Dados (ANPD).' },
          { kind: 'links', items: [{ label: 'ANPD', text: 'Autoridade Nacional de Proteção de Dados', href: 'https://www.gov.br/anpd' }] },
        ],
      },
      {
        id: 'seguranca',
        title: 'Segurança',
        blocks: [
          {
            kind: 'p',
            text: 'Usamos conexão criptografada (HTTPS), controle de acesso por perfil, senhas guardadas com criptografia e limite de tentativas de login. Nenhum sistema é totalmente imune a falhas: se houver um incidente de segurança que possa causar risco ou dano relevante, avisaremos você e a ANPD, como prevê o art. 48 da LGPD.',
          },
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [
          { kind: 'p', text: 'Cookies e tecnologias parecidas, como o armazenamento local do navegador, guardam pequenas informações no seu aparelho. Eles se dividem em quatro categorias:' },
          {
            kind: 'list',
            items: [
              '**Necessários:** sessão, login, carrinho, país e idioma escolhidos, segurança e a sua escolha de cookies. Ficam sempre ativos, porque sem eles o site não funciona.',
              '**Preferências:** lembram escolhas para personalizar a sua experiência.',
              '**Estatística:** ajudam a entender, de forma agregada, como o site é usado.',
              '**Marketing:** permitem mostrar comunicações e campanhas relevantes.',
            ],
          },
          ...cookieTools(c),
          { kind: 'p', text: 'Os cookies opcionais só são usados com o seu consentimento, e você pode mudar a sua escolha quando quiser:' },
          consentRecord(c),
          { kind: 'cookieSettings' },
          { kind: 'p', text: 'Você também pode apagar os cookies nas configurações do navegador. Nesse caso, perguntaremos de novo a sua escolha.' },
        ],
      },
      {
        id: 'menores',
        title: 'Crianças e adolescentes',
        blocks: [
          {
            kind: 'p',
            text: 'O site não é dirigido a crianças. As compras devem ser feitas por maiores de 18 anos ou com a assistência dos pais ou responsáveis. Se você acredita que temos dados de uma criança sem o consentimento dos responsáveis, fale com a gente para que possamos excluí-los.',
          },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alterações desta política',
        blocks: [
          { kind: 'p', text: 'Podemos atualizar esta política para refletir mudanças na loja ou na lei. A data da última atualização aparece no topo da página, e mudanças relevantes serão avisadas no site ou por e-mail.' },
        ],
      },
    ],
  };
}

function terms(c: LegalContext): LegalDoc {
  return {
    intro: [
      `Estes termos regem as compras feitas no site da **${c.store}** e seguem o Código de Defesa do Consumidor (CDC, Lei nº 8.078/1990) e o Decreto nº 7.962/2013, que trata do comércio eletrônico.`,
      'Ao finalizar um pedido, você declara que leu e aceita estes termos e a [Política de privacidade](/politica-privacidade).',
    ],
    sections: [
      {
        id: 'identificacao',
        title: 'Quem somos',
        blocks: [
          identity(c),
          { kind: 'p', text: `Atendimento: ${via(c)}. Respondemos às suas solicitações em até 5 dias.` },
        ],
      },
      {
        id: 'produtos',
        title: 'Produtos e impressão 3D',
        blocks: [
          { kind: 'p', text: 'As peças são produzidas sob encomenda em impressão 3D. Por isso, algumas características são próprias do processo e não são defeito: linhas finas de camada, pequenas diferenças de tom entre lotes de material e pequenas variações de medida dentro da tolerância do processo.' },
          { kind: 'p', text: 'As fotos e as prévias 3D buscam representar a peça com fidelidade. Medidas, material, cores disponíveis e prazo de produção aparecem na página de cada produto.' },
          { kind: 'p', text: 'Salvo indicação diferente na página do produto, as peças não são brinquedos e não são indicadas para crianças pequenas, contato com alimentos ou exposição a calor intenso.' },
        ],
      },
      {
        id: 'pedido',
        title: 'Como o pedido é feito',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'Você escolhe os produtos e informa os dados de entrega e o CPF ou CNPJ para o documento fiscal.',
              'Antes de pagar, você vê o resumo com produtos, frete, descontos e o total.',
              'Ao confirmar, você recebe a confirmação do pedido por e-mail e o pedido fica disponível na sua conta.',
              'A produção começa depois da confirmação do pagamento.',
            ],
          },
          { kind: 'p', text: 'Em caso de erro evidente de preço ou de cadastro, suspeita de fraude ou impossibilidade de produzir a peça, podemos cancelar o pedido. Nesse caso, avisamos você e devolvemos todo o valor pago.' },
        ],
      },
      {
        id: 'precos',
        title: 'Preços e pagamento',
        blocks: [
          {
            kind: 'list',
            items: [
              'Os preços estão em reais e já incluem os tributos.',
              'O frete é calculado pelo CEP e aparece antes da finalização do pedido.',
              'Os meios de pagamento disponíveis aparecem no checkout. O pagamento pode passar por análise antifraude do provedor de pagamento.',
              'Cupons de desconto seguem as regras de cada campanha e são validados na finalização.',
              'O documento fiscal da compra é emitido conforme a legislação aplicável.',
            ],
          },
        ],
      },
      {
        id: 'entrega',
        title: 'Prazos e entrega',
        blocks: [
          {
            kind: 'list',
            items: [
              'O prazo total é a soma do prazo de produção, informado no produto, com o prazo da transportadora, informado no checkout. Os prazos contam em dias úteis a partir da confirmação do pagamento.',
              'Entregamos no endereço informado por você. Confira os dados antes de finalizar: se houver erro no endereço, um novo envio pode ter custo.',
              'Você acompanha o pedido na sua conta e na página [Rastrear pedido](/rastrear).',
              'Se o pedido atrasar por nossa responsabilidade, você pode escolher entre aguardar, receber outro produto equivalente ou cancelar a compra com a devolução do valor pago (art. 35 do CDC).',
              'Ao receber, confira a embalagem. Se ela estiver danificada, registre a ocorrência com a transportadora e fale com a gente.',
            ],
          },
        ],
      },
      {
        id: 'arrependimento',
        title: 'Direito de arrependimento (7 dias)',
        blocks: [
          { kind: 'p', text: 'Como a compra é feita fora do estabelecimento comercial, você pode desistir dela em até **7 dias corridos** a contar do recebimento do produto, sem precisar dar um motivo (art. 49 do CDC).' },
          { kind: 'p', text: `Para desistir, fale com a gente ${via(c)}. Os valores pagos, incluindo o frete, são devolvidos de imediato e atualizados, pelo mesmo meio de pagamento. No cartão de crédito, pedimos o estorno à administradora do cartão, como prevê o art. 5º do Decreto nº 7.962/2013.` },
          { kind: 'p', text: 'Veja o passo a passo em [Trocas e devoluções](/devolucoes).' },
        ],
      },
      {
        id: 'personalizados',
        title: 'Peças personalizadas',
        blocks: [
          { kind: 'p', text: 'Peças personalizadas são feitas só para você, a partir das informações que você envia: textos, nomes, medidas, cores ou arquivos. Por isso:' },
          {
            kind: 'list',
            items: [
              'Antes de confirmar, confira com atenção a prévia, a grafia dos textos, as medidas e as cores. Diferenças causadas por informações enviadas por você não são defeito do produto.',
              'Você pode cancelar sem custo enquanto a produção não começar, pela sua conta ou pelos nossos canais de atendimento.',
              'Você declara ter o direito de usar os textos, imagens, marcas e arquivos que enviar. Podemos recusar conteúdo ilegal, ofensivo ou que viole direitos de terceiros.',
            ],
          },
          { kind: 'note', text: 'Nada nestes termos afasta os seus direitos previstos em lei, inclusive o direito de arrependimento do art. 49 do CDC e a garantia contra defeitos dos arts. 18 e 26. Se quiser desistir de uma peça personalizada dentro do prazo legal, fale com a gente: o seu pedido será tratado conforme a lei.' },
        ],
      },
      {
        id: 'garantia',
        title: 'Produtos com defeito',
        blocks: [
          { kind: 'p', text: 'Se o produto apresentar defeito (vício), você tem **90 dias** para reclamar, porque as peças são produtos duráveis. Para produtos não duráveis, o prazo é de **30 dias** (art. 26 do CDC). O prazo conta da entrega ou, se o defeito estiver oculto, do momento em que ele aparecer.' },
          { kind: 'p', text: 'Temos até 30 dias para resolver o problema. Se ele não for resolvido nesse prazo, você escolhe entre a troca por outro produto em perfeitas condições, a devolução do valor pago com atualização ou o abatimento proporcional do preço (art. 18 do CDC).' },
          { kind: 'p', text: 'Não são defeito o desgaste natural, o uso inadequado (por exemplo, calor intenso, impacto ou contato com produtos químicos) e as características próprias da impressão 3D descritas acima.' },
        ],
      },
      {
        id: 'conta',
        title: 'Sua conta',
        blocks: [
          { kind: 'p', text: 'Você é responsável por informar dados verdadeiros e por manter a sua senha em segurança. Avise a gente se perceber qualquer uso indevido da sua conta.' },
        ],
      },
      {
        id: 'propriedade',
        title: 'Propriedade intelectual',
        blocks: [
          { kind: 'p', text: `Os modelos, fotos, textos e a marca ${c.store} pertencem à loja ou aos seus licenciantes. Comprar uma peça não dá o direito de copiar, reproduzir ou vender os modelos 3D.` },
        ],
      },
      {
        id: 'privacidade',
        title: 'Dados pessoais',
        blocks: [
          { kind: 'p', text: 'O tratamento dos seus dados pessoais está descrito na [Política de privacidade](/politica-privacidade), de acordo com a LGPD.' },
        ],
      },
      {
        id: 'atendimento',
        title: 'Atendimento e solução de conflitos',
        blocks: [
          { kind: 'p', text: `Se tiver qualquer problema, fale primeiro com a gente ${via(c)}. Você também pode procurar:` },
          complaintChannels,
        ],
      },
      {
        id: 'lei',
        title: 'Lei aplicável e foro',
        blocks: [
          { kind: 'p', text: 'Estes termos seguem a lei brasileira. Você pode propor ações no foro do seu domicílio, como garante o art. 101 do CDC.' },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alterações destes termos',
        blocks: [
          { kind: 'p', text: 'Podemos atualizar estes termos. Para cada pedido vale a versão publicada na data em que ele foi feito.' },
        ],
      },
    ],
  };
}

function returns(c: LegalContext): LegalDoc {
  return {
    intro: [
      'Aqui você encontra como desistir de uma compra, trocar um produto com defeito e receber o seu dinheiro de volta, de acordo com o Código de Defesa do Consumidor (CDC).',
    ],
    sections: [
      {
        id: 'arrependimento',
        title: 'Desistência em 7 dias',
        blocks: [
          { kind: 'p', text: 'Você pode desistir da compra em até **7 dias corridos** depois de receber o produto, sem precisar explicar o motivo (art. 49 do CDC). Isso vale para os pedidos feitos pelo site.' },
          { kind: 'p', text: 'Para peças personalizadas, veja também a seção [Peças personalizadas](#personalizadas).' },
        ],
      },
      {
        id: 'como',
        title: 'Como pedir',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              `Fale com a gente ${via(c)} com o número do pedido e diga se quer desistir da compra ou se o produto tem defeito. Se puder, envie fotos.`,
              'Respondemos em até 5 dias com as instruções de envio.',
              'Embale o produto com cuidado, de preferência na embalagem original.',
              'Na desistência, devolvemos o valor assim que ela é confirmada. Em caso de defeito, resolvemos depois de receber e avaliar o produto.',
            ],
          },
          {
            kind: 'template',
            title: 'Modelo de pedido de desistência',
            text: [
              `Para: ${c.store}${c.email ? ` (${c.email})` : ''}`,
              '',
              'Quero desistir da compra abaixo, conforme o art. 49 do Código de Defesa do Consumidor.',
              '',
              'Número do pedido:',
              'Data do recebimento:',
              'Produtos:',
              'Nome completo:',
              'E-mail da compra:',
              '',
              'Data:',
            ].join('\n'),
          },
        ],
      },
      {
        id: 'frete',
        title: 'Quem paga o frete',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Desistência em 7 dias:** o frete de devolução é por nossa conta, e você recebe de volta todo o valor pago, inclusive o frete da entrega.',
              '**Produto com defeito ou diferente do pedido:** todos os custos de envio são por nossa conta.',
            ],
          },
        ],
      },
      {
        id: 'reembolso',
        title: 'Devolução do dinheiro',
        blocks: [
          {
            kind: 'list',
            items: [
              'A devolução é feita de imediato, com o valor atualizado, assim que a desistência é confirmada (art. 49, parágrafo único, do CDC).',
              'Usamos o mesmo meio de pagamento da compra, salvo se você preferir outro.',
              '**Cartão de crédito:** pedimos o estorno à administradora do cartão. O crédito aparece na fatura conforme as regras do emissor.',
              '**Pix ou boleto:** devolvemos para uma conta em nome de quem fez o pagamento.',
            ],
          },
        ],
      },
      {
        id: 'defeito',
        title: 'Produto com defeito ou diferente do pedido',
        blocks: [
          { kind: 'p', text: 'Se o produto chegar com defeito, quebrado ou diferente do que você comprou, fale com a gente com fotos do problema e da embalagem. Os prazos para reclamar são (art. 26 do CDC):' },
          {
            kind: 'list',
            items: [
              '**90 dias** para produtos duráveis, como as peças impressas em 3D;',
              '**30 dias** para produtos não duráveis.',
            ],
          },
          { kind: 'p', text: 'O prazo conta da entrega ou, se o defeito estiver oculto, do momento em que ele aparecer. Temos até 30 dias para resolver; se não for resolvido, você escolhe entre a troca, a devolução do valor pago com atualização ou o abatimento proporcional do preço (art. 18 do CDC).' },
        ],
      },
      {
        id: 'personalizadas',
        title: 'Peças personalizadas',
        blocks: [
          { kind: 'p', text: 'Peças feitas sob medida têm todas as garantias contra defeito descritas acima. Antes de a produção começar, você pode cancelar o pedido sem custo.' },
          { kind: 'p', text: 'Como cada peça é única, confira a prévia, os textos e as medidas antes de confirmar: diferenças causadas por informações enviadas por você não são defeito.' },
          { kind: 'note', text: 'O direito de arrependimento previsto em lei não é afastado. Se quiser desistir de uma peça personalizada, fale com a gente: o seu pedido será tratado conforme o CDC.' },
        ],
      },
      {
        id: 'excecoes',
        title: 'Quando não há defeito',
        blocks: [
          {
            kind: 'list',
            items: [
              'Desgaste natural ou uso inadequado, como calor intenso, impacto ou contato com produtos químicos.',
              'Características próprias da impressão 3D descritas nos [Termos e condições](/termos#produtos), como linhas de camada e pequenas variações de tom.',
            ],
          },
          { kind: 'p', text: 'Nesses casos, o direito de desistência em 7 dias continua valendo normalmente.' },
        ],
      },
      {
        id: 'ajuda',
        title: 'Ainda precisa de ajuda?',
        blocks: [
          { kind: 'p', text: 'Se não conseguirmos resolver juntos, você pode registrar uma reclamação em:' },
          complaintChannels,
        ],
      },
    ],
  };
}

export const BR_PACK: LegalPack = { lang: 'pt-BR', updated: UPDATED, docs: { privacy, terms, returns } };

// Portugal (pt-PT): RGPD e Lei n.º 58/2019, Lei n.º 41/2004 (cookies), Decreto-Lei n.º 7/2004 (comércio eletrónico),
// Decreto-Lei n.º 24/2014 (contratos à distância), Decreto-Lei n.º 84/2021 (garantia dos bens), Lei n.º 144/2015 (RAL).
// A plataforma europeia de resolução de litígios em linha foi descontinuada a 20/07/2025 e não é indicada.
import { invoiceName, mailLink, paymentNames, shippingName, telLink } from './shared';
import type { LegalBlock, LegalContext, LegalDoc, LegalPack } from './types';

/** Data da última atualização destes textos. Mude sempre que o conteúdo mudar. */
export const UPDATED = '2026-10-05';

const CONTACT_PAGE = '[página de contactos](/contatos)';

/** "através do e-mail x@y" ou, sem e-mail registado (a página de contactos também não o mostra), o formulário de contacto. */
const via = (c: LegalContext) => (c.email ? `através do e-mail ${mailLink(c.email)}` : `através do formulário da ${CONTACT_PAGE}`);

const identity = (c: LegalContext) => ({
  kind: 'facts' as const,
  items: [
    { label: 'Loja', value: c.store },
    c.taxId && { label: 'NIF', value: c.taxId },
    c.email && { label: 'E-mail', value: mailLink(c.email) },
    c.phone && { label: 'Telefone', value: telLink(c.phone) },
  ],
});

const disputes = {
  kind: 'links' as const,
  items: [
    { label: 'Livro de Reclamações Eletrónico', text: 'Pode apresentar uma reclamação online.', href: 'https://www.livroreclamacoes.pt' },
    { label: 'CNIACC', text: 'Centro Nacional de Informação e Arbitragem de Conflitos de Consumo (resolução alternativa de litígios).', href: 'https://www.cniacc.pt' },
    { label: 'Portal do Consumidor', text: 'Lista completa das entidades de resolução alternativa de litígios.', href: 'https://www.consumidor.gov.pt' },
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
              ? 'Estatística: conta visitas e páginas vistas de forma agregada. Só é carregada se aceitar Estatística.'
              : 'Marketing: mede o resultado de anúncios e permite mostrar campanhas relevantes. Só é carregada se aceitar Marketing.',
          })),
        },
        { kind: 'p', text: 'Estas empresas podem tratar dados fora do Espaço Económico Europeu, com base no Quadro de Privacidade de Dados UE-EUA ou em cláusulas contratuais-tipo. Se retirar o consentimento, os cookies delas são apagados.' },
      ]
    : [{ kind: 'p', text: 'Neste momento, o site não usa ferramentas de estatística nem de marketing. Se passar a usar, só serão ativadas com o seu consentimento e descritas nesta secção.' }];

const consentRecord = (c: LegalContext): LegalBlock => ({
  kind: 'p',
  text: `A sua escolha é válida durante ${c.consentMonths} meses; depois voltamos a perguntar. Para podermos demonstrar o consentimento (artigo 7.º, n.º 1, do RGPD), guardamos um registo da escolha (código, categorias, data e versão do aviso), sem o seu IP. O código aparece nas preferências de cookies.`,
});

function privacy(c: LegalContext): LegalDoc {
  const pays = paymentNames(c.country);
  const carrier = shippingName(c.country);
  const invoicer = invoiceName(c.country);
  return {
    intro: [
      `Esta política explica como a **${c.store}** trata os seus dados pessoais quando visita o site, cria uma conta, faz uma encomenda ou nos contacta, nos termos do Regulamento Geral sobre a Proteção de Dados (RGPD, Regulamento (UE) 2016/679) e da Lei n.º 58/2019.`,
      'Em resumo: usamos os seus dados para vender, produzir e entregar as suas peças, cumprir a lei e manter o site seguro. Não vendemos dados pessoais.',
    ],
    sections: [
      {
        id: 'responsavel',
        title: 'Responsável pelo tratamento',
        blocks: [
          { kind: 'p', text: 'O responsável pelo tratamento dos seus dados pessoais é:' },
          identity(c),
          !c.email && { kind: 'p', text: `Para nos contactar, use o formulário da ${CONTACT_PAGE}.` },
        ],
      },
      {
        id: 'dados',
        title: 'Dados que tratamos',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Registo e conta:** nome, e-mail, telemóvel, NIF, palavra-passe (guardada de forma cifrada pelo serviço de autenticação) e preferências de comunicação.',
              '**Encomendas e entrega:** morada de entrega e de faturação (código postal, rua, número, andar, freguesia, localidade e distrito), produtos, valores, histórico e estado da encomenda. Se comprar sem conta, tratamos os mesmos dados da encomenda.',
              '**Peças personalizadas:** textos, nomes, medidas, cores, imagens e ficheiros que envia para personalizar uma peça.',
              '**Pagamento:** meio de pagamento escolhido, estado e identificadores da transação e, quando o meio o exigir, o comprovativo que enviar. Os dados do cartão são introduzidos no ambiente do prestador de pagamento e não passam pelo nosso site.',
              '**Apoio ao cliente:** mensagens que envia pelo formulário de contacto, por e-mail ou por outros canais.',
              '**Avaliações:** classificação e comentário que publicar sobre um produto.',
              '**Newsletter:** o seu e-mail, se subscrever.',
              '**Dados técnicos e de segurança:** endereço IP, data e hora de acesso, navegador, tentativas de início de sessão e as informações de cookies descritas na secção Cookies.',
            ],
          },
          { kind: 'p', text: 'Os ficheiros analisados no Orçamento 3D são lidos apenas no seu navegador e não nos são enviados.' },
          { kind: 'p', text: 'Não pedimos categorias especiais de dados, como dados de saúde ou convicções religiosas. Evite incluí-los nos textos e ficheiros de personalização.' },
        ],
      },
      {
        id: 'finalidades',
        title: 'Finalidades e fundamentos jurídicos',
        blocks: [
          { kind: 'p', text: 'Cada tratamento tem um fundamento previsto no artigo 6.º, n.º 1, do RGPD:' },
          {
            kind: 'list',
            items: [
              '**Gerir a conta, processar a encomenda, produzir, entregar e prestar apoio:** execução do contrato e diligências pré-contratuais (alínea b)).',
              '**Faturação e conservação de documentos fiscais e contabilísticos:** cumprimento de obrigações jurídicas (alínea c)).',
              '**Prevenir fraude e proteger a conta e o site:** interesses legítimos (alínea f)).',
              '**Responder a reclamações e defender direitos:** interesses legítimos (alínea f)).',
              '**Enviar a newsletter e usar cookies opcionais:** consentimento (alínea a)), que pode retirar a qualquer momento.',
            ],
          },
          { kind: 'p', text: 'Quando nos baseamos em interesses legítimos, pode opor-se ao tratamento por motivos relacionados com a sua situação particular.' },
        ],
      },
      {
        id: 'destinatarios',
        title: 'Destinatários e subcontratantes',
        blocks: [
          { kind: 'p', text: 'Não vendemos os seus dados. Partilhamos apenas o necessário com prestadores que nos ajudam a operar a loja, com contratos de tratamento de dados:' },
          {
            kind: 'entities',
            items: [
              { name: 'Alojamento do site', text: 'Servidor contratado pela loja onde ficam o site, a base de dados, a autenticação e os ficheiros, incluindo os de personalização. Usamos o software livre Supabase instalado nesse servidor.' },
              {
                name: pays.length ? pays.join(', ') : 'Prestador de pagamento',
                place: pays.includes('Viva.com') ? 'Viva Payment Services S.A., União Europeia' : undefined,
                text: 'Processa os pagamentos feitos pelos meios disponíveis no checkout e faz a verificação antifraude da transação.',
              },
              { name: carrier ? `${carrier} e outras transportadoras` : 'Transportadoras', text: 'Recebem nome, morada e telemóvel para entregar a encomenda.' },
              invoicer && { name: invoicer, place: 'Portugal', text: 'Software de faturação certificado: emite as faturas com nome, NIF e morada de faturação.' },
              { name: 'Serviço de e-mail transacional', text: 'Envia os e-mails de conta e de encomenda.' },
              { name: 'WhatsApp (Meta)', text: 'Só se escolher contactar-nos por lá. Nesse caso, aplicam-se também os termos do WhatsApp.' },
            ],
          },
          { kind: 'p', text: 'Podemos ainda comunicar dados a autoridades públicas quando a lei o exigir.' },
        ],
      },
      {
        id: 'transferencias',
        title: 'Transferências para fora do EEE',
        blocks: [
          {
            kind: 'p',
            text: `O servidor de alojamento e alguns prestadores podem tratar dados fora do Espaço Económico Europeu. Nesses casos, a transferência assenta numa decisão de adequação da Comissão Europeia, incluindo o EU-US Data Privacy Framework quando o prestador está certificado, ou nas cláusulas contratuais-tipo aprovadas pela Comissão, nos termos do Capítulo V do RGPD. Pode pedir informação sobre estas garantias ${via(c)}.`,
          },
        ],
      },
      {
        id: 'conservacao',
        title: 'Prazo de conservação',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Conta:** enquanto estiver ativa. Pode eliminá-la a qualquer momento.',
              '**Encomendas e faturas:** 10 anos, por obrigação fiscal e contabilística.',
              '**Ficheiros de personalização:** pelo tempo necessário para produzir a encomenda e tratar eventuais reclamações.',
              '**Newsletter e cookies opcionais:** até retirar o consentimento.',
              '**Registos de segurança:** pelo período estritamente necessário para proteger o site.',
            ],
          },
          { kind: 'p', text: 'Terminados estes prazos, os dados são eliminados ou anonimizados.' },
        ],
      },
      {
        id: 'direitos',
        title: 'Os seus direitos',
        blocks: [
          { kind: 'p', text: 'Nos termos dos artigos 15.º a 22.º do RGPD, tem direito a:' },
          {
            kind: 'list',
            items: [
              'aceder aos seus dados;',
              'retificar dados inexatos ou incompletos;',
              'pedir o apagamento dos dados;',
              'limitar o tratamento;',
              'receber os seus dados num formato estruturado (portabilidade);',
              'opor-se ao tratamento baseado em interesses legítimos;',
              'retirar o consentimento, sem afetar o tratamento já realizado;',
              'não ficar sujeito a decisões tomadas apenas com base em tratamento automatizado.',
            ],
          },
          {
            kind: 'p',
            text: 'Na sua conta, em [Privacidade](/dashboard?tab=privacidade), pode descarregar os seus dados e eliminar a conta. Ao eliminar, perfil, moradas, favoritos, carrinho e avaliações são apagados; as encomendas ficam anonimizadas e guardadas apenas pelo prazo exigido pela lei fiscal.',
          },
          { kind: 'p', text: `Para os restantes pedidos, contacte-nos ${via(c)}. Respondemos no prazo de um mês e podemos pedir uma confirmação de identidade para proteger os seus dados.` },
        ],
      },
      {
        id: 'cnpd',
        title: 'Reclamação à autoridade de controlo',
        blocks: [
          { kind: 'p', text: 'Pode apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD) ou à autoridade de proteção de dados do país onde vive.' },
          { kind: 'links', items: [{ label: 'CNPD', text: 'Comissão Nacional de Proteção de Dados', href: 'https://www.cnpd.pt' }] },
        ],
      },
      {
        id: 'seguranca',
        title: 'Segurança',
        blocks: [
          {
            kind: 'p',
            text: 'Usamos ligação cifrada (HTTPS), controlo de acessos por perfil, palavras-passe cifradas e limite de tentativas de início de sessão. Se ocorrer uma violação de dados com risco para os seus direitos, notificamos a CNPD e, quando necessário, os titulares, nos termos dos artigos 33.º e 34.º do RGPD.',
          },
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [
          { kind: 'p', text: 'Cookies e tecnologias semelhantes, como o armazenamento local do navegador, guardam pequenas informações no seu dispositivo. Dividem-se em quatro categorias:' },
          {
            kind: 'list',
            items: [
              '**Necessários:** sessão, início de sessão, carrinho, país e idioma escolhidos, segurança e a sua escolha de cookies. Estão sempre ativos, porque sem eles o site não funciona.',
              '**Preferências:** memorizam escolhas para personalizar a sua experiência.',
              '**Estatística:** ajudam a perceber, de forma agregada, como o site é utilizado.',
              '**Marketing:** permitem mostrar comunicações e campanhas relevantes.',
            ],
          },
          ...cookieTools(c),
          { kind: 'p', text: 'Nos termos da Lei n.º 41/2004, os cookies não necessários só são usados com o seu consentimento, que pode alterar a qualquer momento:' },
          consentRecord(c),
          { kind: 'cookieSettings' },
          { kind: 'p', text: 'Também pode apagar os cookies nas definições do navegador. Nesse caso, voltamos a pedir a sua escolha.' },
        ],
      },
      {
        id: 'menores',
        title: 'Menores',
        blocks: [
          { kind: 'p', text: 'O site não se dirige a crianças. As compras devem ser feitas por maiores de 18 anos ou com autorização dos pais ou representantes legais.' },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alterações a esta política',
        blocks: [
          { kind: 'p', text: 'Podemos atualizar esta política. A data da última atualização aparece no topo da página, e as alterações relevantes são comunicadas no site ou por e-mail.' },
        ],
      },
    ],
  };
}

function terms(c: LegalContext): LegalDoc {
  return {
    intro: [
      `Estes termos regem as compras feitas no site da **${c.store}**, nos termos do Decreto-Lei n.º 7/2004 (comércio eletrónico), do Decreto-Lei n.º 24/2014 (contratos celebrados à distância), da Lei de Defesa do Consumidor (Lei n.º 24/96) e do Decreto-Lei n.º 84/2021 (garantia dos bens).`,
      'Ao concluir uma encomenda, declara que leu e aceita estes termos e a [Política de privacidade](/politica-privacidade).',
    ],
    sections: [
      {
        id: 'identificacao',
        title: 'Identificação do vendedor',
        blocks: [identity(c), { kind: 'p', text: `Apoio ao cliente: ${via(c)}.` }],
      },
      {
        id: 'produtos',
        title: 'Produtos e impressão 3D',
        blocks: [
          { kind: 'p', text: 'As peças são produzidas por encomenda em impressão 3D. Algumas características são próprias do processo e não constituem defeito: linhas finas de camada, pequenas diferenças de tom entre lotes de material e pequenas variações de medida dentro da tolerância do processo.' },
          { kind: 'p', text: 'As fotografias e as pré-visualizações 3D procuram representar a peça com fidelidade. Medidas, material, cores disponíveis e prazo de produção aparecem na página de cada produto.' },
          { kind: 'p', text: 'Salvo indicação em contrário na página do produto, as peças não são brinquedos e não se destinam a crianças pequenas, ao contacto com alimentos nem à exposição a calor intenso.' },
        ],
      },
      {
        id: 'encomenda',
        title: 'Encomenda e celebração do contrato',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'Escolhe os produtos e indica a morada de entrega e o NIF para a fatura.',
              'Antes de pagar, vê o resumo com produtos, portes, descontos e o total com IVA.',
              'Ao finalizar, a encomenda implica a obrigação de pagamento.',
              'O contrato considera-se celebrado quando recebe a confirmação da encomenda por e-mail, que fica também disponível na sua conta.',
            ],
          },
          { kind: 'p', text: 'O contrato é celebrado em português. Em caso de erro evidente de preço, suspeita de fraude ou impossibilidade de produzir a peça, podemos cancelar a encomenda; nesse caso, avisamos e devolvemos todo o valor pago.' },
        ],
      },
      {
        id: 'precos',
        title: 'Preços, IVA e pagamento',
        blocks: [
          {
            kind: 'list',
            items: [
              'Os preços são apresentados em euros e incluem IVA à taxa legal em vigor.',
              'Os portes são calculados pela morada de entrega e aparecem antes de finalizar a encomenda.',
              'Os meios de pagamento disponíveis aparecem no checkout. O pagamento pode ser verificado pelo prestador de pagamento.',
              'Os cupões de desconto seguem as regras de cada campanha e são validados na finalização.',
              'Emitimos fatura com o NIF indicado na encomenda.',
            ],
          },
        ],
      },
      {
        id: 'entrega',
        title: 'Entrega',
        blocks: [
          {
            kind: 'list',
            items: [
              'O prazo total é a soma do prazo de produção, indicado no produto, com o prazo da transportadora, indicado no checkout, em dias úteis a contar da confirmação do pagamento.',
              'Salvo acordo em contrário, a entrega é feita no prazo máximo de 30 dias a contar da celebração do contrato, nos termos da Lei de Defesa do Consumidor.',
              'O risco de perda ou dano passa para si quando o bem lhe é entregue, a si ou a quem indicar.',
              'Pode acompanhar a encomenda na sua conta e na página [Seguir encomenda](/rastrear).',
            ],
          },
        ],
      },
      {
        id: 'livre-resolucao',
        title: 'Direito de livre resolução (14 dias)',
        blocks: [
          { kind: 'p', text: 'Pode resolver o contrato no prazo de **14 dias** a contar do dia em que recebe o bem, sem indicar o motivo (artigo 10.º do Decreto-Lei n.º 24/2014).' },
          { kind: 'p', text: `Para isso, envie-nos uma declaração clara ${via(c)}, podendo usar o modelo de formulário disponível em [Devoluções e reembolsos](/devolucoes). Reembolsamos todos os pagamentos recebidos, incluindo os portes de envio da modalidade padrão, no prazo de 14 dias a contar da sua comunicação. Podemos reter o reembolso até recebermos o bem ou a prova do seu envio.` },
          { kind: 'p', text: 'Os custos diretos da devolução ficam a seu cargo, salvo em caso de defeito ou erro nosso. É responsável pela depreciação do bem que resulte de uma manipulação além da necessária para verificar a sua natureza e funcionamento.' },
        ],
      },
      {
        id: 'personalizados',
        title: 'Peças personalizadas',
        blocks: [
          { kind: 'p', text: 'O direito de livre resolução não se aplica a bens confecionados de acordo com as especificações do consumidor ou manifestamente personalizados (artigo 17.º, n.º 1, alínea c), do Decreto-Lei n.º 24/2014), como peças com nomes, textos, medidas, cores ou ficheiros enviados por si.' },
          {
            kind: 'list',
            items: [
              'Antes de confirmar, verifique a pré-visualização, a grafia dos textos, as medidas e as cores. Diferenças causadas por informações enviadas por si não constituem defeito.',
              'Pode cancelar sem custos enquanto a produção não tiver começado, na sua conta ou através do apoio ao cliente.',
              'Declara ter o direito de usar os textos, imagens, marcas e ficheiros que envia. Podemos recusar conteúdo ilegal, ofensivo ou que viole direitos de terceiros.',
            ],
          },
          { kind: 'note', text: 'As peças personalizadas mantêm a garantia legal de conformidade descrita abaixo.' },
        ],
      },
      {
        id: 'garantia',
        title: 'Garantia legal de conformidade',
        blocks: [
          { kind: 'p', text: 'Nos termos do Decreto-Lei n.º 84/2021, beneficia de uma garantia legal de conformidade de **3 anos** a contar da entrega. A falta de conformidade que se manifeste nos primeiros 2 anos presume-se existente à data da entrega.' },
          { kind: 'p', text: 'Em caso de falta de conformidade, tem direito à reparação ou substituição do bem e, nos casos previstos na lei, à redução do preço ou à resolução do contrato. Se a falta de conformidade se manifestar nos primeiros 30 dias após a entrega, pode pedir a substituição imediata ou a resolução do contrato.' },
          { kind: 'p', text: `Comunique-nos o problema ${via(c)}, com fotografias e uma breve descrição. Não constituem falta de conformidade o desgaste normal, a utilização inadequada e as características próprias da impressão 3D descritas acima.` },
        ],
      },
      {
        id: 'conta',
        title: 'A sua conta',
        blocks: [
          { kind: 'p', text: 'É responsável por indicar dados verdadeiros e por manter a palavra-passe em segurança. Avise-nos se detetar qualquer utilização indevida da sua conta.' },
        ],
      },
      {
        id: 'propriedade',
        title: 'Propriedade intelectual',
        blocks: [
          { kind: 'p', text: `Os modelos, fotografias, textos e a marca ${c.store} pertencem à loja ou aos seus licenciantes. A compra de uma peça não dá o direito de copiar, reproduzir ou vender os modelos 3D.` },
        ],
      },
      {
        id: 'dados',
        title: 'Dados pessoais',
        blocks: [
          { kind: 'p', text: 'O tratamento dos seus dados pessoais está descrito na [Política de privacidade](/politica-privacidade), nos termos do RGPD.' },
        ],
      },
      {
        id: 'litigios',
        title: 'Reclamações e resolução de litígios',
        blocks: [
          { kind: 'p', text: `Se tiver algum problema, contacte-nos primeiro ${via(c)}. Pode também apresentar reclamação no Livro de Reclamações Eletrónico e, em caso de litígio de consumo, recorrer à entidade de resolução alternativa de litígios competente, nos termos da Lei n.º 144/2015:` },
          disputes,
        ],
      },
      {
        id: 'lei',
        title: 'Lei aplicável',
        blocks: [
          { kind: 'p', text: 'Estes termos regem-se pela lei portuguesa, sem prejuízo das normas imperativas de proteção do consumidor do país onde reside. Os litígios são resolvidos pelos tribunais competentes nos termos da lei.' },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alterações aos termos',
        blocks: [
          { kind: 'p', text: 'Podemos atualizar estes termos. Cada encomenda rege-se pela versão em vigor na data em que foi feita.' },
        ],
      },
    ],
  };
}

function returns(c: LegalContext): LegalDoc {
  return {
    intro: [
      'Como exercer o direito de livre resolução, devolver um produto e receber o reembolso, nos termos do Decreto-Lei n.º 24/2014 e do Decreto-Lei n.º 84/2021.',
    ],
    sections: [
      {
        id: 'prazo',
        title: 'Prazo de 14 dias',
        blocks: [
          { kind: 'p', text: 'Tem **14 dias** a contar do dia em que recebe o bem para resolver o contrato, sem indicar o motivo. Basta que a sua comunicação seja enviada dentro do prazo.' },
        ],
      },
      {
        id: 'excecoes',
        title: 'Exceções',
        blocks: [
          { kind: 'p', text: 'O direito de livre resolução não se aplica a peças confecionadas de acordo com as suas especificações ou manifestamente personalizadas, como peças com nomes, textos, medidas, cores ou ficheiros enviados por si (artigo 17.º, n.º 1, alínea c), do Decreto-Lei n.º 24/2014).' },
          { kind: 'note', text: 'Estas peças podem ser canceladas sem custos enquanto a produção não tiver começado e mantêm a garantia legal de conformidade.' },
        ],
      },
      {
        id: 'como',
        title: 'Como devolver',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              `Envie-nos a sua decisão ${via(c)}, com o número da encomenda. Pode usar o modelo abaixo.`,
              'Respondemos com as instruções e a morada de devolução.',
              'Envie o bem, bem embalado, no prazo de 14 dias a contar da sua comunicação.',
              'Recebido o bem ou a prova do envio, fazemos o reembolso.',
            ],
          },
        ],
      },
      {
        id: 'custos',
        title: 'Custos de devolução',
        blocks: [
          { kind: 'p', text: 'Os custos diretos da devolução ficam a seu cargo, salvo se o motivo for defeito, falta de conformidade ou erro nosso, casos em que todos os custos são suportados pela loja.' },
        ],
      },
      {
        id: 'reembolso',
        title: 'Reembolso',
        blocks: [
          {
            kind: 'list',
            items: [
              'Reembolsamos no prazo de **14 dias** a contar da sua comunicação, podendo reter o reembolso até recebermos o bem ou a prova do envio.',
              'São reembolsados o valor dos bens e os portes de envio iniciais da modalidade padrão. Custos de uma modalidade de envio mais cara escolhida por si não são reembolsados.',
              'Usamos o mesmo meio de pagamento da compra, salvo acordo expresso em contrário, sem custos para si.',
            ],
          },
        ],
      },
      {
        id: 'conformidade',
        title: 'Produtos com defeito ou não conformes',
        blocks: [
          { kind: 'p', text: `Beneficia da garantia legal de conformidade de **3 anos** (Decreto-Lei n.º 84/2021). Em caso de defeito, contacte-nos ${via(c)} com fotografias e uma descrição. Tem direito à reparação ou substituição e, nos casos previstos na lei, à redução do preço ou à resolução do contrato. Nestes casos, os custos de devolução são suportados pela loja.` },
        ],
      },
      {
        id: 'modelo',
        title: 'Modelo de formulário de livre resolução',
        blocks: [
          { kind: 'p', text: 'Pode copiar, preencher e enviar-nos este modelo:' },
          {
            kind: 'template',
            title: 'Formulário de livre resolução',
            text: [
              `Para: ${c.store}${c.email ? ` (${c.email})` : ''}`,
              '',
              'Por este meio, comunico que resolvo o meu contrato de compra e venda do(s) seguinte(s) bem(ns):',
              '',
              'Número da encomenda:',
              'Encomendado em / recebido em:',
              'Nome do consumidor:',
              'Morada do consumidor:',
              'Assinatura do consumidor (só se o formulário for enviado em papel):',
              'Data:',
            ].join('\n'),
          },
        ],
      },
      {
        id: 'litigios',
        title: 'Reclamações e resolução de litígios',
        blocks: [
          { kind: 'p', text: 'Se não chegarmos a acordo, pode recorrer a:' },
          disputes,
        ],
      },
    ],
  };
}

export const PT_PACK: LegalPack = { lang: 'pt-PT', updated: UPDATED, docs: { privacy, terms, returns } };

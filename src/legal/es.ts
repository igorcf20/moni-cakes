// España (es): RGPD y Ley Orgánica 3/2018 (LOPDGDD), Ley 34/2002 (LSSI, comercio electrónico y cookies)
// y Real Decreto Legislativo 1/2007 (TRLGDCU: desistimiento y garantía legal).
import { mailLink, paymentNames, shippingName, telLink } from './shared';
import type { LegalBlock, LegalContext, LegalDoc, LegalPack } from './types';

/** Fecha de la última actualización de estos textos. Cámbiela siempre que cambie el contenido. */
export const UPDATED = '2026-10-05';

const CONTACT_PAGE = '[página de contacto](/contatos)';

/** "a través del correo x@y" o, sin correo registrado (la página de contacto tampoco lo muestra), el formulario de contacto. */
const via = (c: LegalContext) => (c.email ? `a través del correo electrónico ${mailLink(c.email)}` : `a través del formulario de la ${CONTACT_PAGE}`);

const identity = (c: LegalContext) => ({
  kind: 'facts' as const,
  items: [
    { label: 'Tienda', value: c.store },
    c.taxId && { label: 'NIF', value: c.taxId },
    c.email && { label: 'Correo electrónico', value: mailLink(c.email) },
    c.phone && { label: 'Teléfono', value: telLink(c.phone) },
  ],
});

const disputes = {
  kind: 'links' as const,
  items: [
    { label: 'Hojas de reclamaciones', text: 'Puede solicitarnos una hoja de reclamación o presentarla ante la autoridad de consumo de su comunidad autónoma.' },
    { label: 'Oficinas de información al consumidor', text: 'La OMIC de su municipio o el servicio de consumo de su comunidad autónoma.' },
    { label: 'Sistema Arbitral de Consumo', text: 'Resolución extrajudicial, gratuita y voluntaria de conflictos de consumo.', href: 'https://www.consumo.gob.es' },
  ],
};

/** Cookies: herramientas activadas en Admin > Privacidad y cookies, o la frase de que no hay ninguna. */
const cookieTools = (c: LegalContext): LegalBlock[] =>
  c.tools.length
    ? [
        { kind: 'p', text: 'Con su consentimiento, el sitio utiliza estas herramientas de terceros:' },
        {
          kind: 'entities',
          items: c.tools.map((t) => ({
            name: t.name,
            place: t.provider,
            text: t.category === 'analytics'
              ? 'Estadística: cuenta visitas y páginas vistas de forma agregada. Solo se carga si acepta Estadística.'
              : 'Marketing: mide el resultado de anuncios y permite mostrar campañas relevantes. Solo se carga si acepta Marketing.',
          })),
        },
        { kind: 'p', text: 'Estas empresas pueden tratar datos fuera del Espacio Económico Europeo, con base en el Marco de Privacidad de Datos UE-EE. UU. o en cláusulas contractuales tipo. Si retira el consentimiento, sus cookies se borran.' },
      ]
    : [{ kind: 'p', text: 'Actualmente, el sitio no utiliza herramientas de estadística ni de marketing. Si empieza a utilizarlas, solo se activarán con su consentimiento y se describirán en esta sección.' }];

const consentRecord = (c: LegalContext): LegalBlock => ({
  kind: 'p',
  text: `Su elección es válida durante ${c.consentMonths} meses; después volvemos a preguntar. Para poder demostrar el consentimiento (artículo 7.1 del RGPD), guardamos un registro de la elección (código, categorías, fecha y versión del aviso), sin su IP. El código aparece en las preferencias de cookies.`,
});

function privacy(c: LegalContext): LegalDoc {
  const pays = paymentNames(c.country);
  const carrier = shippingName(c.country);
  return {
    intro: [
      `Esta política explica cómo **${c.store}** trata sus datos personales cuando visita el sitio web, crea una cuenta, realiza un pedido o se pone en contacto con nosotros, conforme al Reglamento General de Protección de Datos (RGPD, Reglamento (UE) 2016/679) y a la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).`,
      'En resumen: usamos sus datos para vender, fabricar y entregar sus piezas, cumplir la ley y mantener el sitio seguro. No vendemos datos personales.',
    ],
    sections: [
      {
        id: 'responsable',
        title: 'Responsable del tratamiento',
        blocks: [
          { kind: 'p', text: 'El responsable del tratamiento de sus datos personales es:' },
          identity(c),
          !c.email && { kind: 'p', text: `Para contactar con nosotros, utilice el formulario de la ${CONTACT_PAGE}.` },
        ],
      },
      {
        id: 'datos',
        title: 'Datos que tratamos',
        blocks: [
          {
            kind: 'list',
            items: [
              `**Registro y cuenta:** nombre, correo electrónico, teléfono, ${c.country.taxIdRequired ? 'NIF' : 'NIF (si lo indica)'}, contraseña (guardada cifrada por el servicio de autenticación) y preferencias de comunicación.`,
              '**Pedidos y entrega:** dirección de entrega y de facturación (código postal, calle, número, piso, localidad y provincia), productos, importes, historial y estado del pedido. Si compra sin cuenta, tratamos los mismos datos del pedido.',
              '**Piezas personalizadas:** textos, nombres, medidas, colores, imágenes y archivos que nos envía para personalizar una pieza.',
              '**Pago:** medio de pago elegido, estado e identificadores de la transacción y, cuando el medio lo exija, el justificante que envíe. Los datos de la tarjeta se introducen en el entorno del proveedor de pago y no pasan por nuestro sitio.',
              '**Atención al cliente:** mensajes que envía por el formulario de contacto, por correo electrónico o por otros canales.',
              '**Valoraciones:** puntuación y comentario que publique sobre un producto.',
              '**Newsletter:** su correo electrónico, si se suscribe.',
              '**Datos técnicos y de seguridad:** dirección IP, fecha y hora de acceso, navegador, intentos de inicio de sesión y la información de cookies descrita en la sección Cookies.',
            ],
          },
          { kind: 'p', text: 'Los archivos analizados en el presupuesto 3D se leen solo en su navegador y no se nos envían.' },
          { kind: 'p', text: 'No pedimos categorías especiales de datos, como datos de salud o creencias religiosas. Evite incluirlos en los textos y archivos de personalización.' },
        ],
      },
      {
        id: 'finalidades',
        title: 'Finalidades y bases jurídicas',
        blocks: [
          { kind: 'p', text: 'Cada tratamiento tiene una base prevista en el artículo 6.1 del RGPD:' },
          {
            kind: 'list',
            items: [
              '**Gestionar la cuenta, tramitar el pedido, fabricar, entregar y prestar asistencia:** ejecución del contrato y medidas precontractuales (letra b).',
              '**Facturación y conservación de documentos fiscales y contables:** cumplimiento de obligaciones legales (letra c).',
              '**Prevenir el fraude y proteger la cuenta y el sitio:** interés legítimo (letra f).',
              '**Atender reclamaciones y defender derechos:** interés legítimo (letra f).',
              '**Enviar la newsletter y usar cookies opcionales:** consentimiento (letra a), que puede retirar en cualquier momento.',
            ],
          },
          { kind: 'p', text: 'Cuando nos basamos en el interés legítimo, puede oponerse al tratamiento por motivos relacionados con su situación particular.' },
        ],
      },
      {
        id: 'destinatarios',
        title: 'Destinatarios y encargados del tratamiento',
        blocks: [
          { kind: 'p', text: 'No vendemos sus datos. Solo compartimos lo necesario con proveedores que nos ayudan a operar la tienda, con contratos de encargo del tratamiento:' },
          {
            kind: 'entities',
            items: [
              { name: 'Alojamiento del sitio', text: 'Servidor contratado por la tienda donde se encuentran el sitio, la base de datos, la autenticación y los archivos, incluidos los de personalización. Usamos el software libre Supabase instalado en ese servidor.' },
              {
                name: pays.length ? pays.join(', ') : 'Proveedor de pago',
                place: pays.includes('Viva.com') ? 'Viva Payment Services S.A., Unión Europea' : undefined,
                text: 'Procesa los pagos realizados con los medios disponibles en el checkout y realiza la verificación antifraude.',
              },
              { name: carrier ? `${carrier} y otras empresas de transporte` : 'Empresas de transporte', text: 'Reciben nombre, dirección y teléfono para entregar el pedido.' },
              { name: 'Servicio de correo transaccional', text: 'Envía los correos de cuenta y de pedido.' },
              { name: 'WhatsApp (Meta)', text: 'Solo si decide escribirnos por esa vía. En ese caso, se aplican también las condiciones de WhatsApp.' },
            ],
          },
          { kind: 'p', text: 'También podemos comunicar datos a las autoridades públicas cuando lo exija la ley.' },
        ],
      },
      {
        id: 'transferencias',
        title: 'Transferencias internacionales',
        blocks: [
          {
            kind: 'p',
            text: `El servidor de alojamiento y algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En esos casos, la transferencia se basa en una decisión de adecuación de la Comisión Europea, incluido el EU-US Data Privacy Framework cuando el proveedor está certificado, o en las cláusulas contractuales tipo aprobadas por la Comisión, conforme al capítulo V del RGPD. Puede solicitar información sobre estas garantías ${via(c)}.`,
          },
        ],
      },
      {
        id: 'conservacion',
        title: 'Plazo de conservación',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Cuenta:** mientras esté activa. Puede eliminarla en cualquier momento.',
              '**Pedidos y facturas:** durante los plazos que exige la normativa mercantil y tributaria (con carácter general, seis años para la documentación contable, artículo 30 del Código de Comercio).',
              '**Archivos de personalización:** el tiempo necesario para fabricar el pedido y atender posibles reclamaciones.',
              '**Newsletter y cookies opcionales:** hasta que retire el consentimiento.',
              '**Registros de seguridad:** el tiempo estrictamente necesario para proteger el sitio.',
            ],
          },
          { kind: 'p', text: 'Transcurridos estos plazos, los datos se suprimen o se anonimizan.' },
        ],
      },
      {
        id: 'derechos',
        title: 'Sus derechos',
        blocks: [
          { kind: 'p', text: 'Conforme a los artículos 15 a 22 del RGPD, puede ejercer los derechos de:' },
          {
            kind: 'list',
            items: [
              'acceso a sus datos;',
              'rectificación de datos inexactos o incompletos;',
              'supresión;',
              'limitación del tratamiento;',
              'portabilidad, recibiendo sus datos en un formato estructurado;',
              'oposición al tratamiento basado en el interés legítimo;',
              'retirada del consentimiento, sin que afecte al tratamiento ya realizado;',
              'no ser objeto de decisiones basadas únicamente en el tratamiento automatizado.',
            ],
          },
          {
            kind: 'p',
            text: 'En su cuenta, en [Privacidad](/dashboard?tab=privacidade), puede descargar sus datos y eliminar la cuenta. Al eliminarla, se borran el perfil, las direcciones, los favoritos, el carrito y las valoraciones; los pedidos se anonimizan y se conservan solo durante el plazo exigido por la normativa fiscal.',
          },
          { kind: 'p', text: `Para el resto de solicitudes, escríbanos ${via(c)}. Respondemos en el plazo de un mes y podemos pedirle que confirme su identidad para proteger sus datos.` },
        ],
      },
      {
        id: 'aepd',
        title: 'Reclamación ante la autoridad de control',
        blocks: [
          { kind: 'p', text: 'Puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) o ante la autoridad de protección de datos del país en el que resida.' },
          { kind: 'links', items: [{ label: 'AEPD', text: 'Agencia Española de Protección de Datos', href: 'https://www.aepd.es' }] },
        ],
      },
      {
        id: 'seguridad',
        title: 'Seguridad',
        blocks: [
          {
            kind: 'p',
            text: 'Usamos conexión cifrada (HTTPS), control de acceso por perfiles, contraseñas cifradas y límite de intentos de inicio de sesión. Si se produce una violación de seguridad con riesgo para sus derechos, la notificaremos a la AEPD y, cuando sea necesario, a las personas afectadas, conforme a los artículos 33 y 34 del RGPD.',
          },
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [
          { kind: 'p', text: 'Las cookies y tecnologías similares, como el almacenamiento local del navegador, guardan pequeñas informaciones en su dispositivo. Se dividen en cuatro categorías:' },
          {
            kind: 'list',
            items: [
              '**Necesarias:** sesión, inicio de sesión, carrito, país e idioma elegidos, seguridad y su elección sobre cookies. Están siempre activas, porque sin ellas el sitio no funciona.',
              '**Preferencias:** recuerdan elecciones para personalizar su experiencia.',
              '**Estadística:** ayudan a entender, de forma agregada, cómo se usa el sitio.',
              '**Marketing:** permiten mostrar comunicaciones y campañas relevantes.',
            ],
          },
          ...cookieTools(c),
          { kind: 'p', text: 'Conforme al artículo 22.2 de la LSSI, las cookies no necesarias solo se usan con su consentimiento, que puede cambiar en cualquier momento:' },
          consentRecord(c),
          { kind: 'cookieSettings' },
          { kind: 'p', text: 'También puede borrar las cookies desde la configuración del navegador. En ese caso, volveremos a pedirle su elección.' },
        ],
      },
      {
        id: 'menores',
        title: 'Menores de edad',
        blocks: [
          { kind: 'p', text: 'El sitio no está dirigido a menores. Las compras deben realizarlas mayores de 18 años o menores con la autorización de sus padres o tutores. Los menores de 14 años no pueden facilitarnos datos sin el consentimiento de sus padres o tutores (artículo 7 de la LOPDGDD).' },
        ],
      },
      {
        id: 'cambios',
        title: 'Cambios en esta política',
        blocks: [
          { kind: 'p', text: 'Podemos actualizar esta política. La fecha de la última actualización aparece al principio de la página, y los cambios relevantes se comunicarán en el sitio o por correo electrónico.' },
        ],
      },
    ],
  };
}

function terms(c: LegalContext): LegalDoc {
  return {
    intro: [
      `Estas condiciones regulan las compras realizadas en el sitio web de **${c.store}**, conforme a la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), y al Real Decreto Legislativo 1/2007, que aprueba el texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (TRLGDCU).`,
      'Al finalizar un pedido, usted declara que ha leído y acepta estas condiciones y la [Política de privacidad](/politica-privacidade).',
    ],
    sections: [
      {
        id: 'identificacion',
        title: 'Identificación del vendedor',
        blocks: [identity(c), { kind: 'p', text: `Atención al cliente: ${via(c)}.` }],
      },
      {
        id: 'productos',
        title: 'Productos e impresión 3D',
        blocks: [
          { kind: 'p', text: 'Las piezas se fabrican bajo pedido mediante impresión 3D. Algunas características son propias del proceso y no constituyen un defecto: líneas finas de capa, pequeñas diferencias de tono entre lotes de material y pequeñas variaciones de medida dentro de la tolerancia del proceso.' },
          { kind: 'p', text: 'Las fotografías y las vistas previas 3D buscan representar la pieza con fidelidad. Las medidas, el material, los colores disponibles y el plazo de fabricación figuran en la página de cada producto.' },
          { kind: 'p', text: 'Salvo que la página del producto indique otra cosa, las piezas no son juguetes y no están pensadas para niños pequeños, para el contacto con alimentos ni para la exposición a calor intenso.' },
        ],
      },
      {
        id: 'pedido',
        title: 'Pedido y celebración del contrato',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              c.country.taxIdRequired
                ? 'Elige los productos e indica la dirección de entrega y el NIF para la factura.'
                : 'Elige los productos e indica la dirección de entrega y, si quiere la factura a su nombre, su NIF.',
              'Antes de pagar, ve el resumen con productos, gastos de envío, descuentos y el total con IVA.',
              'Al finalizar, el pedido implica una obligación de pago.',
              'El contrato se celebra cuando recibe la confirmación del pedido por correo electrónico, que también queda disponible en su cuenta.',
            ],
          },
          { kind: 'p', text: 'El contrato se formaliza en español. En caso de error evidente en el precio, sospecha de fraude o imposibilidad de fabricar la pieza, podemos cancelar el pedido; en ese caso, le avisaremos y le devolveremos todo el importe pagado.' },
        ],
      },
      {
        id: 'precios',
        title: 'Precios, impuestos y pago',
        blocks: [
          {
            kind: 'list',
            items: [
              'Los precios se muestran en euros e incluyen el IVA aplicable.',
              'Los gastos de envío se calculan según la dirección de entrega y se muestran antes de finalizar el pedido.',
              'Los medios de pago disponibles aparecen en el checkout. El pago puede ser verificado por el proveedor de pago.',
              'Los cupones de descuento siguen las condiciones de cada campaña y se validan al finalizar.',
              c.country.taxIdRequired ? 'Emitimos factura con el NIF indicado en el pedido.' : 'Emitimos la factura de la compra; si indica su NIF en el pedido, la factura lo incluye.',
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
              'El plazo total es la suma del plazo de fabricación, indicado en el producto, y el plazo del transportista, indicado en el checkout, en días hábiles desde la confirmación del pago.',
              'Salvo acuerdo distinto, la entrega se realiza en un plazo máximo de 30 días naturales desde la celebración del contrato (artículo 66 bis del TRLGDCU).',
              'El riesgo de pérdida o deterioro se le transmite cuando usted, o la persona que indique, recibe el bien.',
              'Puede seguir el pedido en su cuenta y en la página [Seguir pedido](/rastrear).',
            ],
          },
        ],
      },
      {
        id: 'desistimiento',
        title: 'Derecho de desistimiento (14 días)',
        blocks: [
          { kind: 'p', text: 'Puede desistir del contrato en un plazo de **14 días naturales** desde que recibe el bien, sin necesidad de justificación (artículos 102 y 104 del TRLGDCU).' },
          { kind: 'p', text: `Para ello, envíenos una declaración inequívoca ${via(c)}; puede usar el modelo de formulario disponible en [Devoluciones y reembolsos](/devolucoes). Le reembolsaremos todos los pagos recibidos, incluidos los gastos de envío de la modalidad estándar, en un plazo máximo de 14 días naturales desde su comunicación (artículo 107). Podemos retener el reembolso hasta recibir el bien o la prueba de su devolución.` },
          { kind: 'p', text: 'Los costes directos de la devolución corren a su cargo, salvo en caso de defecto o error nuestro (artículo 108). Usted responde de la disminución de valor del bien que resulte de una manipulación distinta de la necesaria para comprobar su naturaleza y funcionamiento.' },
        ],
      },
      {
        id: 'personalizados',
        title: 'Piezas personalizadas',
        blocks: [
          { kind: 'p', text: 'El derecho de desistimiento no se aplica a los bienes confeccionados conforme a las especificaciones del consumidor o claramente personalizados (artículo 103, letra c, del TRLGDCU), como las piezas con nombres, textos, medidas, colores o archivos enviados por usted.' },
          {
            kind: 'list',
            items: [
              'Antes de confirmar, revise la vista previa, la ortografía de los textos, las medidas y los colores. Las diferencias causadas por la información que usted envía no constituyen un defecto.',
              'Puede cancelar sin coste mientras no haya empezado la fabricación, desde su cuenta o a través de atención al cliente.',
              'Usted declara tener derecho a usar los textos, imágenes, marcas y archivos que envía. Podemos rechazar contenidos ilícitos, ofensivos o que vulneren derechos de terceros.',
            ],
          },
          { kind: 'note', text: 'Las piezas personalizadas mantienen la garantía legal de conformidad descrita a continuación.' },
        ],
      },
      {
        id: 'garantia',
        title: 'Garantía legal de conformidad',
        blocks: [
          { kind: 'p', text: 'Conforme al TRLGDCU, usted dispone de una garantía legal de conformidad de **3 años** desde la entrega (artículo 120). Las faltas de conformidad que se manifiesten en los 2 primeros años se presumen existentes en el momento de la entrega.' },
          { kind: 'p', text: 'En caso de falta de conformidad, tiene derecho a la reparación o sustitución del bien y, en los casos previstos en la ley, a la rebaja del precio o a la resolución del contrato.' },
          { kind: 'p', text: `Comuníquenos el problema ${via(c)}, con fotografías y una breve descripción. No constituyen falta de conformidad el desgaste normal, el uso inadecuado ni las características propias de la impresión 3D descritas arriba.` },
        ],
      },
      {
        id: 'cuenta',
        title: 'Su cuenta',
        blocks: [
          { kind: 'p', text: 'Usted es responsable de facilitar datos veraces y de mantener su contraseña segura. Avísenos si detecta cualquier uso indebido de su cuenta.' },
        ],
      },
      {
        id: 'propiedad',
        title: 'Propiedad intelectual',
        blocks: [
          { kind: 'p', text: `Los modelos, fotografías, textos y la marca ${c.store} pertenecen a la tienda o a sus licenciantes. La compra de una pieza no da derecho a copiar, reproducir ni vender los modelos 3D.` },
        ],
      },
      {
        id: 'datos',
        title: 'Datos personales',
        blocks: [
          { kind: 'p', text: 'El tratamiento de sus datos personales se describe en la [Política de privacidad](/politica-privacidade), conforme al RGPD y a la LOPDGDD.' },
        ],
      },
      {
        id: 'reclamaciones',
        title: 'Reclamaciones y resolución de conflictos',
        blocks: [
          { kind: 'p', text: `Si tiene algún problema, contacte primero con nosotros ${via(c)}. También puede acudir a:` },
          disputes,
        ],
      },
      {
        id: 'ley',
        title: 'Ley aplicable y jurisdicción',
        blocks: [
          { kind: 'p', text: 'Estas condiciones se rigen por la ley española, sin perjuicio de las normas imperativas de protección del consumidor del país en el que resida. Para cualquier conflicto, usted puede acudir a los juzgados de su domicilio.' },
        ],
      },
      {
        id: 'cambios',
        title: 'Cambios en las condiciones',
        blocks: [
          { kind: 'p', text: 'Podemos actualizar estas condiciones. Cada pedido se rige por la versión vigente en la fecha en que se realizó.' },
        ],
      },
    ],
  };
}

function returns(c: LegalContext): LegalDoc {
  return {
    intro: [
      'Cómo ejercer el derecho de desistimiento, devolver un producto y recibir el reembolso, conforme al Real Decreto Legislativo 1/2007 (TRLGDCU).',
    ],
    sections: [
      {
        id: 'plazo',
        title: 'Plazo de 14 días',
        blocks: [
          { kind: 'p', text: 'Dispone de **14 días naturales** desde que recibe el bien para desistir del contrato, sin necesidad de justificación. Basta con que nos envíe su comunicación dentro del plazo.' },
        ],
      },
      {
        id: 'excepciones',
        title: 'Excepciones',
        blocks: [
          { kind: 'p', text: 'El derecho de desistimiento no se aplica a las piezas confeccionadas conforme a sus especificaciones o claramente personalizadas, como las piezas con nombres, textos, medidas, colores o archivos enviados por usted (artículo 103, letra c, del TRLGDCU).' },
          { kind: 'note', text: 'Estas piezas pueden cancelarse sin coste mientras no haya empezado la fabricación y mantienen la garantía legal de conformidad.' },
        ],
      },
      {
        id: 'como',
        title: 'Cómo devolver',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              `Comuníquenos su decisión ${via(c)}, con el número de pedido. Puede usar el modelo de abajo.`,
              'Le responderemos con las instrucciones y la dirección de devolución.',
              'Envíe el bien, bien embalado, en un plazo de 14 días naturales desde su comunicación.',
              'Una vez recibido el bien o la prueba del envío, le hacemos el reembolso.',
            ],
          },
        ],
      },
      {
        id: 'costes',
        title: 'Costes de devolución',
        blocks: [
          { kind: 'p', text: 'Los costes directos de la devolución corren a su cargo, salvo que el motivo sea un defecto, una falta de conformidad o un error nuestro; en esos casos, la tienda asume todos los costes.' },
        ],
      },
      {
        id: 'reembolso',
        title: 'Reembolso',
        blocks: [
          {
            kind: 'list',
            items: [
              'Reembolsamos en un plazo máximo de **14 días naturales** desde su comunicación, y podemos retener el reembolso hasta recibir el bien o la prueba del envío.',
              'Se reembolsan el importe de los bienes y los gastos de envío iniciales de la modalidad estándar. El coste adicional de una modalidad de envío más cara elegida por usted no se reembolsa.',
              'Usamos el mismo medio de pago de la compra, salvo que acuerde expresamente otro, sin coste para usted.',
            ],
          },
        ],
      },
      {
        id: 'conformidad',
        title: 'Productos defectuosos o no conformes',
        blocks: [
          { kind: 'p', text: `Dispone de la garantía legal de conformidad de **3 años**. En caso de defecto, escríbanos ${via(c)} con fotografías y una descripción. Tiene derecho a la reparación o sustitución y, en los casos previstos en la ley, a la rebaja del precio o a la resolución del contrato. En estos casos, la tienda asume los costes de devolución.` },
        ],
      },
      {
        id: 'modelo',
        title: 'Modelo de formulario de desistimiento',
        blocks: [
          { kind: 'p', text: 'Puede copiar, completar y enviarnos este modelo:' },
          {
            kind: 'template',
            title: 'Formulario de desistimiento',
            text: [
              `A la atención de: ${c.store}${c.email ? ` (${c.email})` : ''}`,
              '',
              'Por la presente le comunico que desisto de mi contrato de venta del siguiente bien:',
              '',
              'Número de pedido:',
              'Pedido el / recibido el:',
              'Nombre del consumidor:',
              'Dirección del consumidor:',
              'Firma del consumidor (solo si el formulario se presenta en papel):',
              'Fecha:',
            ].join('\n'),
          },
        ],
      },
      {
        id: 'reclamaciones',
        title: 'Reclamaciones',
        blocks: [
          { kind: 'p', text: 'Si no llegamos a un acuerdo, puede acudir a:' },
          disputes,
        ],
      },
    ],
  };
}

export const ES_PACK: LegalPack = { lang: 'es', updated: UPDATED, docs: { privacy, terms, returns } };

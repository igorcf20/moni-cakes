// Catálogo de transportadoras conhecidas (modelo de loja: Brasil, Portugal, Espanha e envios internacionais).
// Serve para o Admin > Frete e transportadoras sugerir formas de envio e para os links de rastreio.
// Nada aqui define preço: o preço vem da tabela da loja ou da cotação automática (Melhor Envio, Sendcloud).
// Transportadora nova = uma linha aqui. Sem link de rastreio conhecido, tracking fica null (o Admin pode pôr um
// link próprio em cada forma de envio, com {code} no lugar do código).

export type CarrierId = string;
export type ShippingApiProvider = 'melhor_envio' | 'sendcloud';

export type CarrierInfo = {
  id: CarrierId;
  name: string;
  /** Países onde é usada para entregas nacionais ('*' = internacional). */
  countries: string[];
  /** Link de rastreio com {code}. */
  tracking: string | null;
  /** Conta que cota esta transportadora automaticamente. */
  api: ShippingApiProvider | null;
  /** Peso volumétrico usual (cm³ por kg). */
  volumetricDivisor: number | null;
  /** Serviços mais comuns, para sugerir o nome da forma de envio. */
  services: string[];
};

export const CARRIERS: CarrierInfo[] = [
  // Brasil
  { id: 'correios', name: 'Correios', countries: ['BR'], tracking: 'https://rastreamento.correios.com.br/app/index.php?objetos={code}', api: 'melhor_envio', volumetricDivisor: 6000, services: ['PAC', 'SEDEX', 'SEDEX 10', 'Mini Envios'] },
  { id: 'jadlog', name: 'Jadlog', countries: ['BR'], tracking: null, api: 'melhor_envio', volumetricDivisor: 6000, services: ['.Package', '.Com'] },
  { id: 'loggi', name: 'Loggi', countries: ['BR'], tracking: null, api: 'melhor_envio', volumetricDivisor: 6000, services: ['Express', 'Ponto'] },
  { id: 'azul_cargo', name: 'Azul Cargo Express', countries: ['BR'], tracking: null, api: 'melhor_envio', volumetricDivisor: 6000, services: ['Amanhã', 'e-commerce'] },
  { id: 'jt_express', name: 'J&T Express', countries: ['BR'], tracking: null, api: 'melhor_envio', volumetricDivisor: 6000, services: ['Standard'] },
  // Portugal
  { id: 'ctt', name: 'CTT', countries: ['PT'], tracking: 'https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects={code}', api: 'sendcloud', volumetricDivisor: 6000, services: ['Correio Registado', 'Expresso 24h', 'Expresso 48h'] },
  { id: 'dpd', name: 'DPD', countries: ['PT', 'ES'], tracking: 'https://tracking.dpd.de/status/en_US/parcel/{code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['Classic', 'Predict'] },
  { id: 'gls', name: 'GLS', countries: ['PT', 'ES'], tracking: 'https://gls-group.com/GROUP/en/parcel-tracking?match={code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['Business Parcel', 'Express'] },
  { id: 'nacex', name: 'Nacex', countries: ['PT', 'ES'], tracking: null, api: null, volumetricDivisor: 5000, services: ['19:00', 'e-Nacex'] },
  // Espanha
  { id: 'correos', name: 'Correos', countries: ['ES'], tracking: 'https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number={code}', api: 'sendcloud', volumetricDivisor: 6000, services: ['Paq Estándar', 'Paq Premium'] },
  { id: 'correos_express', name: 'Correos Express', countries: ['ES'], tracking: null, api: 'sendcloud', volumetricDivisor: 5000, services: ['ePaq 24'] },
  { id: 'seur', name: 'SEUR', countries: ['ES'], tracking: 'https://www.seur.com/livetracking/?segOnlineIdentificador={code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['24', 'Predict'] },
  { id: 'mrw', name: 'MRW', countries: ['ES', 'PT'], tracking: null, api: 'sendcloud', volumetricDivisor: 5000, services: ['e-Commerce', 'Urgente 19'] },
  { id: 'ctt_express_es', name: 'CTT Express (Espanha)', countries: ['ES'], tracking: null, api: 'sendcloud', volumetricDivisor: 5000, services: ['24h', '48h'] },
  // Internacionais
  { id: 'dhl', name: 'DHL Express', countries: ['*'], tracking: 'https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['Express Worldwide', 'Economy Select'] },
  { id: 'fedex', name: 'FedEx', countries: ['*'], tracking: 'https://www.fedex.com/fedextrack/?trknbr={code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['International Priority', 'International Economy'] },
  { id: 'ups', name: 'UPS', countries: ['*'], tracking: 'https://www.ups.com/track?tracknum={code}', api: 'sendcloud', volumetricDivisor: 5000, services: ['Standard', 'Express Saver'] },
  { id: 'tnt', name: 'TNT Express', countries: ['*'], tracking: 'https://www.tnt.com/express/en_us/site/shipping-tools/tracking.html?searchType=con&cons={code}', api: null, volumetricDivisor: 5000, services: ['Express', 'Economy Express'] },
  // Da própria loja
  { id: 'own', name: 'Entrega própria', countries: ['*'], tracking: null, api: null, volumetricDivisor: null, services: ['Entrega local', 'Motoboy'] },
  { id: 'custom', name: 'Outra transportadora', countries: ['*'], tracking: null, api: null, volumetricDivisor: null, services: [] },
];

export const carrierInfo = (id: string | null | undefined): CarrierInfo | null =>
  CARRIERS.find((c) => c.id === String(id ?? '').toLowerCase()) ?? null;

/** Link de rastreio pelo modelo (do serviço ou da transportadora), ou null. */
export function carrierTrackingUrl(code: string, carrier?: string | null, template?: string | null): string | null {
  const tpl = (template || '').trim() || carrierInfo(carrier)?.tracking || '';
  if (!tpl || !code.trim()) return null;
  return tpl.replace('{code}', encodeURIComponent(code.trim()));
}

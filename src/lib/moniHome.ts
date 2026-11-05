// Dados visuais da página inicial da Moni Cakes (hero e cenas de rolagem).
//
// IMAGENS PROVISÓRIAS: todos os ficheiros de public/images/moni foram recortados (fundo removido) do mockup de
// landing aprovado pelo dono. Servem para montar a composição; antes de publicar a loja devem ser trocados por
// fotografias reais dos bolos da Moni Cakes, cada peça com fundo transparente (PNG/WebP), em pelo menos 2x o
// tamanho mostrado. Basta substituir os ficheiros mantendo os nomes, ou mudar os caminhos abaixo.
//
// Cada cena do hero é uma composição em camadas dentro do "palco" (quadrado centrado). Posições em % do palco:
// x = centro horizontal, bottom = distância da base, w = largura. depth = quanto a camada se mexe no parallax
// (0 = parada, 1 = muito); z = ordem (maior = mais à frente).
import type { MoniHomeKey } from '@/i18n/moniHome';

export const MONI_IMG = {
  floral: '/images/moni/bolo-floral.webp',
  chocolate: '/images/moni/bolo-chocolate.webp',
  slice: '/images/moni/fatia-morango.webp',
  rose1: '/images/moni/rosa-1.webp',
  rose2: '/images/moni/rosa-2.webp',
  strawberry: '/images/moni/morango.webp',
  petals: ['/images/moni/petala-1.webp', '/images/moni/petala-2.webp', '/images/moni/petala-3.webp', '/images/moni/petala-4.webp'],
  miniChocolate: '/images/moni/mini-chocolate.webp',
  miniFloral: '/images/moni/mini-floral.webp',
  miniNuts: '/images/moni/mini-nozes.webp',
  thumbClassic: '/images/moni/thumb-classico.webp',
  thumbFilled: '/images/moni/thumb-recheado.webp',
  thumbCustom: '/images/moni/thumb-personalizado.webp',
} as const;

export type Layer = {
  src: string;
  /** centro horizontal, % do palco */
  x: number;
  /** base da imagem, % do palco a partir de baixo */
  bottom: number;
  /** largura, % do palco */
  w: number;
  z: number;
  depth: number;
  /** a camada principal (escala de entrada e zoom na rolagem) */
  main?: boolean;
  /** imagem espelhada na horizontal */
  flip?: boolean;
  /** some no celular e no tablet (composição mais limpa) */
  desktopOnly?: boolean;
  /** largura e altura reais do ficheiro (evita saltos de layout) */
  size: [number, number];
};

export type HeroCake = {
  id: string;
  name: MoniHomeKey;
  text: MoniHomeKey;
  thumb: string;
  /** link de detalhes; troque por /produto/<id> quando o bolo estiver no Admin */
  href: string;
  layers: Layer[];
};

const S = {
  floral: [618, 622] as [number, number],
  chocolate: [364, 390] as [number, number],
  slice: [323, 387] as [number, number],
  rose1: [169, 151] as [number, number],
  rose2: [191, 157] as [number, number],
  strawberry: [126, 112] as [number, number],
};

export const HERO_CAKES: HeroCake[] = [
  {
    id: 'floral', name: 'cakeFloralName', text: 'cakeFloralText', thumb: MONI_IMG.miniFloral, href: '/produtos',
    layers: [
      { src: MONI_IMG.chocolate, x: 82, bottom: 14, w: 40, z: 1, depth: 0.35, desktopOnly: true, size: S.chocolate },
      { src: MONI_IMG.floral, x: 50, bottom: 4, w: 72, z: 3, depth: 0.6, main: true, size: S.floral },
      { src: MONI_IMG.slice, x: 12, bottom: 2, w: 34, z: 4, depth: 0.9, size: S.slice },
      { src: MONI_IMG.rose1, x: -6, bottom: 0, w: 22, z: 5, depth: 1, desktopOnly: true, size: S.rose1 },
      { src: MONI_IMG.rose2, x: 80, bottom: -2, w: 24, z: 5, depth: 1, size: S.rose2 },
      { src: MONI_IMG.strawberry, x: 30, bottom: -3, w: 13, z: 6, depth: 1.1, size: S.strawberry },
    ],
  },
  {
    id: 'chocolate', name: 'cakeChocolateName', text: 'cakeChocolateText', thumb: MONI_IMG.miniChocolate, href: '/produtos',
    layers: [
      // Foto provisória espelhada: o recorte do mockup tem o lado esquerdo cortado, escondido atrás do bolo floral.
      { src: MONI_IMG.chocolate, x: 48, bottom: 4, w: 62, z: 3, depth: 0.6, main: true, flip: true, size: S.chocolate },
      { src: MONI_IMG.floral, x: 84, bottom: 14, w: 48, z: 4, depth: 0.8, size: S.floral },
      { src: MONI_IMG.slice, x: 12, bottom: 1, w: 32, z: 4, depth: 0.9, size: S.slice },
      { src: MONI_IMG.rose2, x: 92, bottom: -2, w: 20, z: 5, depth: 1, size: S.rose2 },
      { src: MONI_IMG.strawberry, x: 34, bottom: -3, w: 12, z: 6, depth: 1.1, size: S.strawberry },
    ],
  },
  {
    id: 'strawberry', name: 'cakeStrawberryName', text: 'cakeStrawberryText', thumb: MONI_IMG.slice, href: '/produtos',
    layers: [
      { src: MONI_IMG.floral, x: 78, bottom: 14, w: 46, z: 1, depth: 0.35, desktopOnly: true, size: S.floral },
      { src: MONI_IMG.slice, x: 46, bottom: 3, w: 54, z: 3, depth: 0.6, main: true, size: S.slice },
      { src: MONI_IMG.rose1, x: 10, bottom: 0, w: 24, z: 5, depth: 1, size: S.rose1 },
      { src: MONI_IMG.strawberry, x: 76, bottom: -2, w: 14, z: 6, depth: 1.1, size: S.strawberry },
      { src: MONI_IMG.rose2, x: 92, bottom: 0, w: 18, z: 5, depth: 1, desktopOnly: true, size: S.rose2 },
    ],
  },
];

export type Highlight = { title: MoniHomeKey; text: MoniHomeKey; img: string; href: string };

/** Destaques da coluna direita: categorias de exemplo (ligar às categorias reais do Admin quando existirem). */
export const HIGHLIGHTS: Highlight[] = [
  { title: 'hlClassicTitle', text: 'hlClassicText', img: MONI_IMG.thumbClassic, href: '/produtos' },
  { title: 'hlFilledTitle', text: 'hlFilledText', img: MONI_IMG.thumbFilled, href: '/produtos' },
  { title: 'hlCustomTitle', text: 'hlCustomText', img: MONI_IMG.thumbCustom, href: '/contatos' },
];

/** Pétalas soltas do hero: posição em % da área do hero, tamanho em px e atraso do movimento. */
export const PETALS = [
  { src: MONI_IMG.petals[0], left: 31, top: 30, size: 46, rot: -18, delay: 0 },
  { src: MONI_IMG.petals[1], left: 61, top: 33, size: 34, rot: 22, delay: 0.8 },
  { src: MONI_IMG.petals[2], left: 66, top: 22, size: 40, rot: 8, delay: 1.6 },
  { src: MONI_IMG.petals[3], left: 27, top: 47, size: 30, rot: -32, delay: 0.4 },
  { src: MONI_IMG.petals[0], left: 73, top: 58, size: 24, rot: 40, delay: 1.1 },
];

/** Cartões de exemplo enquanto o catálogo real estiver vazio: sem preço nem nome de produto inventado. */
export const SAMPLE_CARDS: { title: MoniHomeKey; text: MoniHomeKey; img: string }[] = [
  { title: 'hlClassicTitle', text: 'hlClassicText', img: MONI_IMG.chocolate },
  { title: 'hlFilledTitle', text: 'hlFilledText', img: MONI_IMG.slice },
  { title: 'hlCustomTitle', text: 'hlCustomText', img: MONI_IMG.floral },
];

/** Telefone do WhatsApp configurado no Admin -> link de pedido; sem número, a página de contato. */
export function orderHref(phone: string | undefined | null, message: string): { href: string; external: boolean } {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) return { href: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`, external: true };
  return { href: '/contatos', external: false };
}

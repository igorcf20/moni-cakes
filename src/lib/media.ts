// Imagens da loja. Topo, banner de materiais, categorias e inspirações: fotos reais de peças impressas, de modelos CC0 da Printables
// (origem em docs/CREDITOS-CATALOGO.md). Outra loja feita a partir deste modelo troca os ficheiros ou esvazia AVAILABLE.
// Ficheiros em public/images/<chave>.webp. Para ativar uma imagem, acrescente a chave em AVAILABLE.
// Enquanto uma chave não estiver aqui, o site mostra a reserva visual do componente (sem imagem quebrada).
export type MediaKey =
  | 'hero'
  | 'cat-decoracao' | 'cat-organizacao' | 'cat-suportes' | 'cat-geek' | 'cat-casa' | 'cat-personalizados'
  | 'moni/thumb-classico' | 'moni/thumb-recheado' | 'moni/thumb-personalizado' | 'moni/fatia-morango'
  | 'mega-novidades' | 'banner-crie' | 'banner-pla' | 'share'
  | 'insp-1' | 'insp-2' | 'insp-3' | 'insp-4' | 'insp-5' | 'insp-6'
  | 'story-1' | 'story-2';

const AVAILABLE: MediaKey[] = [
  // Moni Cakes: fotos provisórias das categorias do cardápio (public/images/moni/).
  'moni/thumb-classico', 'moni/thumb-recheado', 'moni/thumb-personalizado', 'moni/fatia-morango',
  'hero', 'banner-pla', 'cat-decoracao', 'cat-organizacao', 'cat-suportes', 'cat-geek', 'cat-casa', 'cat-personalizados',
  'insp-1', 'insp-2', 'insp-3', 'insp-4', 'insp-5', 'insp-6', 'story-1', 'story-2',
];

export const mediaUrl = (key: MediaKey): string | null => (AVAILABLE.includes(key) ? `/images/${key}.webp` : null);

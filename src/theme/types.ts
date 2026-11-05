// =====================================================================================
// Tipos da marca e do tema da loja.
//
//   StoreBrand = identidade (nome, frase, logos, ícone da aba) + tema (cores e fontes).
//   Os valores-base de cada loja ficam em src/config/store.ts; o Admin (Marca e visual) grava
//   por cima na tabela store_settings, chave "store_brand". O nome da loja vem de store_info.name.
// =====================================================================================
import type { FontId } from './fonts.ts';

/** Cores que o Admin edita (hexadecimal #RRGGBB). Os campos opcionais são calculados quando vazios. */
export type ThemeColors = {
  /** cor da marca: botões, links, selos, itens ativos */
  primary: string;
  /** segunda cor do degradê dos botões e destaques */
  primary2: string;
  /** fundo das páginas */
  background: string;
  /** cartões, menus e janelas */
  surface: string;
  /** faixas e caixas alternadas (fundo secundário) */
  surfaceAlt: string;
  /** títulos e texto; também o fundo do rodapé */
  text: string;
  /** texto secundário (descrições, legendas) */
  textMuted: string;
  /** linhas e bordas */
  border: string;
  // Ajustes finos (opcionais): vazios = calculados a partir das cores acima.
  /** cor da marca em texto pequeno (com contraste mínimo 4,5 sobre o fundo) */
  primaryText?: string;
  /** fundo suave da marca (selos, item ativo do menu) */
  primarySoft?: string;
  /** cor do botão ao passar o rato */
  primaryHover?: string;
  /** fim do degradê (por omissão a cor principal) */
  gradientEnd?: string;
  /** texto intermédio (entre o texto e o secundário) */
  textSoft?: string;
};

export type StoreTheme = {
  /** id do modelo de cores de onde se partiu (src/theme/presets.ts), só informativo */
  preset: string;
  colors: ThemeColors;
  /** fonte do texto corrido */
  fontBody: FontId;
  /** fonte dos títulos */
  fontHeading: FontId;
};

export type BrandLogos = {
  /** símbolo quadrado (cabeçalho, menu do celular); vazio = inicial do nome num quadrado da cor da marca */
  icon: string;
  /** nome desenhado para fundo claro; vazio = nome em texto */
  wordmark: string;
  /** nome desenhado para fundo escuro (rodapé); vazio = nome em texto branco */
  wordmarkLight: string;
  /** logo completo (login do Admin, documentos); vazio = símbolo + nome */
  full: string;
};

export type StoreBrand = {
  /** nome da loja (Admin > Configurações > Empresa ou Marca e visual) */
  name: string;
  /** frase curta da marca (título da aba na página inicial, partilhas) */
  tagline: string;
  /** trecho final do nome pintado com a cor da marca quando o nome sai em texto (ex.: "3D") */
  nameAccent: string;
  logos: BrandLogos;
  /** ícone da aba do navegador (PNG quadrado) */
  favicon: string;
  /** imagem das partilhas em redes sociais (1200 x 630) */
  shareImage: string;
  /** descrição para o Google e partilhas */
  description: string;
  theme: StoreTheme;
};

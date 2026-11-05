// =====================================================================================
// Modelos de cores prontos (Admin > Marca e visual > Modelos).
// Escolher um modelo copia as cores e as fontes dele para o tema; depois tudo pode ser ajustado.
// O primeiro (moniCakes) é o tema da Moni Cakes; os outros servem de ponto de partida (print3d veio da loja-modelo).
// Nomes visíveis no dicionário do Admin (src/i18n/adminBrand.ts, chaves preset_<id> e preset_<id>_hint).
// =====================================================================================
import type { StoreTheme } from './types.ts';

export const PRESETS = {
  /** Moni Cakes (logo e landing aprovada, nov/2026): creme, rosa antigo, coral, pêssego, dourado e marrom café; títulos em Cormorant Garamond. */
  moniCakes: {
    preset: 'moniCakes',
    fontBody: 'inter',
    fontHeading: 'cormorant',
    colors: {
      // Rosa profundo da paleta (#A75269): texto branco nos botões passa no contraste AA.
      primary: '#A75269', primary2: '#E87975', background: '#FFF5E9', surface: '#FFFFFF', surfaceAlt: '#FBE9E0',
      text: '#3B2015', textMuted: '#7D5E52', border: '#F0DDD2',
      primaryText: '#94455B', primarySoft: '#F9E0E4', primaryHover: '#8F4359', gradientEnd: '#B96979', textSoft: '#66351F',
    },
  },
  /** PRINT3D editorial (kit de redesenho, out/2026): creme, terracota, grafite; títulos em serifa e texto em Inter (docs/legado-print3d/GUIA-VISUAL.md). */
  print3d: {
    preset: 'print3d',
    fontBody: 'inter',
    fontHeading: 'cormorant',
    colors: {
      // Terracota do kit (#D84A20) um pouco mais escuro para o texto branco dos botões passar no contraste AA (4,5:1).
      primary: '#D2461E', primary2: '#DD5426', background: '#FBF8F3', surface: '#FFFFFF', surfaceAlt: '#F4EEE6',
      text: '#171715', textMuted: '#6D6A65', border: '#E8E1D8',
      primaryText: '#B83D1B', primarySoft: '#F6E4DA', primaryHover: '#B83D1B', gradientEnd: '#C2401B', textSoft: '#3D3A36',
    },
  },
  /** PRINT3D clássico (até out/2026): creme, laranja, preto e Inter. */
  print3dClassic: {
    preset: 'print3dClassic',
    fontBody: 'inter',
    fontHeading: 'inter',
    colors: {
      primary: '#FF5A0A', primary2: '#FF7A18', background: '#FBF8F3', surface: '#FFFFFF', surfaceAlt: '#F5F1EA',
      text: '#171717', textMuted: '#737373', border: '#EDE9E3',
      // Valores aprovados no guia visual (os cálculos automáticos dariam tons muito próximos).
      primaryText: '#C2410C', primarySoft: '#FFF0E7', primaryHover: '#F04E00', gradientEnd: '#FF4D00', textSoft: '#404040',
    },
  },
  ocean: {
    preset: 'ocean',
    fontBody: 'dm-sans',
    fontHeading: 'dm-sans',
    colors: {
      primary: '#2563EB', primary2: '#3B82F6', background: '#F8FAFC', surface: '#FFFFFF', surfaceAlt: '#EEF2F7',
      text: '#0F172A', textMuted: '#64748B', border: '#E2E8F0',
    },
  },
  forest: {
    preset: 'forest',
    fontBody: 'nunito',
    fontHeading: 'nunito',
    colors: {
      primary: '#15803D', primary2: '#22C55E', background: '#F7F8F3', surface: '#FFFFFF', surfaceAlt: '#EEF1E8',
      text: '#1A2E1F', textMuted: '#5F6B60', border: '#E3E7DC',
    },
  },
  elegant: {
    preset: 'elegant',
    fontBody: 'manrope',
    fontHeading: 'playfair',
    colors: {
      primary: '#1F1F1F', primary2: '#4A4A4A', background: '#FAFAF7', surface: '#FFFFFF', surfaceAlt: '#F1EFEA',
      text: '#111111', textMuted: '#6B6B6B', border: '#E8E5DE', primarySoft: '#F1EFEA',
    },
  },
  rose: {
    preset: 'rose',
    fontBody: 'outfit',
    fontHeading: 'outfit',
    colors: {
      primary: '#DB2777', primary2: '#F472B6', background: '#FFF9FB', surface: '#FFFFFF', surfaceAlt: '#FCEFF4',
      text: '#1F1720', textMuted: '#7A6670', border: '#F3E3EA',
    },
  },
  violet: {
    preset: 'violet',
    fontBody: 'montserrat',
    fontHeading: 'montserrat',
    colors: {
      primary: '#7C3AED', primary2: '#A78BFA', background: '#FAF9FE', surface: '#FFFFFF', surfaceAlt: '#F1EEFB',
      text: '#18142B', textMuted: '#6B6680', border: '#E7E3F5',
    },
  },
} satisfies Record<string, StoreTheme>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** Cópia independente de um modelo (para editar sem mexer no original). */
export const presetTheme = (id: PresetId): StoreTheme => {
  const p = PRESETS[id] as StoreTheme;
  return { ...p, colors: { ...p.colors } };
};

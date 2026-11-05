// =====================================================================================
// CONFIGURAÇÃO-BASE DA LOJA (modelo de loja)
//
// Este é o único ficheiro de código que muda de uma loja para outra. Tudo o resto (nome, logos,
// cores, fontes, textos da marca) o dono altera no painel Admin > Marca e visual, e o que ele
// gravar passa por cima destes valores. Estes valores servem para:
//   1. a primeira visita, antes de a loja ter qualquer coisa gravada no Admin;
//   2. o HTML inicial (título, descrição, cor da barra do navegador), que o vite.config.ts preenche
//      no build a partir daqui, para o Google e as partilhas verem a marca certa;
//   3. o botão "Voltar ao padrão da loja" do Admin.
//
// Loja nova a partir deste modelo: ver docs/NOVA-LOJA.md (troca os ficheiros de public/brand/,
// escolhe um modelo de cores em src/theme/presets.ts ou cria o seu, e edita os valores abaixo).
//
// Importações relativas de propósito: o vite.config.ts lê este ficheiro sem os atalhos "@/".
// =====================================================================================
import { presetTheme } from '../theme/presets.ts';
import type { StoreBrand } from '../theme/types.ts';

export const STORE_DEFAULTS: StoreBrand = {
  name: 'Moni Cakes',
  tagline: 'Café e confeitaria',
  nameAccent: 'Cakes',
  logos: {
    icon: '/brand/icon-160.webp',
    wordmark: '/brand/wordmark.webp',
    wordmarkLight: '/brand/wordmark-light.webp',
    full: '/brand/logo-full.webp',
  },
  favicon: '/favicon.png',
  shareImage: '/og-image.jpg',
  description:
    'Moni Cakes, café e confeitaria: bolos artesanais, recheados e personalizados sob encomenda para transformar cada momento em uma celebração.',
  theme: presetTheme('moniCakes'),
};

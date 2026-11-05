// =====================================================================================
// Páginas da loja editáveis no Admin > Páginas da loja (tabela site_pages, migration 20261006160400_site_pages.sql):
// Sobre, Contato, Termos, Privacidade e Devoluções. Uma versão por idioma; sem versão publicada no idioma do
// visitante (ou noutro do mesmo idioma: pt-BR e pt-PT), o site mostra o texto padrão de sempre.
//   pickSitePage      escolhe a versão para o idioma do visitante
//   legalDocToHtml    texto padrão das páginas legais em HTML (para o Admin começar a editar a partir dele)
// Sem imports com @/ para o teste em node (scripts/test-site-pages.mjs).
// =====================================================================================
import type { LegalBlock, LegalDoc, Maybe } from '../legal/types';

export const SITE_PAGES = ['about', 'contact', 'terms', 'privacy', 'returns'] as const;
export type SitePageKind = (typeof SITE_PAGES)[number];
export const SITE_PAGE_LOCALES = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
export type SitePageLocale = (typeof SITE_PAGE_LOCALES)[number];

/** Endereço público de cada página. */
export const SITE_PAGE_PATHS: Record<SitePageKind, string> = {
  about: '/sobre', contact: '/contatos', terms: '/termos', privacy: '/politica-privacidade', returns: '/devolucoes',
};

export type SitePage = {
  id: string;
  page: SitePageKind;
  locale: SitePageLocale;
  title: string | null;
  intro: string | null;
  body: string | null;
  seo_description: string | null;
  published: boolean;
  updated_at: string;
};

/** Versão publicada para o idioma: o mesmo idioma, senão a outra variante da mesma língua (pt-BR e pt-PT). */
export function pickSitePage<T extends Pick<SitePage, 'locale' | 'published'>>(rows: T[], locale: string): T | null {
  const live = rows.filter((r) => r.published);
  const exact = live.find((r) => r.locale === locale);
  if (exact) return exact;
  const lang = locale.split('-')[0];
  return live.find((r) => r.locale.split('-')[0] === lang) ?? null;
}

/** HTML do editor tem algum texto? (o editor vazio grava "<p></p>") */
export const hasHtmlText = (html: string | null | undefined) => !!html && html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

/* ---------- texto padrão das páginas legais em HTML ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAFE_HREF = /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i;

/** **negrito** e [rótulo](destino) em HTML, com o resto escapado. */
export function richToHtml(text: string): string {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part) => {
    if (!part) return '';
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return `<strong>${esc(part.slice(2, -2))}</strong>`;
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m) return SAFE_HREF.test(m[2]) ? `<a href="${esc(m[2])}">${esc(m[1])}</a>` : esc(m[1]);
    return esc(part);
  }).join('');
}

const present = <T,>(items: Maybe<T>[]): T[] => items.filter(Boolean) as T[];

function blockToHtml(b: LegalBlock): string {
  switch (b.kind) {
    case 'p': return `<p>${richToHtml(b.text)}</p>`;
    case 'note': return `<blockquote><p>${richToHtml(b.text)}</p></blockquote>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${present(b.items).map((i) => `<li><p>${richToHtml(i)}</p></li>`).join('')}</${tag}>`;
    }
    case 'facts': return `<ul>${present(b.items).map((i) => `<li><p><strong>${esc(i.label)}:</strong> ${richToHtml(i.value)}</p></li>`).join('')}</ul>`;
    case 'entities': return `<ul>${present(b.items).map((i) => `<li><p><strong>${esc(i.name)}</strong>${i.place ? ` (${esc(i.place)})` : ''}: ${richToHtml(i.text)}</p></li>`).join('')}</ul>`;
    case 'links': return `<ul>${present(b.items).map((i) => {
      const label = i.href && SAFE_HREF.test(i.href) ? `<a href="${esc(i.href)}">${esc(i.label)}</a>` : esc(i.label);
      return `<li><p>${label}${i.text ? `: ${esc(i.text)}` : ''}</p></li>`;
    }).join('')}</ul>`;
    case 'template': return `<h3>${esc(b.title)}</h3>${b.text.split(/\n+/).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}`;
    case 'cookieSettings': return '';
  }
}

export function legalDocToHtml(doc: LegalDoc): string {
  const intro = present(doc.intro).map((p) => `<p>${richToHtml(p)}</p>`).join('');
  const sections = present(doc.sections).map((s) => `<h2>${esc(s.title)}</h2>${present(s.blocks).map(blockToHtml).join('')}`).join('');
  return intro + sections;
}

/** Parágrafos e títulos simples em HTML (texto padrão da página Sobre). */
export function sectionsToHtml(sections: { title?: string; paragraphs: string[] }[]): string {
  return sections.map((s) => (s.title ? `<h2>${esc(s.title)}</h2>` : '') + s.paragraphs.filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')).join('');
}

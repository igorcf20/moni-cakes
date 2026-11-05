// Normalização de texto para busca e categorias (sem acentos, minúsculas, só letras e números) e filtro de busca do servidor.
import { pgValue } from '@/lib/postgrestFilter';

/** Minúsculas, sem acentos, sem HTML e com tudo o que não é letra ou número trocado por espaço (com espaços nas pontas). */
export const normText = (value: unknown) =>
  ` ${String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Palavras da busca (até 5, com 2 letras ou mais), na forma em que foram escritas. */
export const searchWords = (q: string) => q.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2).slice(0, 5);

/** Texto de busca a usar: o texto sem espaços nas pontas, ou vazio se não tiver nenhuma palavra válida (ex.: só "a"). */
export const searchQuery = (q: string) => {
  const t = q.trim();
  return searchWords(t).length ? t : '';
};

/** Filtro PostgREST: cada palavra tem de aparecer em name, description ou category (valores entre aspas com pgValue). */
export function searchFilter(q: string): string | null {
  const words = searchWords(q);
  if (!words.length) return null;
  const one = (w: string) => {
    const like = pgValue(`%${w}%`);
    return `name.ilike.${like},description.ilike.${like},category.ilike.${like}`;
  };
  return words.length === 1 ? one(words[0]) : `and(${words.map((w) => `or(${one(w)})`).join(',')})`;
}

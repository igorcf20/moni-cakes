// =============================================================================================
// Entradas e conferência de estoque com leitor de código de barras (recurso barcode_stock; Admin > Estoque >
// Entradas e conferência). Regras puras usadas pela tela; o servidor grava (migration 20261008145000_barcode_stock.sql):
//   (a leitura do código é no navegador: findUnitByCode de src/lib/productLabels.ts, sem ida ao servidor)
//   admin_stock_entry(...)          grava a entrada inteira numa transação (stock_entries + um movimento por linha)
//   admin_stock_entries / admin_stock_entry_lines   lista e detalhe para o Admin
// Os movimentos ficam no Histórico de estoque com o motivo e o número da entrada.
// Sem imports. Teste: node --experimental-strip-types scripts/test-barcode-stock.mjs
// =============================================================================================

/** Tipos de entrada (= motivos do histórico que o Admin escolhe). */
export const ENTRY_KINDS = ['receive', 'count', 'damage', 'other'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * Como a quantidade de cada linha conta:
 *   receive  soma (mercadoria que chegou)
 *   count    define (contagem: o estoque passa a ser o que foi contado)
 *   damage   tira (perda, defeito, avaria)
 *   other    soma ou tira (número com sinal)
 */
export const entryMode = (k: EntryKind): 'add' | 'set' | 'remove' | 'signed' =>
  k === 'receive' ? 'add' : k === 'count' ? 'set' : k === 'damage' ? 'remove' : 'signed';

export type EntryLine = {
  key: string;
  productId: string;
  variationId: string | null;
  sizeId: string | null;
  name: string;
  variant: string | null;
  image: string | null;
  code: string | null;
  /** Estoque no momento da leitura. */
  stock: number | null;
  qty: number;
};

export const lineKey = (productId: string, variationId: string | null, sizeId: string | null) =>
  `${productId}|${variationId ?? ''}|${sizeId ?? ''}`;

/**
 * Leitura de um código: a mesma peça soma 1 (ou `step`) na linha que já existe e sobe para o topo;
 * peça nova entra no topo com a quantidade inicial.
 */
export function addScan(lines: EntryLine[], line: Omit<EntryLine, 'key' | 'qty'>, step = 1): EntryLine[] {
  const key = lineKey(line.productId, line.variationId, line.sizeId);
  const found = lines.find((l) => l.key === key);
  if (found) return [{ ...found, qty: found.qty + step }, ...lines.filter((l) => l.key !== key)];
  return [{ ...line, key, qty: step }, ...lines];
}

/** Estoque depois da linha (null = quantidade inválida para o tipo). */
export function lineResult(kind: EntryKind, stock: number | null, qty: number): number | null {
  if (!Number.isInteger(qty)) return null;
  const cur = stock ?? 0;
  const mode = entryMode(kind);
  let next: number;
  if (mode === 'set') { if (qty < 0) return null; next = qty; }
  else if (mode === 'add') { if (qty <= 0) return null; next = cur + qty; }
  else if (mode === 'remove') { if (qty <= 0) return null; next = cur - qty; }
  else { if (qty === 0) return null; next = cur + qty; }
  return next < 0 ? null : next;
}

/** Valor enviado ao servidor por linha: soma (com sinal) ou valor final na contagem. */
export function lineValue(kind: EntryKind, qty: number): number {
  return entryMode(kind) === 'remove' ? -Math.abs(qty) : qty;
}

/** Totais da entrada: linhas, unidades que entram e que saem (pela diferença de cada linha). */
export function entryTotals(kind: EntryKind, lines: EntryLine[]) {
  let unitsIn = 0;
  let unitsOut = 0;
  let invalid = 0;
  let differences = 0;
  for (const l of lines) {
    const next = lineResult(kind, l.stock, l.qty);
    if (next == null) { invalid++; continue; }
    const diff = next - (l.stock ?? 0);
    if (diff > 0) unitsIn += diff;
    if (diff < 0) unitsOut -= diff;
    if (diff !== 0) differences++;
  }
  return { lines: lines.length, unitsIn, unitsOut, invalid, differences };
}

/**
 * Limpa o que o leitor digitou: tira espaços nas pontas e caracteres de controle que alguns leitores mandam
 * (prefixo ]C1, ]E0 do identificador de simbologia AIM, tabulações).
 */
export function cleanScan(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, '').replace(/^\][A-Za-z][0-9]/, '').trim().slice(0, 120);
}

/** Erros estáveis do servidor (admin_stock_entry). */
export function entryErrorCode(message: string | null | undefined):
  'forbidden' | 'not_found' | 'invalid_value' | 'invalid_kind' | 'too_many_lines' | 'no_lines' | 'unknown' {
  const m = String(message ?? '');
  for (const c of ['forbidden', 'not_found', 'invalid_value', 'invalid_kind', 'too_many_lines', 'no_lines'] as const) if (m.includes(c)) return c;
  return 'unknown';
}

export const MAX_ENTRY_LINES = 500;

/** Admin > Etiquetas de código de barras com as peças de uma entrada (?entrada=) ou de um produto (?produto=). */
export const labelsHref = (q: { entry?: string; product?: string }) =>
  `/admin?tab=barcode-labels${q.entry ? `&entrada=${encodeURIComponent(q.entry)}` : ''}${q.product ? `&produto=${encodeURIComponent(q.product)}` : ''}`;

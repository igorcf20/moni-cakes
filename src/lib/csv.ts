// Planilhas CSV geradas no navegador (Admin: pedidos, produtos, clientes).
// Separador ";" e BOM UTF-8: o Excel em português abre com colunas e acentos certos; o Google Sheets também lê.
export type CsvCell = string | number | null | undefined;

const escapeCell = (v: CsvCell, sep: string) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: CsvCell[][], sep = ';'): string {
  return [headers, ...rows].map((r) => r.map((c) => escapeCell(c, sep)).join(sep)).join('\r\n');
}

/** Descarrega a planilha como `<nome>-AAAA-MM-DD.csv`. */
export function downloadCsv(name: string, headers: string[], rows: CsvCell[][]) {
  const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Número para a planilha no formato do idioma (vírgula decimal em pt/es), sem símbolo de moeda. */
export const csvNumber = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(n);

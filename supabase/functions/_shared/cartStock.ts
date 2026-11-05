// Estoque das linhas do carrinho: quanto de cada linha ainda se pode comprar.
// O banco diz de que estoque sai cada linha e quanto há para este comprador (RPC cart_stock_check: estoque menos as
// reservas de outros clientes, mesma procura do trigger que dá baixa no pedido);
// aqui as linhas do mesmo estoque (slot) repartem-no pela ordem do carrinho, como o pedido faz.
// Cópia igual em src/lib/cartStock.ts (o teste scripts/test-cart-stock.mjs confere).

/** Resposta do banco por linha: slot nulo = linha sem controle de estoque. */
export type StockSlot = { slot: string | null; available: number | null };
/** Linha com a reserva no carrinho (recurso cart_reservations): unidades seguras, prazo e se já venceu. */
export type StockLine = StockSlot & { reserved?: number | null; expires_at?: string | null; expired?: boolean };

/** ok = há para tudo; short = há menos do que a quantidade (max > 0); out = esgotado (max = 0). */
export type LineStock = { state: "ok" | "short" | "out"; max: number | null };

export function lineStock(lines: { quantity: number }[], slots: (StockSlot | null | undefined)[]): LineStock[] {
  const left = new Map<string, number>();
  return lines.map((line, i) => {
    const s = slots[i];
    if (!s || !s.slot || s.available == null || !Number.isFinite(Number(s.available))) return { state: "ok", max: null };
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    const have = left.has(s.slot) ? left.get(s.slot)! : Math.max(0, Math.floor(Number(s.available)));
    if (have >= qty) {
      left.set(s.slot, have - qty);
      return { state: "ok", max: have };
    }
    left.set(s.slot, 0);
    return { state: have > 0 ? "short" : "out", max: have };
  });
}

/** Linhas que não podem ser compradas como estão (índice no carrinho e quanto ainda há). */
export function stockProblems(lines: { quantity: number }[], slots: (StockSlot | null | undefined)[]) {
  return lineStock(lines, slots)
    .map((s, index) => ({ index, state: s.state, available: s.max ?? 0 }))
    .filter((s) => s.state !== "ok");
}

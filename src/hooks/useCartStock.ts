// Estoque de agora das linhas do carrinho e reserva (RPC cart_stock_check): o carrinho e o checkout mostram o que
// esgotou ou tem menos unidades depois de entrar no carrinho e não deixam finalizar até o cliente ajustar.
// Com o recurso cart_reservations ligado, a mesma chamada reserva as unidades por um tempo (Admin > Reserva no
// carrinho): quantidade nova renova a reserva; abrir a página de novo não. O servidor (create-order) confere o mesmo.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cartHolderToken } from "@/lib/cartHolder";
import { lineStock, type LineStock, type StockLine } from "@/lib/cartStock";

type Line = { id?: string; product_id?: string; productId?: string; quantity: number; design_data?: unknown };
export type CartReservationInfo = { on: boolean; notice: boolean; minutes: number };
type StockResponse = { reservation: CartReservationInfo; lines: StockLine[] };

export const CART_STOCK_KEY = "cart-stock";
const OFF: CartReservationInfo = { on: false, notice: false, minutes: 0 };

// Carrinho vazio só é enviado com release (CartReservationSync, depois de o carrinho ter tido itens): um carrinho que
// ainda está a carregar chega vazio e não pode soltar a reserva do cliente.
export function useCartStock(items: Line[], enabled = true, release = false) {
  const request = items.map((i) => ({
    product_id: String(i.product_id ?? i.productId ?? ""),
    quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
    design_data: i.design_data ?? null,
  }));
  const key = JSON.stringify(request);
  const query = useQuery({
    queryKey: [CART_STOCK_KEY, key],
    enabled: enabled && (request.length > 0 || release),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async (): Promise<StockResponse | null> => {
      const { data, error } = await (supabase as any).rpc("cart_stock_check", {
        _items: request, _holder_token: cartHolderToken(), _reserve: true,
      });
      // Sem a verificação (ex.: banco ainda sem a função), o servidor continua a barrar no pedido.
      if (error || !data || !Array.isArray(data.lines)) return null;
      return data as StockResponse;
    },
  });
  const data = query.data;
  const lines = useMemo<LineStock[]>(
    () => (data ? lineStock(items, data.lines) : items.map(() => ({ state: "ok" as const, max: null }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, key],
  );
  const problems = lines.map((s, index) => ({ ...s, index, item: items[index] })).filter((s) => s.state !== "ok");

  // Reserva: o prazo mais próximo das que valem e se alguma já venceu.
  const reservation = data?.reservation ?? OFF;
  const now = Date.now();
  const active = (data?.lines ?? []).filter((l) => (l.reserved ?? 0) > 0 && l.expires_at && Date.parse(l.expires_at) > now);
  const expiresAt = active.length ? Math.min(...active.map((l) => Date.parse(l.expires_at as string))) : null;
  const expired = (data?.lines ?? []).some((l) => l.expired || (l.expires_at && Date.parse(l.expires_at) <= now));

  // Ao vencer, volta a ler: a linha passa a "vencida" e o estoque dos outros já conta.
  useEffect(() => {
    if (!expiresAt || !enabled || !request.length) return;
    const wait = Math.max(0, expiresAt - Date.now()) + 500;
    const id = window.setTimeout(() => void query.refetch(), Math.min(wait, 2_147_000_000));
    return () => window.clearTimeout(id);
  }, [expiresAt, enabled, query, request.length]);

  return {
    lines, problems, hasProblems: problems.length > 0, refetch: query.refetch, isFetching: query.isFetching,
    reservation, expiresAt, expired: reservation.on && expired,
  };
}

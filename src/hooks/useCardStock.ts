// Estoque dos cartões de produto: o cartão que põe direto no carrinho só mostra o botão depois de saber que há estoque.
// Pergunta ao banco o mesmo que o carrinho (RPC cart_stock_check, sem reservar): uma linha de 1 unidade do produto, sem
// cor nem tamanho, que é a linha que o botão do cartão grava. Os cartões da mesma tela vão juntos numa só chamada.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cartHolderToken } from "@/lib/cartHolder";
import { CART_STOCK_KEY } from "@/hooks/useCartStock";

/** loading = ainda sem resposta; ok = pode ir ao carrinho; out = esgotado (sem unidades livres). */
export type CardStock = "loading" | "ok" | "out";

type Waiter = { id: string; resolve: (v: boolean) => void };
let queue: Waiter[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue;
  queue = [];
  timer = null;
  const ids = [...new Set(batch.map((w) => w.id))];
  let out = new Set<string>();
  try {
    const { data, error } = await (supabase as any).rpc("cart_stock_check", {
      _items: ids.map((id) => ({ product_id: id, quantity: 1, design_data: null })),
      _holder_token: cartHolderToken(),
      _reserve: false,
    });
    // Sem resposta, o botão aparece: o carrinho (useCart) e o create-order voltam a conferir.
    if (!error && data && Array.isArray(data.lines)) {
      out = new Set(ids.filter((_, i) => {
        const l = data.lines[i];
        return !!l?.slot && l.available != null && Number(l.available) <= 0;
      }));
    }
  } catch { /* idem */ }
  batch.forEach((w) => w.resolve(out.has(w.id)));
}

function soldOut(id: string) {
  return new Promise<boolean>((resolve) => {
    queue.push({ id, resolve });
    if (!timer) timer = setTimeout(() => void flush(), 30);
  });
}

/** Estado do estoque do produto no cartão. enabled = false (precisa escolher opções) não pergunta e devolve "ok". */
export function useCardStock(productId: string, enabled = true): CardStock {
  const q = useQuery({
    // Mesmo prefixo do carrinho: quando o carrinho muda (invalidate de "cart-stock"), os cartões voltam a perguntar.
    queryKey: [CART_STOCK_KEY, "card", productId],
    queryFn: () => soldOut(productId),
    enabled: enabled && !!productId,
    staleTime: 30_000,
    retry: 0,
  });
  if (!enabled) return "ok";
  if (q.data === undefined) return q.isError ? "ok" : "loading";
  return q.data ? "out" : "ok";
}

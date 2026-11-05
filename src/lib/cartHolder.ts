// Código aleatório do aparelho que identifica o carrinho de quem compra sem conta na reserva de estoque
// (RPC cart_stock_check). Não identifica a pessoa; o servidor só guarda o sha256 dele. Com sessão vale a conta.
// Registo no aparelho: COOKIE_REGISTRY (src/lib/privacy.ts), junto do guest_cart.
const KEY = "loja3d-cart-holder";
let memory = "";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function cartHolderToken(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{20,100}$/.test(saved)) return saved;
    const next = memory || randomToken();
    localStorage.setItem(KEY, next);
    return next;
  } catch {
    // Sem armazenamento (navegação privada bloqueada): vale até fechar a página.
    memory = memory || randomToken();
    return memory;
  }
}

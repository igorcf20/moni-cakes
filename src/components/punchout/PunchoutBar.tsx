// Barra da compra PunchOut (recurso punchout): aparece no topo de todas as páginas da loja enquanto a aba está numa
// sessão do sistema de compras de uma empresa. Mostra para quem é a compra, até quando vale o acesso, o atalho para
// o carrinho e "Cancelar e voltar" (devolve um carrinho vazio ao sistema de compras). PunchoutCheckoutGuard leva o
// checkout normal de volta ao carrinho: numa compra PunchOut quem paga é a empresa, pelo pedido de compra.
import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, Clock, Loader2, ShoppingCart, Undo2, X } from "lucide-react";
import { usePunchoutSend, usePunchoutSession } from "@/hooks/usePunchout";
import { useMessages } from "@/i18n";
import { punchoutMessages } from "@/i18n/punchout";
import { clearPunchout } from "@/lib/punchout";

export default function PunchoutBar() {
  const session = usePunchoutSession();
  const { pathname } = useLocation();
  const { t, locale } = useMessages(punchoutMessages);
  const { busy, cancel } = usePunchoutSend(session);
  const [asking, setAsking] = useState(false);
  if (!session || pathname.startsWith("/admin") || pathname.startsWith("/punchout")) return null;

  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(session.expiresAt));
  const viewOnly = session.operation === "inspect";
  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  return (
    <motion.aside initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} aria-label={t("bar_label")}
      className="relative z-40 bg-foreground text-white">
      <div className="shell flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[image:var(--gradient-primary)]" aria-hidden="true">
            <Building2 className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-tight">
              <span className="truncate">{t(viewOnly ? "bar_view_only" : "bar_buying", { buyer: session.buyer })}</span>
              {session.test && <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]">{t("bar_test")}</span>}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[13px] text-white/70"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t("bar_until", { time })}</span>
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {asking ? (
            <motion.span key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="flex flex-wrap items-center gap-2" role="group" aria-label={t("cancel_confirm")}>
              <span className="text-[14px] text-white/85">{t("cancel_confirm")}</span>
              <button type="button" onClick={() => void cancel()} disabled={!!busy} className={`${btn} bg-white text-foreground hover:bg-white/90`}>
                {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
                {busy === "cancel" ? t("bar_cancelling") : t("cancel_yes")}
              </button>
              <button type="button" onClick={() => setAsking(false)} className={`${btn} text-white hover:bg-white/10`}>{t("cancel_no")}</button>
            </motion.span>
          ) : (
            <motion.span key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-wrap items-center gap-2">
              {pathname !== "/carrinho" && (
                <Link to="/carrinho" className={`${btn} group bg-primary text-primary-foreground hover:bg-primary-hover`}>
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />{t("bar_cart")}
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              )}
              {session.test ? (
                <button type="button" onClick={() => clearPunchout()} className={`${btn} text-white hover:bg-white/10`}><X className="h-4 w-4" aria-hidden="true" />{t("bar_leave_test")}</button>
              ) : (
                <button type="button" onClick={() => setAsking(true)} className={`${btn} text-white hover:bg-white/10`}><Undo2 className="h-4 w-4" aria-hidden="true" />{t("bar_cancel")}</button>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

/** Numa compra PunchOut não há checkout: o carrinho volta ao sistema de compras da empresa. */
export function PunchoutCheckoutGuard({ children }: { children: React.ReactNode }) {
  const session = usePunchoutSession();
  return session ? <Navigate to="/carrinho" replace /> : <>{children}</>;
}

// /punchout/entrar?s=<token>: StartPage do PunchOut. O sistema de compras da empresa abre a loja aqui com o token
// criado pela Edge Function punchout. A página confere o token (ação open), guarda a sessão nesta aba, troca o
// carrinho pelo da empresa (vazio, ou o carrinho anterior quando o sistema pede para editar ou consultar) e segue
// para os produtos ou para o carrinho. O token sai do endereço (replace) para não ficar no histórico.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Loader2, TriangleAlert } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useStoreName } from "@/hooks/useBrand";
import { punchoutCall, type PunchoutOpen } from "@/hooks/usePunchout";
import { useMessages } from "@/i18n";
import { punchoutMessages } from "@/i18n/punchout";
import { punchoutErrorOf, savePunchout, type PunchoutError } from "@/lib/punchout";

const sb = supabase as any;

export default function PunchoutStart() {
  const { t } = useMessages(punchoutMessages);
  const storeName = useStoreName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const { addItems } = useCart(user?.id);
  const [error, setError] = useState<PunchoutError | null>(null);
  const started = useRef(false);
  const token = params.get("s") ?? "";

  useEffect(() => {
    if (started.current || loading) return;
    started.current = true;
    if (!/^[0-9a-f]{48}$/.test(token)) { setError("invalid"); return; }
    (async () => {
      try {
        const open = await punchoutCall<PunchoutOpen>({ action: "open", token });
        savePunchout({ token, buyer: open.buyer, protocol: open.protocol, operation: open.operation, test: open.test, expiresAt: open.expires_at, contact: open.contact });
        // O carrinho desta aba passa a ser o da empresa.
        try { localStorage.removeItem("guest_cart"); } catch { /* sem armazenamento */ }
        window.dispatchEvent(new Event("guest_cart_updated"));
        if (user) {
          await sb.from("cart_items").delete().eq("user_id", user.id);
          await qc.invalidateQueries({ queryKey: ["cart", user.id] });
        }
        if (open.items.length) {
          const ids = [...new Set(open.items.map((i) => i.product_id))];
          const [{ data: products }, { data: variations }] = await Promise.all([
            sb.from("products").select("id,name,image,price,weight").in("id", ids),
            sb.from("product_variations").select("id,name,product_id").in("product_id", ids),
          ]);
          const byId = new Map(((products ?? []) as any[]).map((p) => [String(p.id), p]));
          addItems(open.items.filter((i) => byId.has(i.product_id)).map((i) => {
            const p = byId.get(i.product_id);
            const d = (i.design_data ?? {}) as Record<string, any>;
            const variation = ((variations ?? []) as any[]).find((v) => String(v.product_id) === i.product_id && v.name === d.variation);
            return {
              productId: i.product_id, quantity: i.quantity, variationId: variation?.id, sizeLabel: typeof d.size === "string" ? d.size : undefined,
              designData: { ...d, name: p.name, image: p.image ?? "", price: Number(p.price) || 0, weight: Number(p.weight) || 0.5 },
            };
          }));
        }
        navigate(open.items.length ? "/carrinho" : "/produtos", { replace: true });
      } catch (e) {
        setError(punchoutErrorOf((e as Error)?.message));
      }
    })();
  }, [token, loading, user, addItems, navigate, qc]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Helmet>
        <title>{`${t("meta_title")} | ${storeName}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <main className="shell flex flex-1 items-center justify-center py-16">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
          className="w-full max-w-lg rounded-[24px] border border-brand-card-border bg-white p-8 text-center sm:p-10" aria-live="polite">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-orange-soft text-brand-orange-text">
            {error ? <TriangleAlert className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" /> : <Building2 className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />}
          </span>
          <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.03em]">{error ? t("err_title") : t("opening")}</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">{error ? t(`err_${error}`) : t("opening_d")}</p>
          {error ? (
            <Link to="/" className="mt-6 inline-block text-[15px] font-semibold text-brand-orange-text hover:underline">{t("go_home")}</Link>
          ) : (
            <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          )}
        </motion.section>
      </main>
      <Footer />
    </div>
  );
}

// Lembrete na conta do cliente: pedidos entregues (últimos 120 dias) com produtos ainda sem avaliação, cada um com
// o botão Avaliar (/avaliar/pedido/<id>). Some sozinho quando tudo foi avaliado. O e-mail com o mesmo pedido sai pela
// fila review_requests quando a loja tiver remetente.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { reviewReminderMessages } from "@/i18n/reviewReminder";
import { ItemThumb, btnPrimary, cardCls } from "./ui";
import { cn } from "@/lib/utils";

type Pending = { id: string; delivered_at: string | null; created_at: string; products: { id: string; name: string | null; image: string | null }[] };

const SHOWN = 3;

function usePendingReviews(userId: string | undefined) {
  return useQuery({
    queryKey: ["pending-reviews", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Pending[]> => {
      const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const { data: orders, error } = await (supabase as any).from("orders")
        .select("id, delivered_at, created_at, status").eq("user_id", userId).in("status", ["delivered", "completed"])
        .gte("created_at", since).order("created_at", { ascending: false }).limit(20);
      if (error || !orders?.length) return [];
      const ids = orders.map((o: any) => o.id);
      const { data: items } = await (supabase as any).from("order_items")
        .select("order_id, product_id, products:product_id(name, image)").in("order_id", ids);
      const productIds = [...new Set((items ?? []).map((i: any) => i.product_id).filter(Boolean))];
      const { data: reviews } = productIds.length
        ? await (supabase as any).from("product_reviews").select("product_id").eq("user_id", userId).in("product_id", productIds)
        : { data: [] };
      const done = new Set((reviews ?? []).map((r: any) => String(r.product_id)));
      return orders.map((o: any) => {
        const seen = new Set<string>();
        const products = (items ?? [])
          .filter((i: any) => i.order_id === o.id && i.product_id && !done.has(String(i.product_id)))
          .filter((i: any) => (seen.has(i.product_id) ? false : (seen.add(i.product_id), true)))
          .map((i: any) => ({ id: String(i.product_id), name: i.products?.name ?? null, image: i.products?.image ?? null }));
        return { id: o.id, delivered_at: o.delivered_at, created_at: o.created_at, products };
      }).filter((o: Pending) => o.products.length > 0);
    },
  });
}

export function ReviewReminder({ userId }: { userId: string | undefined }) {
  const { t, locale } = useMessages(reviewReminderMessages);
  const { data = [] } = usePendingReviews(userId);
  if (!data.length) return null;
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso));
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
      className={cn(cardCls, "overflow-hidden border-primary/25")} aria-labelledby="review-reminder-title" data-review-reminder>
      <div className="flex items-start gap-3 bg-brand-orange-soft/70 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white text-primary">
          <Star className="h-5 w-5 fill-primary" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div>
          <h3 id="review-reminder-title" className="text-[17px] font-bold leading-snug">
            {data.length === 1 ? t("title_one") : t("title_other", { count: data.length })}
          </h3>
          <p className="text-[14px] text-brand-ink-soft">{t("lead")}</p>
        </div>
      </div>
      <ul className="divide-y divide-brand-card-border">
        {data.slice(0, SHOWN).map((o) => (
          <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 -space-x-3">
                {o.products.slice(0, 3).map((p) => (
                  <ItemThumb key={p.id} src={p.image} alt={p.name ?? ""} Icon={Package} className="h-12 w-12 rounded-[12px] ring-2 ring-white" />
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{t("order", { code: o.id.slice(0, 8).toUpperCase() })}</p>
                <p className="text-[13px] text-muted-foreground">
                  {t("delivered", { date: date(o.delivered_at ?? o.created_at) })}
                  {" · "}
                  {o.products.length === 1 ? t("pending_one") : t("pending_other", { count: o.products.length })}
                </p>
              </div>
            </div>
            <Link to={`/avaliar/pedido/${o.id}`} className={cn(btnPrimary, "min-h-11 shrink-0 px-5")}>
              <Star className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("rate")}
            </Link>
          </li>
        ))}
      </ul>
      {data.length > SHOWN && <p className="border-t border-brand-card-border px-5 py-3 text-[13px] text-muted-foreground">{t("more", { count: data.length - SHOWN })}</p>}
    </motion.section>
  );
}

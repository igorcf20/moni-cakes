// =====================================================================================
// Admin > Carrinhos abandonados: clientes com conta que deixaram produtos no carrinho e não compraram.
//   Topo      parado há pelo menos (horas), período (dias), números (carrinhos, valor estimado, sem contato, recuperados)
//   Filtros   todos, sem contato, contatados; busca por nome, e-mail ou produto
//   Cartões   produtos, valor estimado, última mexida; WhatsApp ou e-mail com a mensagem pronta (marca o contato),
//             copiar mensagem, marcar ou desfazer contato, ver cliente
// O carrinho fica guardado na conta, por isso o link de recuperação é o carrinho da loja (siteUrl()/carrinho).
// Dados: admin_abandoned_carts e admin_abandoned_cart_recovered (migration 20261006180100_abandoned_carts.sql).
// =====================================================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Mail, MessageCircle, Package, Search, ShoppingBasket, Undo2, UserRound, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminAbandonedCartsMessages } from "@/i18n/adminAbandonedCarts";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useStoreName } from "@/hooks/useBrand";
import { useAbandonedCarts, useCartRecovered, useClearContact, useMarkContacted, type AbandonedCart } from "@/hooks/useAbandonedCarts";
import { firstName, IDLE_HOURS, mailtoLink, PERIOD_DAYS, whatsappLink, type ContactChannel } from "@/lib/cartRecovery";
import { siteUrl } from "@/lib/siteUrl";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
type Filter = "all" | "open" | "contacted";

export default function AdminAbandonedCarts() {
  const { t } = useMessages(adminAbandonedCartsMessages);
  const { money, relative, dateTime } = useAdminFormat();
  const store = useStoreName();
  const [hours, setHours] = useState<number>(2);
  const [days, setDays] = useState<number>(30);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { data: rows = [], isLoading, error } = useAbandonedCarts(hours, days);
  const { data: recovered } = useCartRecovered(days);
  const mark = useMarkContacted();
  const clear = useClearContact();

  const open = rows.filter((r) => !r.contacted_at);
  const value = rows.reduce((s, r) => s + r.value, 0);
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    return rows.filter((r) =>
      (filter === "all" || (filter === "open" ? !r.contacted_at : !!r.contacted_at))
      && (!needle || norm([r.full_name, r.email, r.phone, ...r.products.map((p) => p.name)].filter(Boolean).join(" ")).includes(needle)));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  const cartLink = `${siteUrl()}/carrinho`;
  const message = (r: AbandonedCart) => {
    const name = firstName(r.full_name);
    return t(name ? "msg_text" : "msg_text_noname", { name, store, link: cartLink, products: r.products.slice(0, 3).map((p) => p.name).join(", ") });
  };
  const contacted = async (r: AbandonedCart, channel: ContactChannel) => {
    try {
      await mark.mutateAsync({ userId: r.user_id, channel });
      toast.success(t("marked"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const copy = async (r: AbandonedCart) => {
    try {
      await navigator.clipboard.writeText(message(r));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_error"));
    }
  };

  return (
    <div className="space-y-5">
      <AdminHelp id="abandoned-carts" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <p className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span><strong>{t("email_title")}</strong> {t("email_text")}</span>
      </p>

      {/* Parado há quanto tempo e período */}
      <div className="flex flex-col gap-4 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-56">
          <Label htmlFor="ac-hours">{t("idle_label")}</Label>
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger id="ac-hours"><SelectValue /></SelectTrigger>
            <SelectContent>
              {IDLE_HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h < 24 ? t("hours_n", { n: h }) : t("days_n", { n: h / 24 })}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <FilterChips<string>
          label={t("period_label")}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={PERIOD_DAYS.map((d) => ({ value: String(d), label: t("last_days", { n: d }) }))}
        />
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={ShoppingBasket} label={t("stat_carts")} value={rows.length} active={filter === "all"} onClick={() => setFilter("all")} />
            <AdminStatCard icon={Wallet} label={t("stat_value")} value={money(value)} hint={t("stat_value_hint")} />
            <AdminStatCard icon={UserRound} label={t("stat_open")} value={open.length} tone={open.length ? "warning" : "default"} active={filter === "open"} onClick={() => setFilter("open")} />
            <AdminStatCard icon={CheckCircle2} label={t("stat_recovered")} value={recovered?.customers ?? 0} hint={recovered?.revenue ? t("stat_recovered_hint", { value: money(recovered.revenue) }) : undefined} tone="success" />
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
            <FilterChips<Filter>
              label={t("f_label")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("f_all"), count: rows.length },
                { value: "open", label: t("f_open"), count: open.length, tone: "warning" },
                { value: "contacted", label: t("f_contacted"), count: rows.length - open.length },
              ]}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
            </div>
          </div>

          {paged.items.length === 0 ? (
            <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{rows.length ? t("empty") : t("empty_all")}</p>
          ) : (
            <ul className="space-y-3">
              {paged.items.map((r) => {
                const wa = whatsappLink(r.phone, message(r));
                return (
                  <li key={r.user_id} className="space-y-4 rounded-[18px] border bg-card p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.full_name || r.email}</p>
                        <p className="text-sm text-muted-foreground">{[r.full_name ? r.email : null, r.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-bold tabular-nums">{money(r.value)}</p>
                        <p className="text-xs text-muted-foreground">{r.units === 1 ? t("units_one") : t("units_n", { n: r.units })} · {t("idle_since", { when: relative(r.last_activity) })}</p>
                      </div>
                    </div>

                    <ul className="flex flex-wrap gap-2">
                      {r.products.slice(0, 6).map((p) => (
                        <li key={p.id} className="flex max-w-full items-center gap-2 rounded-xl border bg-background py-1 pl-1 pr-3 text-sm">
                          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package className="m-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                          </span>
                          <span className="truncate">{p.quantity > 1 ? `${p.quantity} x ` : ""}{p.name}</span>
                        </li>
                      ))}
                      {r.products.length > 6 && <li className="self-center text-sm text-muted-foreground">{t("more_n", { n: r.products.length - 6 })}</li>}
                    </ul>

                    {r.contacted_at && (
                      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t("contacted_on", { when: dateTime(r.contacted_at), channel: t(`ch_${r.channel ?? "other"}`) })}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {wa && (
                        <Button size="sm" asChild>
                          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => void contacted(r, "whatsapp")}><MessageCircle className="mr-1.5 h-4 w-4" strokeWidth={1.8} />WhatsApp</a>
                        </Button>
                      )}
                      <Button size="sm" variant={wa ? "outline" : "default"} asChild>
                        <a href={mailtoLink(r.email, t("msg_subject", { store }), message(r))} onClick={() => void contacted(r, "email")}><Mail className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("send_email")}</a>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void copy(r)}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("copy_message")}</Button>
                      {r.contacted_at ? (
                        <Button size="sm" variant="ghost" onClick={() => clear.mutate(r.user_id, { onError: () => toast.error(t("save_error")) })}><Undo2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("undo_contact")}</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void contacted(r, "other")}><CheckCircle2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("mark_contacted")}</Button>
                      )}
                      <Button size="sm" variant="ghost" asChild><Link to={adminHref.customer(r.user_id)}><Users className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("see_customer")}</Link></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
        </>
      )}
    </div>
  );
}

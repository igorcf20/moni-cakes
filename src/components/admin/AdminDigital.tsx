// =====================================================================================
// Admin > Vendas > Downloads (recurso digital_products em Admin > Recursos da loja). Sem janelas:
//   Acessos   números (ativos, downloads em 30 dias, à espera de chave, vencem em 7 dias, encerrados), filtros, busca
//   acesso    (ver=acesso&id=<id>) cliente, produto, pedido, downloads, chaves; zerar, encerrar ou reativar, prazo e limite
//   Produtos  produtos digitais com arquivos, chaves livres e regras (atalho para a aba Digital do produto)
// Escrita só por admin_digital_grant_update (migration 20261007110000_digital_products.sql).
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarClock, ChevronRight, Download, FileDown, KeyRound, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminDigitalMessages } from "@/i18n/adminDigital";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useAdminDigitalGrants, useAdminDigitalProducts, useAdminGrantUpdate, type AdminGrantRow } from "@/hooks/useDigitalProducts";
import { daysLeft, grantState, type GrantState } from "@/lib/digitalProducts";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminDigitalMessages["pt-BR"]>>["t"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const code = (id: string) => id.slice(0, 8).toUpperCase();
const DAY = 86_400_000;

const STATE_CLS: Record<GrantState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-700",
  revoked: "bg-muted text-muted-foreground",
};
const pendingKey = (g: AdminGrantRow) => g.license_keys && g.status === "active" && g.keys < g.quantity;
const limitReached = (g: AdminGrantRow) => g.download_limit != null && g.files > 0 && g.max_used >= g.download_limit;

function Badges({ g, t }: { g: AdminGrantRow; t: T }) {
  const s = grantState(g);
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_CLS[s])}>{t(`st_${s}`)}</span>
      {pendingKey(g) && <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{t("pending_key")}</span>}
      {s === "active" && limitReached(g) && <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t("limit_badge")}</span>}
    </span>
  );
}
const downloadsText = (t: T, n: number) => (n === 0 ? t("downloads_zero") : n === 1 ? t("downloads_one") : t("downloads", { n }));

export default function AdminDigital() {
  const { t } = useMessages(adminDigitalMessages);
  const page = useAdminPage();
  const tab = page.tab === "produtos" ? "produtos" : "acessos";
  if (page.view === "acesso" && page.id) return <GrantPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="downloads" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11">
          <TabsTrigger value="acessos" className="px-4">{t("tab_access")}</TabsTrigger>
          <TabsTrigger value="produtos" className="px-4">{t("tab_products")}</TabsTrigger>
        </TabsList>
        <TabsContent value="acessos" className="mt-5"><GrantList onOpen={(id) => page.open("acesso", id)} /></TabsContent>
        <TabsContent value="produtos" className="mt-5"><ProductList /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Acessos ---------- */

type Filter = "active" | "pending" | "expiring" | "limit" | "expired" | "revoked" | "all";

function GrantList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminDigitalMessages);
  const { date } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useAdminDigitalGrants();
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");

  const now = Date.now();
  const match = (g: AdminGrantRow, f: Filter): boolean => {
    const s = grantState(g);
    switch (f) {
      case "active": return s === "active";
      case "pending": return pendingKey(g);
      case "expiring": return s === "active" && !!g.expires_at && new Date(g.expires_at).getTime() - now <= 7 * DAY;
      case "limit": return s === "active" && limitReached(g);
      case "expired": return s === "expired";
      case "revoked": return s === "revoked";
      default: return true;
    }
  };
  const count = (f: Filter) => rows.filter((g) => match(g, f)).length;
  const recent = rows.reduce((s, g) => s + g.downloads_30d, 0);
  const needle = norm(q.trim());
  const filtered = rows.filter((g) => match(g, filter)
    && (!needle || norm([g.customer?.full_name, g.customer?.email, g.product?.name, code(g.order_id)].filter(Boolean).join(" ")).includes(needle)));
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminStatCard icon={ShieldCheck} label={t("stat_active")} value={count("active")} active={filter === "active"} onClick={() => setFilter("active")} />
        <AdminStatCard icon={Download} label={t("stat_downloads")} value={recent} />
        <AdminStatCard icon={KeyRound} label={t("stat_pending")} value={count("pending")} tone={count("pending") ? "warning" : "default"} active={filter === "pending"} onClick={() => setFilter("pending")} />
        <AdminStatCard icon={CalendarClock} label={t("stat_expiring")} value={count("expiring")} active={filter === "expiring"} onClick={() => setFilter("expiring")} />
        <AdminStatCard icon={Ban} label={t("stat_closed")} value={count("revoked")} active={filter === "revoked"} onClick={() => setFilter("revoked")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: t("f_active"), count: count("active") },
            { value: "pending", label: t("f_pending"), count: count("pending"), tone: "warning" as const },
            { value: "expiring", label: t("f_expiring"), count: count("expiring") },
            { value: "limit", label: t("f_limit"), count: count("limit") },
            { value: "expired", label: t("f_expired"), count: count("expired") },
            { value: "revoked", label: t("f_revoked"), count: count("revoked") },
            { value: "all", label: t("f_all"), count: rows.length },
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
          {paged.items.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onOpen(g.id)} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  {g.product?.image
                    ? <img src={g.product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl border object-cover" loading="lazy" />
                    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><FileDown className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /></span>}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{g.product?.name ?? t("product_gone")}</span>
                      <Badges g={g} t={t} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {[g.customer?.full_name || g.customer?.email || t("customer_unknown"), g.quantity > 1 ? t("qty", { n: g.quantity }) : null, t("order", { code: code(g.order_id) })].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{downloadsText(t, g.downloads)}</span>
                    <span className="block text-xs text-muted-foreground">{g.expires_at ? t("until", { date: date(g.expires_at) }) : t("no_expiry")}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

/* ---------- Página do acesso ---------- */

function GrantPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminDigitalMessages);
  const { date, dateTime } = useAdminFormat();
  const { data: rows = [], isLoading } = useAdminDigitalGrants();
  const g = rows.find((r) => r.id === id);
  const update = useAdminGrantUpdate();
  const { ask, confirmSlot } = useInlineConfirm();
  const [days, setDays] = useState("");
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (!g) return;
    const left = daysLeft(g.expires_at);
    setDays(left == null ? "" : String(Math.max(1, left)));
    setLimit(g.download_limit == null ? "" : String(g.download_limit));
  }, [g]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!g) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const run = async (action: "revoke" | "restore" | "reset" | "expires" | "limit", value?: number | null) => {
    try {
      await update.mutateAsync({ id, action, value });
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message === "invalid_value" ? t("err_invalid_value") : t("save_error"));
    }
  };
  const revoke = async () => {
    if (await ask(t("confirm_revoke"), { confirmLabel: t("act_revoke") })) await run("revoke");
  };
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const state = grantState(g);
  const busy = update.isPending;

  return (
    <AdminSubpage
      title={g.product?.name ?? t("product_gone")}
      subtitle={[g.customer?.full_name || g.customer?.email || t("customer_unknown"), t("order", { code: code(g.order_id) })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        <Button asChild variant="outline" size="sm"><Link to={adminHref.order(g.order_id)}>{t("open_order")}</Link></Button>
        {g.user_id && <Button asChild variant="outline" size="sm"><Link to={adminHref.customer(g.user_id)}>{t("open_customer")}</Link></Button>}
        {g.product_id && <Button asChild variant="outline" size="sm"><Link to={`${adminHref.product(g.product_id)}?tab=digital`}>{t("open_product")}</Link></Button>}
      </>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={ShieldCheck} label={t("d_status")} value={<Badges g={g} t={t} />} hint={t("d_created", { date: dateTime(g.created_at) })} />
        <AdminStatCard icon={Download} label={t("d_downloads")} value={downloadsText(t, g.downloads)}
          hint={g.last_download ? t("last", { date: dateTime(g.last_download) }) : g.reset_at ? t("d_reset", { date: dateTime(g.reset_at) }) : undefined} />
        <AdminStatCard icon={CalendarClock} label={t("d_expires")} value={g.expires_at ? date(g.expires_at) : t("no_expiry")}
          hint={g.download_limit == null ? `${t("d_limit")}: ${t("d_unlimited")}` : `${t("d_limit")}: ${g.download_limit}`} />
        <AdminStatCard icon={KeyRound} label={t("d_keys")} value={g.license_keys ? t("d_keys_n", { n: g.keys, total: g.quantity }) : t("d_keys_off")}
          tone={pendingKey(g) ? "warning" : "default"} />
      </div>

      {pendingKey(g) && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />{t("keys_low")}
        </p>
      )}

      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {state !== "revoked" && (
            <Button onClick={() => void run("reset")} disabled={busy}><RotateCcw className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("act_reset")}</Button>
          )}
          {state === "revoked"
            ? <Button onClick={() => void run("restore")} disabled={busy}><ShieldCheck className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("act_restore")}</Button>
            : <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void revoke()} disabled={busy}><Ban className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("act_revoke")}</Button>}
        </div>
        {state !== "revoked" && <p className="text-xs text-muted-foreground">{t("act_reset_d")}</p>}
        {confirmSlot}
      </section>

      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="font-semibold">{t("edit_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("edit_hint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dg-days">{t("days_from_now")}</Label>
            <div className="flex gap-2">
              <Input id="dg-days" inputMode="numeric" className="max-w-[160px]" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              <Button variant="outline" onClick={() => void run("expires", num(days))} disabled={busy}>{t("apply_expires")}</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dg-limit">{t("limit_label")}</Label>
            <div className="flex gap-2">
              <Input id="dg-limit" inputMode="numeric" className="max-w-[160px]" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              <Button variant="outline" onClick={() => void run("limit", num(limit))} disabled={busy}>{t("apply_limit")}</Button>
            </div>
          </div>
        </div>
      </section>
    </AdminSubpage>
  );
}

/* ---------- Produtos digitais ---------- */

function ProductList() {
  const { t } = useMessages(adminDigitalMessages);
  const { data: rows = [], isLoading, error } = useAdminDigitalProducts();
  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;
  if (!rows.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("products_empty")}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const rules = [
          r.download_limit == null ? null : `${t("p_limit")}: ${r.download_limit}`,
          r.access_days == null ? null : `${t("p_days")}: ${r.access_days}`,
        ].filter(Boolean);
        return (
          <li key={r.product_id}>
            <Link to={`${adminHref.product(r.product_id)}?tab=digital`} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-center gap-3">
                {r.product?.image
                  ? <img src={r.product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl border object-cover" loading="lazy" />
                  : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><FileDown className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /></span>}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.product?.name ?? t("product_gone")}</span>
                    {!r.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("products_inactive")}</span>}
                    {r.ships && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{t("products_ships")}</span>}
                  </span>
                  <span className={cn("mt-0.5 block truncate text-sm", r.files ? "text-muted-foreground" : "font-medium text-destructive")}>
                    {[r.files === 0 ? t("products_no_files") : r.files === 1 ? t("products_files_one") : t("products_files", { n: r.files }),
                      r.license_keys ? t("products_keys", { free: r.keys_free, used: r.keys_used }) : null, ...rules].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </span>
              <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

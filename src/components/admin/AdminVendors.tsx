// =====================================================================================
// Admin > Vendas > Vendedores (recurso marketplace em Admin > Recursos da loja). Sem janelas:
//   Vendedores   números (vendas, comissão, saldo a pagar), filtros e lista de vendedores
//   vendedor     (ver=vendedor&id=<id> ou id=novo) dados, comissão, descrição por idioma, pausa; números; contas
//                ligadas (pelo e-mail); produtos; repasses (painel na página para registrar); vendas; apagar só sem
//                vendas nem repasses
//   Vendas       livro de vendas de todos os vendedores (vendor_ledger), com a comissão do momento
//   Cadastros    pedidos que chegam por /vender; aprovar cria o vendedor e liga a conta; recusar com nota
//   Regras       comissão padrão, aceitar cadastros, mostrar "Vendido por" no produto
// Campo Vendedor na edição do produto: VendorField.tsx. Regras no banco (migration 20261007130000_marketplace.sql);
// contas em src/lib/marketplace.ts; textos em src/i18n/adminMarketplace.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BadgePercent, ChevronRight, ExternalLink, Inbox, Loader2, Plus, Receipt, Search, Store, Trash2, UserPlus, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { InlinePanel } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALES, LOCALE_NAMES, useMessages } from "@/i18n";
import { adminMarketplaceMessages } from "@/i18n/adminMarketplace";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useAddVendorMember, useAdminVendorProducts, useAdminVendors, useDecideApplication, useDeletePayout, useDeleteVendor,
  useMarketplaceSettings, useRemoveVendorMember, useSaveMarketplaceSettings, useSavePayout, useSaveVendor, useVendorApplications,
  useVendorLedger, useVendorMembers, useVendorPayouts, type AdminVendor, type VendorApplication, type VendorDraft,
} from "@/hooks/useMarketplace";
import { marketplaceErrorOf, normalizeTotals, vendorDraftErrors, vendorSlug, type MarketplaceSettings } from "@/lib/marketplace";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminMarketplaceMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);
const ADMIN_ERRORS = new Set(["forbidden", "not_found", "user_not_found", "other_vendor", "decided"]);
const errText = (t: T, e: unknown) => {
  const code = marketplaceErrorOf((e as Error)?.message);
  return t(ADMIN_ERRORS.has(code) ? (`err_${code}` as "err_forbidden") : "err_unknown");
};
const vendorUrl = (slug: string) => `/vendedor/${slug}`;

function Chip({ tone = "muted", children }: { tone?: "muted" | "orange" | "amber" | "emerald"; children: React.ReactNode }) {
  const cls = tone === "orange" ? "bg-primary/10 text-brand-orange-text" : tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{children}</span>;
}

function VendorLogo({ v, size = "h-12 w-12" }: { v: Pick<AdminVendor, "name" | "logo_url">; size?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted", size)}>
      {v.logo_url ? <img src={v.logo_url} alt="" className="max-h-[80%] max-w-[80%] object-contain" /> : <span className="text-sm font-bold text-muted-foreground">{v.name.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

export default function AdminVendors() {
  const { t } = useMessages(adminMarketplaceMessages);
  const page = useAdminPage();
  const { data: apps = [] } = useVendorApplications();
  const newApps = apps.filter((a) => a.status === "new").length;
  const tab = ["vendas", "cadastros", "regras"].includes(page.tab ?? "") ? page.tab! : "vendedores";
  if (page.view === "vendedor" && page.id) return <VendorEditPage id={page.id} onBack={page.close} onOpen={(id) => page.open("vendedor", id)} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="vendors" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4"), t("help_5")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="vendedores" className="px-4">{t("tab_vendors")}</TabsTrigger>
          <TabsTrigger value="vendas" className="px-4">{t("tab_sales")}</TabsTrigger>
          <TabsTrigger value="cadastros" className="gap-1.5 px-4">
            {t("tab_applications")}
            {newApps > 0 && <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{newApps}</span>}
          </TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="vendedores" className="mt-5"><VendorList onOpen={(id) => page.open("vendedor", id)} newApps={newApps} onApps={() => page.setTab("cadastros")} /></TabsContent>
        <TabsContent value="vendas" className="mt-5"><LedgerList vendorId={null} /></TabsContent>
        <TabsContent value="cadastros" className="mt-5"><Applications onOpenVendor={(id) => page.open("vendedor", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Vendedores ---------- */

type ListFilter = "all" | "active" | "paused" | "balance";

function VendorList({ onOpen, newApps, onApps }: { onOpen: (id: string) => void; newApps: number; onApps: () => void }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const { data: list = [], isLoading, error } = useAdminVendors();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  const sum = useMemo(() => list.reduce((s, v) => ({
    gross: s.gross + v.totals.gross, gross_30d: s.gross_30d + v.totals.gross_30d, commission: s.commission + v.totals.commission, balance: s.balance + v.totals.balance,
  }), { gross: 0, gross_30d: 0, commission: 0, balance: 0 }), [list]);
  const shown = list.filter((v) => {
    if (filter === "active" && !v.is_active) return false;
    if (filter === "paused" && v.is_active) return false;
    if (filter === "balance" && v.totals.balance <= 0) return false;
    const s = q.trim().toLowerCase();
    return !s || v.name.toLowerCase().includes(s) || (v.email ?? "").toLowerCase().includes(s) || v.slug.includes(s);
  });

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <Store className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
          {newApps > 0 && <Button variant="outline" onClick={onApps}><Inbox className="mr-1.5 h-4 w-4" />{t("stat_new_apps")} ({newApps})</Button>}
        </div>
      </div>
    );
  }

  const paused = list.filter((v) => !v.is_active).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Store} label={t("stat_vendors")} value={list.length - paused} hint={paused ? t("stat_paused", { n: paused }) : undefined} />
        <AdminStatCard icon={Receipt} label={t("stat_gross")} value={fmt.money(sum.gross)} hint={t("stat_gross_30d", { v: fmt.money(sum.gross_30d) })} />
        <AdminStatCard icon={BadgePercent} label={t("stat_commission")} value={fmt.money(sum.commission)} tone="success" />
        <AdminStatCard icon={Wallet} label={t("stat_balance")} value={fmt.money(sum.balance)} tone={sum.balance > 0 ? "warning" : "default"} onClick={() => setFilter("balance")} active={filter === "balance"} />
      </div>
      {newApps > 0 && (
        <button type="button" onClick={onApps} className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-primary/30 bg-primary/5 p-4 text-left text-sm font-medium transition-colors duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-2"><Inbox className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("stat_new_apps")}: {newApps}</span>
          <ChevronRight className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />
        </button>
      )}

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
            { value: "all", label: t("f_all"), count: list.length },
            { value: "active", label: t("f_active"), count: list.length - paused },
            { value: "paused", label: t("f_paused"), count: paused },
            { value: "balance", label: t("f_balance"), count: list.filter((v) => v.totals.balance > 0).length, tone: "warning" },
          ]} />
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <ul className="space-y-3">
          {shown.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onOpen(v.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <VendorLogo v={v} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{v.name}</span>
                      <Chip tone="orange">{t("commission_n", { n: v.commission_percent })}</Chip>
                      {!v.is_active && <Chip tone="amber">{t("badge_paused")}</Chip>}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {[v.totals.products === 1 ? t("products_one") : t("products_n", { n: v.totals.products }), v.totals.last_sale ? t("last_sale", { when: fmt.relative(v.totals.last_sale) }) : t("no_sales")].join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-4 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{fmt.money(v.totals.gross)}</span>
                    <span className="block text-xs text-muted-foreground">{t("row_sales")}</span>
                  </span>
                  <span className="text-right">
                    <span className={cn("block font-semibold tabular-nums", v.totals.balance > 0 && "text-amber-700")}>{fmt.money(v.totals.balance)}</span>
                    <span className="block text-xs text-muted-foreground">{t("row_balance")}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Página do vendedor ---------- */

const EMPTY: VendorDraft = { slug: "", name: "", email: null, phone: null, logo_url: null, description_i18n: {}, commission_percent: 10, is_active: true, notes: null };

function VendorEditPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const isNew = id === "novo";
  const { data: list = [], isLoading } = useAdminVendors();
  const { data: settings } = useMarketplaceSettings();
  const v = list.find((x) => x.id === id);
  const save = useSaveVendor();
  const del = useDeleteVendor();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<VendorDraft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (v) {
      const { id: _id, created_at: _c, totals: _t, ...draft } = v;
      setF(draft);
      setSlugTouched(true);
    } else if (isNew) {
      setF({ ...EMPTY, commission_percent: settings?.default_commission ?? 10 });
    }
  }, [v, isNew, settings?.default_commission]);

  if (isLoading) return <Loading t={t} />;
  if (!isNew && !v) {
    return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("load_error")}</p></AdminSubpage>;
  }

  const errs = vendorDraftErrors(f, list, isNew ? null : id);
  const totals = v?.totals ?? normalizeTotals({});
  const set = <K extends keyof VendorDraft>(k: K, val: VendorDraft[K]) => setF((p) => ({ ...p, [k]: val }));
  const setName = (name: string) => setF((p) => ({ ...p, name, slug: slugTouched ? p.slug : vendorSlug(name) }));
  const canDelete = totals.orders === 0 && totals.paid === 0;

  const submit = async () => {
    setTried(true);
    if (errs.length) return;
    try {
      const newId = await save.mutateAsync({ id: isNew ? null : id, draft: f });
      toast.success(t("saved"));
      if (isNew) onOpen(newId);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? "").includes("slug") ? t("err_slug_taken") : t("save_error"));
    }
  };
  const remove = async () => {
    if (!v) return;
    if (!canDelete) { toast.error(t("delete_blocked")); return; }
    if (!(await ask(t("delete_confirm", { name: v.name }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(v.id);
      toast.success(t("deleted"));
      onBack();
    } catch (e) {
      toast.error(errText(t, e));
    }
  };

  return (
    <AdminSubpage
      title={isNew ? t("new") : v!.name}
      subtitle={isNew ? t("new_d") : [t("commission_n", { n: v!.commission_percent }), v!.is_active ? null : t("badge_paused")].filter(Boolean).join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && (
        <>
          {v!.is_active && <Button variant="outline" size="sm" asChild><a href={vendorUrl(v!.slug)} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("view_page")}</a></Button>}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
        </>
      )}
    >
      {confirmSlot}
      {!isNew && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={Receipt} label={t("stat_gross")} value={fmt.money(totals.gross)} hint={`${t("stat_orders")}: ${totals.orders} · ${t("stat_units", { n: totals.units })}`} />
          <AdminStatCard icon={BadgePercent} label={t("stat_commission")} value={fmt.money(totals.commission)} tone="success" />
          <AdminStatCard icon={Store} label={t("stat_net")} value={fmt.money(totals.net)} hint={`${t("stat_paid")}: ${fmt.money(totals.paid)}`} />
          <AdminStatCard icon={Wallet} label={t("stat_balance")} value={fmt.money(totals.balance)} tone={totals.balance > 0 ? "warning" : "default"} hint={totals.net_undelivered > 0 ? t("undelivered_line", { v: fmt.money(totals.net_undelivered) }) : undefined} />
        </div>
      )}

      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("form_title")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vd-name">{t("fl_name")}</Label>
            <Input id="vd-name" value={f.name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("fl_name_ph")} aria-invalid={tried && errs.includes("name")} />
            {tried && errs.includes("name") && <p className="text-xs text-destructive">{t("err_name")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vd-slug">{t("fl_slug")}</Label>
            <Input id="vd-slug" value={f.slug} maxLength={80} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} aria-invalid={(tried && errs.includes("slug")) || errs.includes("slug_taken")} />
            {errs.includes("slug_taken") ? <p className="text-xs text-destructive">{t("err_slug_taken")}</p>
              : tried && errs.includes("slug") ? <p className="text-xs text-destructive">{t("err_slug")}</p>
              : <p className="break-all text-xs text-muted-foreground">{t("fl_slug_d", { url: `${siteUrl()}${vendorUrl(f.slug || "...")}` })}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vd-email">{t("fl_email")}</Label>
            <Input id="vd-email" type="email" value={f.email ?? ""} maxLength={200} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vd-phone">{t("fl_phone")}</Label>
            <Input id="vd-phone" type="tel" value={f.phone ?? ""} maxLength={40} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vd-logo">{t("fl_logo")}</Label>
            <div className="flex items-center gap-3">
              <VendorLogo v={{ name: f.name || "?", logo_url: f.logo_url }} size="h-11 w-11" />
              <Input id="vd-logo" value={f.logo_url ?? ""} maxLength={500} onChange={(e) => set("logo_url", e.target.value.trim())} placeholder="https://" />
            </div>
            <p className="text-xs text-muted-foreground">{t("fl_logo_d")}</p>
          </div>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vd-pct">{t("fl_commission")}</Label>
            <Input id="vd-pct" inputMode="decimal" className="max-w-[140px]" value={String(f.commission_percent)}
              onChange={(e) => set("commission_percent", Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0)} aria-invalid={errs.includes("commission")} />
            {errs.includes("commission") ? <p className="text-xs text-destructive">{t("err_commission")}</p> : <p className="text-xs text-muted-foreground">{t("fl_commission_d")}</p>}
          </div>
          <label className="flex items-start justify-between gap-3">
            <span><span className="block text-sm font-medium">{t("fl_active")}</span><span className="block text-xs text-muted-foreground">{t("fl_active_d")}</span></span>
            <Switch checked={f.is_active} onCheckedChange={(val) => set("is_active", val)} aria-label={t("fl_active")} />
          </label>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">{t("fl_desc")}</p>
            <p className="text-xs text-muted-foreground">{t("fl_desc_d")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LOCALES.map((l) => (
              <div key={l} className="space-y-1.5">
                <Label htmlFor={`vd-desc-${l}`}>{LOCALE_NAMES[l]}</Label>
                <Textarea id={`vd-desc-${l}`} rows={3} maxLength={1000} value={f.description_i18n[l] ?? ""}
                  onChange={(e) => set("description_i18n", { ...f.description_i18n, [l]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor="vd-notes">{t("fl_notes")}</Label>
          <Textarea id="vd-notes" rows={2} maxLength={2000} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder={t("fl_notes_ph")} />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isNew ? t("create") : t("save")}</Button>
        </div>
      </section>

      {!isNew && v && (
        <>
          <Members vendorId={v.id} />
          <VendorProducts vendorId={v.id} />
          <Payouts vendor={v} />
          <section className="space-y-3">
            <div>
              <h4 className="font-semibold">{t("sales_title")}</h4>
              <p className="text-sm text-muted-foreground">{t("sales_d")}</p>
            </div>
            <LedgerList vendorId={v.id} />
          </section>
        </>
      )}
    </AdminSubpage>
  );
}

function Members({ vendorId }: { vendorId: string }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const { data: members = [], isLoading } = useVendorMembers(vendorId);
  const add = useAddVendorMember();
  const remove = useRemoveVendorMember();
  const { ask, confirmSlot } = useInlineConfirm();
  const [email, setEmail] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await add.mutateAsync({ vendorId, email });
      setEmail("");
      toast.success(t("member_added"));
    } catch (x) {
      toast.error(errText(t, x));
    }
  };
  const unlink = async (userId: string, mail: string) => {
    if (!(await ask(t("member_remove_confirm", { email: mail }), { confirmLabel: t("member_remove"), tone: "warning" }))) return;
    try {
      await remove.mutateAsync(userId);
      toast.success(t("member_removed"));
    } catch (x) {
      toast.error(errText(t, x));
    }
  };

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h4 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />{t("members_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("members_d")}</p>
      </div>
      {confirmSlot}
      {isLoading ? <Loading t={t} /> : members.length === 0 ? <p className="text-sm text-muted-foreground">{t("members_empty")}</p> : (
        <ul className="divide-y rounded-xl border">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.full_name || m.email}</span>
                <span className="block truncate text-xs text-muted-foreground">{m.full_name ? `${m.email} · ` : ""}{fmt.date(m.created_at)}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => void unlink(m.user_id, m.email)} disabled={remove.isPending}>{t("member_remove")}</Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="vd-member">{t("member_email")}</Label>
          <Input id="vd-member" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="pessoa@exemplo.com" />
        </div>
        <Button type="submit" variant="outline" disabled={add.isPending || !email.trim()}>
          {add.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}{t("member_add")}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t("member_hint")}</p>
    </section>
  );
}

function VendorProducts({ vendorId }: { vendorId: string }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const { data: products = [], isLoading } = useAdminVendorProducts(vendorId);
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{t("products_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("products_d")}</p>
        </div>
        <Button variant="outline" size="sm" asChild><Link to={adminHref.section("products")}>{t("open_products")}</Link></Button>
      </div>
      {isLoading ? <Loading t={t} /> : products.length === 0 ? <p className="text-sm text-muted-foreground">{t("products_empty")}</p> : (
        <ul className="divide-y rounded-xl border">
          {products.map((p) => (
            <li key={p.id}>
              <Link to={adminHref.product(p.id)} className="flex items-center gap-3 p-3 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">{p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                {!p.is_active && <Chip tone="amber">{t("badge_paused")}</Chip>}
                <span className="text-sm tabular-nums">{fmt.money(p.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Payouts({ vendor }: { vendor: AdminVendor }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const { data: payouts = [], isLoading } = useVendorPayouts(vendor.id);
  const savePayout = useSavePayout();
  const delPayout = useDeletePayout();
  const { ask, confirmSlot } = useInlineConfirm();
  const today = new Date().toISOString().slice(0, 10);
  const blank = () => ({ amount: vendor.totals.balance > 0 ? String(vendor.totals.balance) : "", paid_at: today, method: "", reference: "", note: "" });
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(blank);
  const [tried, setTried] = useState(false);
  const amount = Number(p.amount.replace(",", "."));
  const badAmount = !Number.isFinite(amount) || amount <= 0;

  const submit = async () => {
    setTried(true);
    if (badAmount) return;
    try {
      await savePayout.mutateAsync({ vendor_id: vendor.id, amount: Math.round(amount * 100) / 100, paid_at: p.paid_at || today, method: p.method, reference: p.reference, note: p.note });
      toast.success(t("payout_saved"));
      setOpen(false);
      setTried(false);
    } catch (x) {
      toast.error(errText(t, x));
    }
  };
  const remove = async (id: string, value: number) => {
    if (!(await ask(t("payout_delete_confirm", { v: fmt.money(value) }), { confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await delPayout.mutateAsync(id);
      toast.success(t("payout_deleted"));
    } catch (x) {
      toast.error(errText(t, x));
    }
  };

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />{t("payouts_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("payouts_d")}</p>
          <p className={cn("mt-1 text-sm font-semibold", vendor.totals.balance > 0 && "text-amber-700")}>{t("balance_line", { v: fmt.money(vendor.totals.balance) })}</p>
        </div>
        {!open && <Button size="sm" onClick={() => { setP(blank()); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />{t("payout_new")}</Button>}
      </div>
      {confirmSlot}
      <InlinePanel open={open} onClose={() => setOpen(false)} title={t("payout_new")} description={t("payout_new_d", { v: fmt.money(vendor.totals.balance) })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-amount">{t("payout_amount")} ({fmt.currency})</Label>
            <Input id="po-amount" inputMode="decimal" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") })} aria-invalid={tried && badAmount} />
            {tried && badAmount ? <p className="text-xs text-destructive">{t("payout_err_amount")}</p>
              : !badAmount && amount > vendor.totals.balance + 0.004 ? <p className="text-xs text-amber-700">{t("payout_over", { v: fmt.money(vendor.totals.balance) })}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-date">{t("payout_date")}</Label>
            <Input id="po-date" type="date" value={p.paid_at} max={today} onChange={(e) => setP({ ...p, paid_at: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-method">{t("payout_method")}</Label>
            <Input id="po-method" value={p.method} maxLength={60} onChange={(e) => setP({ ...p, method: e.target.value })} placeholder={t("payout_method_ph")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-ref">{t("payout_reference")}</Label>
            <Input id="po-ref" value={p.reference} maxLength={120} onChange={(e) => setP({ ...p, reference: e.target.value })} placeholder={t("payout_reference_ph")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="po-note">{t("payout_note")}</Label>
            <Textarea id="po-note" rows={2} maxLength={500} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={savePayout.isPending}>{savePayout.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("payout_new")}</Button>
        </div>
      </InlinePanel>
      {isLoading ? <Loading t={t} /> : payouts.length === 0 ? <p className="text-sm text-muted-foreground">{t("payouts_empty")}</p> : (
        <ul className="divide-y rounded-xl border">
          {payouts.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums">{fmt.money(x.amount)}</span>
                <span className="block text-xs text-muted-foreground">{[fmt.date(x.paid_at), x.method, x.reference, x.note].filter(Boolean).join(" · ")}</span>
              </span>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => void remove(x.id, x.amount)} aria-label={t("delete")}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Vendas ---------- */

function LedgerList({ vendorId }: { vendorId: string | null }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, isFetching } = useVendorLedger(vendorId, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!rows.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("sales_empty")}</p>;
  return (
    <div>
      {!vendorId && <p className="mb-3 text-sm text-muted-foreground">{t("sales_d")}</p>}
      <ul className={cn("divide-y rounded-[18px] border bg-card transition-opacity duration-150", isFetching && "opacity-70")}>
        {rows.map((r) => (
          <li key={r.id} className={cn("grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4", r.status === "cancelled" && "opacity-60")}>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{r.quantity} x {r.product_name ?? "-"}</span>
                {r.status === "cancelled" && <Chip tone="amber">{t("cancelled")}</Chip>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {fmt.date(r.created_at)}
                {!vendorId && <> · {r.vendor_name}</>}
                {" · "}
                <Link to={adminHref.order(r.order_id)} className="font-mono font-semibold text-foreground hover:underline">{t("order_ref", { ref: r.order_id.slice(0, 8) })}</Link>
              </span>
            </span>
            <span className="grid grid-cols-3 gap-4 text-right text-sm tabular-nums">
              <span><span className="block text-[11px] text-muted-foreground">{t("col_gross")}</span>{fmt.money(r.gross)}</span>
              <span><span className="block text-[11px] text-muted-foreground">{t("col_commission")} {r.commission_percent}%</span>{fmt.money(r.commission)}</span>
              <span><span className="block text-[11px] text-muted-foreground">{t("col_net")}</span><span className="font-semibold">{fmt.money(r.net)}</span></span>
            </span>
          </li>
        ))}
      </ul>
      <AdminPager page={page} pages={pages} total={total} from={(page - 1) * PAGE_SIZE + 1} to={Math.min(total, page * PAGE_SIZE)} onPage={setPage} />
    </div>
  );
}

/* ---------- Cadastros ---------- */

function Applications({ onOpenVendor }: { onOpenVendor: (id: string) => void }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const { data: apps = [], isLoading, error } = useVendorApplications();
  const [filter, setFilter] = useState<"new" | "decided">("new");
  const shown = apps.filter((a) => (filter === "new" ? a.status === "new" : a.status !== "new"));
  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{t("apps_title")}</h4>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("apps_d")}</p>
        </div>
        <Button variant="outline" size="sm" asChild><a href="/vender" target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("apps_open_page")}</a></Button>
      </div>
      <FilterChips<"new" | "decided"> label={t("tab_applications")} value={filter} onChange={setFilter} options={[
        { value: "new", label: t("f_new"), count: apps.filter((a) => a.status === "new").length, tone: "warning" },
        { value: "decided", label: t("f_decided"), count: apps.filter((a) => a.status !== "new").length },
      ]} />
      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("apps_empty")}</p> : (
        <ul className="space-y-3">{shown.map((a) => <ApplicationCard key={a.id} app={a} onOpenVendor={onOpenVendor} />)}</ul>
      )}
    </div>
  );
}

function ApplicationCard({ app, onOpenVendor }: { app: VendorApplication; onOpenVendor: (id: string) => void }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const fmt = useAdminFormat();
  const decide = useDecideApplication();
  const { ask, confirmSlot } = useInlineConfirm();
  const [note, setNote] = useState("");
  const run = async (approve: boolean) => {
    if (!approve && !(await ask(t("app_reject_confirm", { name: app.store_name }), { confirmLabel: t("app_reject"), tone: "danger" }))) return;
    try {
      const vendorId = await decide.mutateAsync({ id: app.id, approve, note });
      toast.success(approve ? t("app_approved_done") : t("app_rejected_done"));
      if (approve && vendorId) onOpenVendor(vendorId);
    } catch (x) {
      toast.error(errText(t, x));
    }
  };
  const status = app.status === "new" ? <Chip tone="orange">{t("app_new")}</Chip> : app.status === "approved" ? <Chip tone="emerald">{t("app_approved")}</Chip> : <Chip>{t("app_rejected")}</Chip>;
  return (
    <li className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{app.store_name}</span>{status}</p>
          <p className="text-xs text-muted-foreground">{fmt.dateTime(app.created_at)}{!app.user_id && ` · ${t("app_no_account")}`}</p>
        </div>
        {app.vendor_id && <Button variant="outline" size="sm" onClick={() => onOpenVendor(app.vendor_id!)}>{t("app_open_vendor")}</Button>}
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">{t("app_contact")}</dt><dd className="break-words">{[app.contact_name, app.email, app.phone].filter(Boolean).join(" · ")}</dd></div>
        {app.website && <div><dt className="text-xs text-muted-foreground">{t("app_site")}</dt><dd className="break-all">{app.website}</dd></div>}
        {app.message && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t("app_message")}</dt><dd className="whitespace-pre-line">{app.message}</dd></div>}
        {app.admin_note && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t("app_note")}</dt><dd>{app.admin_note}</dd></div>}
      </dl>
      {confirmSlot}
      {app.status === "new" && (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor={`app-note-${app.id}`}>{t("app_note")}</Label>
          <Textarea id={`app-note-${app.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("app_note_ph")} />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => void run(false)} disabled={decide.isPending}>{t("app_reject")}</Button>
            <Button onClick={() => void run(true)} disabled={decide.isPending}>{decide.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("app_approve")}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminMarketplaceMessages);
  const { data, isLoading } = useMarketplaceSettings();
  const save = useSaveMarketplaceSettings();
  const [f, setF] = useState<MarketplaceSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (isLoading || !f) return <Loading t={t} />;
  const bad = !Number.isFinite(f.default_commission) || f.default_commission < 0 || f.default_commission > 100;
  const submit = async () => {
    if (bad) return;
    try {
      await save.mutateAsync(f);
      toast.success(t("rules_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{t("rules_title")}</h4>
      <div className="space-y-1.5">
        <Label htmlFor="mk-pct">{t("r_commission")}</Label>
        <Input id="mk-pct" inputMode="decimal" className="max-w-[140px]" value={String(f.default_commission)}
          onChange={(e) => setF({ ...f, default_commission: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 })} aria-invalid={bad} />
        {bad ? <p className="text-xs text-destructive">{t("err_commission")}</p> : <p className="text-xs text-muted-foreground">{t("r_commission_d")}</p>}
      </div>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_apps")}</span><span className="block text-xs text-muted-foreground">{t("r_apps_d")}</span></span>
        <Switch checked={f.applications_open} onCheckedChange={(v) => setF({ ...f, applications_open: v })} aria-label={t("r_apps")} />
      </label>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_show")}</span><span className="block text-xs text-muted-foreground">{t("r_show_d")}</span></span>
        <Switch checked={f.show_vendor} onCheckedChange={(v) => setF({ ...f, show_vendor: v })} aria-label={t("r_show")} />
      </label>
      <div className="border-t pt-4">
        <p className="text-sm font-medium">{t("r_links")}</p>
        <p className="break-all text-xs text-muted-foreground">{t("r_links_d", { sell: `${siteUrl()}/vender`, vendor: `${siteUrl()}/vendedor/<...>` })}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending || bad}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}</Button>
      </div>
    </section>
  );
}

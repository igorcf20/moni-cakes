// =====================================================================================
// Admin > Marketing > Afiliados (recurso affiliates em Admin > Recursos da loja). Sem janelas:
//   Afiliados   números (visitas, vendas indicadas, comissões, a pagar), filtros e lista de parceiros
//   afiliado    (ver=afiliado&id=<id> ou id=novo) link, dados, comissão, situação; conta ligada (pelo e-mail);
//               pagamentos (painel na página para registrar); comissões; apagar só sem comissões nem pagamentos
//   Comissões   livro de comissões de todos os afiliados (affiliate_ledger), com a percentagem do momento
//   Cadastros   pedidos que chegam por /afiliados (afiliados em pending); aprovar ativa o link; recusar com nota
//   Regras      comissão padrão, dias do link, mínimo para pagar, aceitar cadastros
// Regras no banco (migration 20261007140000_affiliates.sql); contas em src/lib/affiliates.ts; dados em
// src/hooks/useAffiliates.ts; textos em src/i18n/adminAffiliates.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BadgePercent, ChevronRight, Copy, ExternalLink, Inbox, Link2, Loader2, MousePointerClick, Plus, Receipt, Search, Trash2,
  UserCheck, Users, Wallet,
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
import { useMessages } from "@/i18n";
import { adminAffiliatesMessages } from "@/i18n/adminAffiliates";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useAdminAffiliates, useAffiliateLedger, useAffiliatePayouts, useAffiliateSettings, useDecideAffiliate, useDeleteAffiliate,
  useDeleteAffiliatePayout, useLinkAffiliateUser, useSaveAffiliate, useSaveAffiliatePayout, useSaveAffiliateSettings,
  type AdminAffiliate, type AffiliateDraft,
} from "@/hooks/useAffiliates";
import {
  affiliateCode, affiliateDraftErrors, affiliateErrorOf, affiliateLink, conversionRate, normalizeAffiliateTotals, type AffiliateSettings,
} from "@/lib/affiliates";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminAffiliatesMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);
const ADMIN_ERRORS = new Set(["forbidden", "not_found", "user_not_found", "other_affiliate", "decided"]);
const errText = (t: T, e: unknown) => {
  const code = affiliateErrorOf((e as Error)?.message);
  return t(ADMIN_ERRORS.has(code) ? (`err_${code}` as "err_forbidden") : "err_unknown");
};
const pct = (v: number, locale: string) => `${v.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
const pctInput = (raw: string) => Number(raw.replace(",", ".").replace(/[^\d.]/g, "")) || 0;

function Chip({ tone = "muted", children }: { tone?: "muted" | "orange" | "amber" | "emerald"; children: React.ReactNode }) {
  const cls = tone === "orange" ? "bg-primary/10 text-brand-orange-text" : tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{children}</span>;
}

function StatusChip({ t, status }: { t: T; status: AdminAffiliate["status"] }) {
  if (status === "active") return <Chip tone="emerald">{t("badge_active")}</Chip>;
  if (status === "paused") return <Chip tone="amber">{t("badge_paused")}</Chip>;
  if (status === "pending") return <Chip tone="orange">{t("badge_pending")}</Chip>;
  return <Chip>{t("badge_rejected")}</Chip>;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";

async function copyText(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    /* sem área de transferência: o link continua visível para copiar à mão */
  }
}

export default function AdminAffiliates() {
  const { t } = useMessages(adminAffiliatesMessages);
  const page = useAdminPage();
  const { data: list = [] } = useAdminAffiliates();
  const newApps = list.filter((a) => a.status === "pending").length;
  const tab = ["comissoes", "cadastros", "regras"].includes(page.tab ?? "") ? page.tab! : "afiliados";
  if (page.view === "afiliado" && page.id) return <AffiliateEditPage id={page.id} onBack={page.close} onOpen={(id) => page.open("afiliado", id)} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="affiliates" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="afiliados" className="px-4">{t("tab_affiliates")}</TabsTrigger>
          <TabsTrigger value="comissoes" className="px-4">{t("tab_commissions")}</TabsTrigger>
          <TabsTrigger value="cadastros" className="gap-1.5 px-4">
            {t("tab_applications")}
            {newApps > 0 && <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{newApps}</span>}
          </TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="afiliados" className="mt-5"><AffiliateList onOpen={(id) => page.open("afiliado", id)} newApps={newApps} onApps={() => page.setTab("cadastros")} /></TabsContent>
        <TabsContent value="comissoes" className="mt-5"><LedgerList affiliateId={null} /></TabsContent>
        <TabsContent value="cadastros" className="mt-5"><Applications onOpen={(id) => page.open("afiliado", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Afiliados ---------- */

type ListFilter = "all" | "active" | "paused" | "balance" | "rejected";

function AffiliateList({ onOpen, newApps, onApps }: { onOpen: (id: string) => void; newApps: number; onApps: () => void }) {
  const { t, locale } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const { data: all = [], isLoading, error } = useAdminAffiliates();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  // Os pedidos de cadastro ficam na aba Cadastros.
  const list = useMemo(() => all.filter((a) => a.status !== "pending"), [all]);
  const sum = useMemo(() => list.reduce((s, a) => ({
    visits: s.visits + a.totals.visits, visits_30d: s.visits_30d + a.totals.visits_30d, orders: s.orders + a.totals.orders,
    sales: s.sales + a.totals.sales, commission: s.commission + a.totals.commission, pending: s.pending + a.totals.pending,
    balance: s.balance + a.totals.balance, paid: s.paid + a.totals.paid,
  }), { visits: 0, visits_30d: 0, orders: 0, sales: 0, commission: 0, pending: 0, balance: 0, paid: 0 }), [list]);
  const shown = list.filter((a) => {
    if (filter === "all" && a.status === "rejected") return false;
    if (filter === "active" && a.status !== "active") return false;
    if (filter === "paused" && a.status !== "paused") return false;
    if (filter === "rejected" && a.status !== "rejected") return false;
    if (filter === "balance" && a.totals.balance <= 0) return false;
    const s = q.trim().toLowerCase();
    return !s || a.name.toLowerCase().includes(s) || (a.email ?? "").toLowerCase().includes(s) || a.code.includes(s);
  });

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;

  const appsBanner = newApps > 0 && (
    <button type="button" onClick={onApps} className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-primary/30 bg-primary/5 p-4 text-left text-sm font-medium transition-colors duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex items-center gap-2"><Inbox className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("stat_new_apps")}: {newApps}</span>
      <ChevronRight className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />
    </button>
  );

  if (!list.length) {
    return (
      <div className="space-y-4">
        {appsBanner}
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
        </div>
      </div>
    );
  }

  const count = (s: string) => list.filter((a) => a.status === s).length;
  const active = count("active");
  const paused = count("paused");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={UserCheck} label={t("stat_active")} value={active} hint={paused === 1 ? t("stat_paused_one") : paused ? t("stat_paused", { n: paused }) : undefined} />
        <AdminStatCard icon={MousePointerClick} label={t("stat_visits")} value={sum.visits}
          hint={`${t("stat_visits_30d", { n: sum.visits_30d })} · ${t("stat_conversion")} ${pct(conversionRate(sum), locale)}`} />
        <AdminStatCard icon={Receipt} label={t("stat_sales")} value={fmt.money(sum.sales)} hint={t("stat_orders", { n: sum.orders })} />
        <AdminStatCard icon={Wallet} label={t("stat_balance")} value={fmt.money(sum.balance)} tone={sum.balance > 0 ? "warning" : "default"}
          hint={sum.pending > 0 ? t("stat_pending", { v: fmt.money(sum.pending) }) : t("stat_paid", { v: fmt.money(sum.paid) })}
          onClick={() => setFilter("balance")} active={filter === "balance"} />
      </div>
      {appsBanner}

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
            { value: "all", label: t("f_all"), count: active + paused },
            { value: "active", label: t("f_active"), count: active },
            { value: "paused", label: t("f_paused"), count: paused },
            { value: "balance", label: t("f_balance"), count: list.filter((a) => a.totals.balance > 0).length, tone: "warning" },
            { value: "rejected", label: t("f_rejected"), count: count("rejected") },
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
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-brand-orange-text">{initials(a.name)}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{a.name}</span>
                      <Chip tone="orange">{t("commission_n", { n: a.commission_percent })}</Chip>
                      {a.status !== "active" && <StatusChip t={t} status={a.status} />}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {[`?ref=${a.code}`, t("visits_n", { n: a.totals.visits }), a.totals.orders === 1 ? t("orders_one") : t("orders_n", { n: a.totals.orders }),
                        a.totals.last_order ? t("last_order", { when: fmt.relative(a.totals.last_order) }) : t("no_orders")].join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-4 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{fmt.money(a.totals.sales)}</span>
                    <span className="block text-xs text-muted-foreground">{t("row_sales")}</span>
                  </span>
                  <span className="text-right">
                    <span className={cn("block font-semibold tabular-nums", a.totals.balance > 0 && "text-amber-700")}>{fmt.money(a.totals.balance)}</span>
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

/* ---------- Página do afiliado ---------- */

const EMPTY: AffiliateDraft = { code: "", name: "", email: null, phone: null, website: null, commission_percent: 5, status: "active", payout_info: null, notes: null };

function AffiliateEditPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t, locale } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const isNew = id === "novo";
  const { data: list = [], isLoading } = useAdminAffiliates();
  const { data: settings } = useAffiliateSettings();
  const a = list.find((x) => x.id === id);
  const save = useSaveAffiliate();
  const del = useDeleteAffiliate();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<AffiliateDraft>(EMPTY);
  const [codeTouched, setCodeTouched] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (a) {
      setF({ code: a.code, name: a.name, email: a.email, phone: a.phone, website: a.website, commission_percent: a.commission_percent, status: a.status, payout_info: a.payout_info, notes: a.notes });
      setCodeTouched(true);
    } else if (isNew) {
      setF({ ...EMPTY, commission_percent: settings?.default_commission ?? 5 });
    }
  }, [a, isNew, settings?.default_commission]);

  if (isLoading) return <Loading t={t} />;
  if (!isNew && !a) {
    return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("load_error")}</p></AdminSubpage>;
  }

  const errs = affiliateDraftErrors(f, list, isNew ? null : id);
  const totals = a?.totals ?? normalizeAffiliateTotals({});
  const set = <K extends keyof AffiliateDraft>(k: K, val: AffiliateDraft[K]) => setF((p) => ({ ...p, [k]: val }));
  const setName = (name: string) => setF((p) => ({ ...p, name, code: codeTouched ? p.code : affiliateCode(name) }));
  const canDelete = totals.orders === 0 && totals.paid === 0;
  const link = a ? affiliateLink(siteUrl(), a.code) : "";
  // Um cadastro pendente ou recusado é decidido na aba Cadastros; aqui só se escolhe entre ativo e pausado.
  const statusChoices: AffiliateDraft["status"][] = ["active", "paused"];

  const submit = async () => {
    setTried(true);
    if (errs.length) return;
    try {
      const newId = await save.mutateAsync({ id: isNew ? null : id, draft: f });
      toast.success(t("saved"));
      if (isNew) onOpen(newId);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? "").includes("affiliates_code_key") ? t("err_code_taken") : t("save_error"));
    }
  };
  const remove = async () => {
    if (!a) return;
    if (!canDelete) { toast.error(t("delete_blocked")); return; }
    if (!(await ask(t("delete_confirm", { name: a.name }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(a.id);
      toast.success(t("deleted"));
      onBack();
    } catch (e) {
      toast.error(errText(t, e));
    }
  };

  return (
    <AdminSubpage
      title={isNew ? t("new") : a!.name}
      subtitle={isNew ? t("new_d") : [t("commission_n", { n: a!.commission_percent }), `?ref=${a!.code}`].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
      )}
    >
      {confirmSlot}
      {!isNew && a && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={MousePointerClick} label={t("stat_visits")} value={totals.visits}
              hint={`${t("stat_visits_30d", { n: totals.visits_30d })} · ${t("stat_conversion")} ${pct(conversionRate(totals), locale)}`} />
            <AdminStatCard icon={Receipt} label={t("stat_sales")} value={fmt.money(totals.sales)} hint={t("stat_orders", { n: totals.orders })} />
            <AdminStatCard icon={BadgePercent} label={t("stat_commission")} value={fmt.money(totals.commission)} tone="success"
              hint={totals.pending > 0 ? t("stat_pending", { v: fmt.money(totals.pending) }) : undefined} />
            <AdminStatCard icon={Wallet} label={t("stat_balance")} value={fmt.money(totals.balance)} tone={totals.balance > 0 ? "warning" : "default"}
              hint={t("stat_paid", { v: fmt.money(totals.paid) })} />
          </div>

          {(a.status === "active" || a.status === "paused") && (
            <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
              <div>
                <h4 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />{t("link_title")}</h4>
                <p className="text-sm text-muted-foreground">{t("link_d")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={link} aria-label={t("link_title")} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" onClick={() => void copyText(link, t("copied"))}><Copy className="mr-1.5 h-4 w-4" />{t("copy")}</Button>
                <Button variant="ghost" asChild><a href={link} target="_blank" rel="noreferrer" aria-label={t("link_title")}><ExternalLink className="h-4 w-4" /></a></Button>
              </div>
            </section>
          )}
        </>
      )}

      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("form_title")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="af-name">{t("fl_name")}</Label>
            <Input id="af-name" value={f.name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("fl_name_ph")} aria-invalid={tried && errs.includes("name")} />
            {tried && errs.includes("name") && <p className="text-xs text-destructive">{t("err_name")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-code">{t("fl_code")}</Label>
            <Input id="af-code" value={f.code} maxLength={40} className="font-mono"
              onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
              aria-invalid={(tried && errs.includes("code")) || errs.includes("code_taken")} />
            {errs.includes("code_taken") ? <p className="text-xs text-destructive">{t("err_code_taken")}</p>
              : tried && errs.includes("code") ? <p className="text-xs text-destructive">{t("err_code")}</p>
              : <p className="text-xs text-muted-foreground">{t("fl_code_d")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-email">{t("fl_email")}</Label>
            <Input id="af-email" type="email" value={f.email ?? ""} maxLength={200} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-phone">{t("fl_phone")}</Label>
            <Input id="af-phone" type="tel" value={f.phone ?? ""} maxLength={40} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="af-site">{t("fl_website")}</Label>
            <Input id="af-site" value={f.website ?? ""} maxLength={300} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="af-pct">{t("fl_commission")}</Label>
            <Input id="af-pct" inputMode="decimal" className="max-w-[140px]" value={String(f.commission_percent)}
              onChange={(e) => set("commission_percent", pctInput(e.target.value))} aria-invalid={errs.includes("commission")} />
            {errs.includes("commission") ? <p className="text-xs text-destructive">{t("err_commission")}</p> : <p className="text-xs text-muted-foreground">{t("fl_commission_d")}</p>}
          </div>
          {(isNew || f.status === "active" || f.status === "paused") && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("fl_status")}</legend>
              {statusChoices.map((s) => (
                <label key={s} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors duration-150", f.status === s ? "border-primary bg-primary/5" : "hover:border-primary/40")}>
                  <input type="radio" name="af-status" className="accent-[hsl(var(--primary))]" checked={f.status === s} onChange={() => set("status", s)} />
                  {s === "active" ? t("fl_status_active") : t("fl_status_paused")}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="af-payout">{t("fl_payout")}</Label>
            <Textarea id="af-payout" rows={2} maxLength={1000} value={f.payout_info ?? ""} onChange={(e) => set("payout_info", e.target.value)} placeholder={t("fl_payout_ph")} />
            <p className="text-xs text-muted-foreground">{t("fl_payout_d")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-notes">{t("fl_notes")}</Label>
            <Textarea id="af-notes" rows={2} maxLength={2000} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder={t("fl_notes_ph")} />
          </div>
          {a?.message && (
            <div className="space-y-1 sm:col-span-2">
              <p className="text-sm font-medium">{t("fl_message")}</p>
              <p className="whitespace-pre-line rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{a.message}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isNew ? t("create") : t("save")}</Button>
        </div>
      </section>

      {!isNew && a && (
        <>
          <Account affiliate={a} />
          <Payouts affiliate={a} />
          <section className="space-y-3">
            <div>
              <h4 className="font-semibold">{t("tab_commissions")}</h4>
              <p className="text-sm text-muted-foreground">{t("commissions_d")}</p>
            </div>
            <LedgerList affiliateId={a.id} />
          </section>
        </>
      )}
    </AdminSubpage>
  );
}

function Account({ affiliate }: { affiliate: AdminAffiliate }) {
  const { t } = useMessages(adminAffiliatesMessages);
  const linkUser = useLinkAffiliateUser();
  const { ask, confirmSlot } = useInlineConfirm();
  const [email, setEmail] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await linkUser.mutateAsync({ affiliateId: affiliate.id, email });
      setEmail("");
      toast.success(t("account_linked"));
    } catch (x) {
      toast.error(errText(t, x));
    }
  };
  const unlink = async () => {
    if (!(await ask(t("account_unlink"), { description: affiliate.account_email ?? undefined, confirmLabel: t("account_unlink"), tone: "warning" }))) return;
    try {
      await linkUser.mutateAsync({ affiliateId: affiliate.id, email: "" });
      toast.success(t("account_unlinked"));
    } catch (x) {
      toast.error(errText(t, x));
    }
  };

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h4 className="flex items-center gap-2 font-semibold"><UserCheck className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />{t("account_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("account_d")}</p>
      </div>
      {confirmSlot}
      {affiliate.user_id ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
          <span className="min-w-0 truncate text-sm font-medium">{affiliate.account_email ?? affiliate.user_id}</span>
          <Button variant="ghost" size="sm" onClick={() => void unlink()} disabled={linkUser.isPending}>{t("account_unlink")}</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("account_none")}</p>
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="af-account">{t("account_email")}</Label>
              <Input id="af-account" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="pessoa@exemplo.com" />
            </div>
            <Button type="submit" variant="outline" disabled={linkUser.isPending || !email.trim()}>
              {linkUser.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}{t("account_link")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">{t("account_hint")}</p>
        </>
      )}
    </section>
  );
}

function Payouts({ affiliate }: { affiliate: AdminAffiliate }) {
  const { t } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const { data: payouts = [], isLoading } = useAffiliatePayouts(affiliate.id);
  const savePayout = useSaveAffiliatePayout();
  const delPayout = useDeleteAffiliatePayout();
  const { ask, confirmSlot } = useInlineConfirm();
  const balance = affiliate.totals.balance;
  const today = new Date().toISOString().slice(0, 10);
  const blank = () => ({ amount: balance > 0 ? String(balance) : "", paid_at: today, method: "", reference: "", note: "" });
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(blank);
  const [tried, setTried] = useState(false);
  const amount = Number(p.amount.replace(",", "."));
  const badAmount = !Number.isFinite(amount) || amount <= 0;

  const submit = async () => {
    setTried(true);
    if (badAmount) return;
    try {
      await savePayout.mutateAsync({ affiliate_id: affiliate.id, amount: Math.round(amount * 100) / 100, paid_at: p.paid_at || today, method: p.method, reference: p.reference, note: p.note });
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
          <p className={cn("mt-1 text-sm font-semibold", balance > 0 && "text-amber-700")}>{t("balance_line", { v: fmt.money(balance) })}</p>
          {affiliate.totals.pending > 0 && <p className="text-xs text-muted-foreground">{t("pending_line", { v: fmt.money(affiliate.totals.pending) })}</p>}
          {affiliate.payout_info && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{t("info_line", { info: affiliate.payout_info })}</p>}
        </div>
        {!open && <Button size="sm" onClick={() => { setP(blank()); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />{t("payout_new")}</Button>}
      </div>
      {confirmSlot}
      <InlinePanel open={open} onClose={() => setOpen(false)} title={t("payout_new")} description={t("payout_new_d", { v: fmt.money(balance) })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-amount">{t("payout_amount")} ({fmt.currency})</Label>
            <Input id="ap-amount" inputMode="decimal" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") })} aria-invalid={tried && badAmount} />
            {tried && badAmount ? <p className="text-xs text-destructive">{t("payout_err_amount")}</p>
              : !badAmount && amount > balance + 0.004 ? <p className="text-xs text-amber-700">{t("payout_over", { v: fmt.money(balance) })}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-date">{t("payout_date")}</Label>
            <Input id="ap-date" type="date" value={p.paid_at} max={today} onChange={(e) => setP({ ...p, paid_at: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-method">{t("payout_method")}</Label>
            <Input id="ap-method" value={p.method} maxLength={60} onChange={(e) => setP({ ...p, method: e.target.value })} placeholder={t("payout_method_ph")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-ref">{t("payout_reference")}</Label>
            <Input id="ap-ref" value={p.reference} maxLength={120} onChange={(e) => setP({ ...p, reference: e.target.value })} placeholder={t("payout_reference_ph")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ap-note">{t("payout_note")}</Label>
            <Textarea id="ap-note" rows={2} maxLength={500} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} />
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

/* ---------- Comissões ---------- */

function LedgerList({ affiliateId }: { affiliateId: string | null }) {
  const { t } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, isFetching } = useAffiliateLedger(affiliateId, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!rows.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("commissions_empty")}</p>;
  return (
    <div>
      {!affiliateId && <p className="mb-3 text-sm text-muted-foreground">{t("commissions_d")}</p>}
      <ul className={cn("divide-y rounded-[18px] border bg-card transition-opacity duration-150", isFetching && "opacity-70")}>
        {rows.map((r) => (
          <li key={r.id} className={cn("grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4", r.status === "cancelled" && "opacity-60")}>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <Link to={adminHref.order(r.order_id)} className="font-mono text-sm font-semibold hover:underline">{t("order_ref", { ref: r.order_id.slice(0, 8) })}</Link>
                {r.status === "cancelled" && <Chip tone="amber">{t("cancelled")}</Chip>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {fmt.date(r.created_at)}
                {!affiliateId && <> · {r.affiliate_name}</>}
              </span>
            </span>
            <span className="grid grid-cols-2 gap-4 text-right text-sm tabular-nums">
              <span><span className="block text-[11px] text-muted-foreground">{t("col_base")}</span>{fmt.money(r.base)}</span>
              <span><span className="block text-[11px] text-muted-foreground">{t("col_commission")} {r.commission_percent}%</span><span className="font-semibold">{fmt.money(r.commission)}</span></span>
            </span>
          </li>
        ))}
      </ul>
      <AdminPager page={page} pages={pages} total={total} from={(page - 1) * PAGE_SIZE + 1} to={Math.min(total, page * PAGE_SIZE)} onPage={setPage} />
    </div>
  );
}

/* ---------- Cadastros ---------- */

function Applications({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminAffiliatesMessages);
  const { data: all = [], isLoading, error } = useAdminAffiliates();
  const apps = all.filter((a) => a.status === "pending");
  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{t("apps_title")}</h4>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("apps_d")}</p>
        </div>
        <Button variant="outline" size="sm" asChild><a href="/afiliados" target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("apps_open_page")}</a></Button>
      </div>
      {apps.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("apps_empty")}</p> : (
        <ul className="space-y-3">{apps.map((a) => <ApplicationCard key={a.id} app={a} onOpen={onOpen} />)}</ul>
      )}
    </div>
  );
}

function ApplicationCard({ app, onOpen }: { app: AdminAffiliate; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const decide = useDecideAffiliate();
  const { ask, confirmSlot } = useInlineConfirm();
  const [note, setNote] = useState("");
  const run = async (approve: boolean) => {
    if (!approve && !(await ask(t("app_reject_confirm", { name: app.name }), { confirmLabel: t("app_reject"), tone: "danger" }))) return;
    try {
      await decide.mutateAsync({ id: app.id, approve, note });
      toast.success(approve ? t("app_approved") : t("app_rejected"));
      if (approve) onOpen(app.id);
    } catch (x) {
      toast.error(errText(t, x));
    }
  };
  return (
    <li className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{app.name}</span><StatusChip t={t} status={app.status} /></p>
        <p className="text-xs text-muted-foreground">{fmt.dateTime(app.created_at)} · {t("app_code", { code: app.code })}</p>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">{t("app_contact")}</dt><dd className="break-words">{[app.email, app.phone, app.account_email && app.account_email !== app.email ? app.account_email : null].filter(Boolean).join(" · ")}</dd></div>
        {app.website && <div><dt className="text-xs text-muted-foreground">{t("app_site")}</dt><dd className="break-all">{app.website}</dd></div>}
        {app.message && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t("app_message")}</dt><dd className="whitespace-pre-line">{app.message}</dd></div>}
      </dl>
      {confirmSlot}
      <div className="space-y-2 border-t pt-3">
        <Label htmlFor={`afapp-note-${app.id}`}>{t("app_note")}</Label>
        <Textarea id={`afapp-note-${app.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("app_note_ph")} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => void run(false)} disabled={decide.isPending}>{t("app_reject")}</Button>
          <Button onClick={() => void run(true)} disabled={decide.isPending}>{decide.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("app_approve")}</Button>
        </div>
      </div>
    </li>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminAffiliatesMessages);
  const fmt = useAdminFormat();
  const { data, isLoading } = useAffiliateSettings();
  const save = useSaveAffiliateSettings();
  const [f, setF] = useState<AffiliateSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (isLoading || !f) return <Loading t={t} />;
  const badPct = !Number.isFinite(f.default_commission) || f.default_commission < 0 || f.default_commission > 100;
  const badDays = !Number.isInteger(f.cookie_days) || f.cookie_days < 1 || f.cookie_days > 365;
  const submit = async () => {
    if (badPct || badDays) return;
    try {
      await save.mutateAsync({ ...f, min_payout: Math.max(0, Math.round(f.min_payout * 100) / 100) });
      toast.success(t("rules_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{t("rules_title")}</h4>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="afr-pct">{t("r_commission")}</Label>
          <Input id="afr-pct" inputMode="decimal" className="max-w-[140px]" value={String(f.default_commission)}
            onChange={(e) => setF({ ...f, default_commission: pctInput(e.target.value) })} aria-invalid={badPct} />
          {badPct ? <p className="text-xs text-destructive">{t("err_commission_rule")}</p> : <p className="text-xs text-muted-foreground">{t("r_commission_d")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="afr-days">{t("r_days")}</Label>
          <Input id="afr-days" inputMode="numeric" className="max-w-[140px]" value={String(f.cookie_days)}
            onChange={(e) => setF({ ...f, cookie_days: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-invalid={badDays} />
          {badDays ? <p className="text-xs text-destructive">{t("err_days")}</p> : <p className="text-xs text-muted-foreground">{t("r_days_d")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="afr-min">{t("r_min")} ({fmt.currency})</Label>
          <Input id="afr-min" inputMode="decimal" className="max-w-[160px]" value={String(f.min_payout)}
            onChange={(e) => setF({ ...f, min_payout: pctInput(e.target.value) })} />
          <p className="text-xs text-muted-foreground">{t("r_min_d")}</p>
        </div>
      </div>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_apps")}</span><span className="block text-xs text-muted-foreground">{t("r_apps_d")}</span></span>
        <Switch checked={f.applications_open} onCheckedChange={(v) => setF({ ...f, applications_open: v })} aria-label={t("r_apps")} />
      </label>
      <div className="border-t pt-4">
        <p className="text-sm font-medium">{t("r_links")}</p>
        <p className="break-all text-xs text-muted-foreground">{t("r_links_d", { page: `${siteUrl()}/afiliados`, example: affiliateLink(siteUrl(), "codigo") })}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending || badPct || badDays}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}</Button>
      </div>
    </section>
  );
}

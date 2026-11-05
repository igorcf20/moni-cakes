// =====================================================================================
// Admin > Vendas > PunchOut (recurso punchout em Admin > Recursos da loja). Sem janelas:
//   Empresas     números (empresas ativas, carrinhos enviados, valor, pedidos de compra) e a lista das empresas
//   empresa      (ver=empresa&id=<id>|novo) nome, protocolo (cXML ou OCI), login e senha (gerar e copiar), conta de
//                cliente (preços e dona dos pedidos), país, frete por pedido, UNSPSC, endereços de retorno, tempo do
//                acesso; ao lado: endereço para o sistema de compras, exemplo de entrada, testar e últimos acessos
//   Acessos      cada entrada do sistema de compras: situação, quem comprou, itens e valor enviados
//   Pedidos      pedidos de compra recebidos (cXML OrderRequest): pedido criado ou motivo da recusa, aviso de total
//   Como ligar   endereço da loja e o que cada protocolo envia e recebe
// Regras no banco (migration 20261007200000_punchout.sql) e na Edge Function punchout; contas em src/lib/punchout.ts;
// dados em src/hooks/usePunchout.ts; textos em src/i18n/adminPunchout.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, Check, ChevronDown, ChevronRight, ClipboardCheck, Copy, Eye, EyeOff, FileText, FlaskConical, KeyRound, Loader2,
  Plus, Send, ShoppingCart, Trash2, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminPunchoutMessages } from "@/i18n/adminPunchout";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminCustomerOptions } from "@/hooks/useCustomerGroups";
import { useFeature } from "@/hooks/useFeatures";
import {
  useDeletePunchoutBuyer, usePunchoutBuyers, usePunchoutOrders, usePunchoutSessions, usePunchoutStats, useSavePunchoutBuyer,
  useTestPunchoutSession, type AdminPunchoutOrder, type AdminPunchoutSession,
} from "@/hooks/usePunchout";
import { useCountries } from "@/lib/countries";
import {
  buyerErrorOf, buyerErrors, CXML_DOMAINS, draftOf, EMPTY_BUYER, EMPTY_PUNCHOUT_STATS, endpointUrl, generateSecret, ociStartUrl, sampleSetupRequest,
  SECRET_MIN, SESSION_MINUTE_OPTIONS, sessionStatus, type BuyerDraft, type BuyerError, type PunchoutBuyer, type SessionStatus,
} from "@/lib/punchout";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminPunchoutMessages["pt-BR"]>>["t"];

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);

const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function CopyButton({ value, t, className }: { value: string; t: T; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1600); } catch { /* sem área de transferência */ }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className={className}>
      {done ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}{done ? t("copied") : t("copy")}
    </Button>
  );
}

const SESSION_TONE: Record<SessionStatus, string> = {
  open: "bg-sky-50 text-sky-700",
  returned: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-amber-50 text-amber-800",
};
const Chip = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", className)}>{children}</span>
);

export default function AdminPunchout() {
  const { t } = useMessages(adminPunchoutMessages);
  const page = useAdminPage();
  if (page.view === "empresa" && page.id) return <BuyerPage id={page.id === "novo" ? null : page.id} onBack={page.close} onSaved={(id) => page.open("empresa", id)} />;
  const tab = ["acessos", "pedidos", "ligar"].includes(page.tab ?? "") ? page.tab! : "empresas";
  return (
    <div className="space-y-5">
      <AdminHelp id="punchout" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="empresas" className="px-4">{t("tab_buyers")}</TabsTrigger>
          <TabsTrigger value="acessos" className="px-4">{t("tab_sessions")}</TabsTrigger>
          <TabsTrigger value="pedidos" className="px-4">{t("tab_orders")}</TabsTrigger>
          <TabsTrigger value="ligar" className="px-4">{t("tab_connect")}</TabsTrigger>
        </TabsList>
        <TabsContent value="empresas" className="mt-5"><BuyerList onOpen={(id) => page.open("empresa", id)} onTab={page.setTab} /></TabsContent>
        <TabsContent value="acessos" className="mt-5"><SessionList /></TabsContent>
        <TabsContent value="pedidos" className="mt-5"><OrderList /></TabsContent>
        <TabsContent value="ligar" className="mt-5"><Connect /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Empresas ---------- */

function BuyerList({ onOpen, onTab }: { onOpen: (id: string) => void; onTab: (tab: string) => void }) {
  const { t } = useMessages(adminPunchoutMessages);
  const fmt = useAdminFormat();
  const { data: buyers = [], isLoading, error } = usePunchoutBuyers();
  const { data: stats = EMPTY_PUNCHOUT_STATS } = usePunchoutStats();
  const { data: customers = [] } = useAdminCustomerOptions();
  const account = useMemo(() => new Map(customers.map((c) => [c.user_id, c.full_name || c.email || ""])), [customers]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Building2} label={t("stat_buyers")} value={stats.buyers.toLocaleString()} />
        <AdminStatCard icon={ShoppingCart} label={t("stat_returned")} value={stats.returned_30d.toLocaleString()} hint={t("stat_returned_hint", { n: stats.sessions_30d })} onClick={() => onTab("acessos")} />
        <AdminStatCard icon={Send} label={t("stat_carts_value")} value={fmt.money(stats.carts_value_30d)} hint={t("stat_carts_value_hint")} />
        <AdminStatCard icon={ClipboardCheck} label={t("stat_orders")} value={stats.orders_30d.toLocaleString()}
          hint={stats.rejected_30d ? t("stat_rejected_hint", { n: stats.rejected_30d }) : t("stat_orders_hint", { value: fmt.money(stats.orders_value_30d) })}
          tone={stats.rejected_30d || stats.mismatch_30d ? "warning" : "default"} onClick={() => onTab("pedidos")} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_buyer")}</Button>
      </div>
      {buyers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">{t("empty_buyers")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {buyers.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b.id)}
                className="flex w-full items-center gap-4 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-orange-soft text-brand-orange-text"><Building2 className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.name}</span>
                    <Chip className="bg-muted text-foreground">{t(b.protocol === "oci" ? "proto_oci" : "proto_cxml")}</Chip>
                    <Chip className={b.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>{b.is_active ? t("active") : t("inactive")}</Chip>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {[b.protocol === "oci" ? b.oci_username : `${b.cxml_domain} ${b.cxml_identity}`,
                      b.user_id ? account.get(b.user_id) : t("no_account"),
                      b.last_used_at ? t("last_used", { when: fmt.relative(b.last_used_at) }) : t("never_used")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Página da empresa ---------- */

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BuyerPage({ id, onBack, onSaved }: { id: string | null; onBack: () => void; onSaved: (id: string) => void }) {
  const { t, locale } = useMessages(adminPunchoutMessages);
  const fmt = useAdminFormat();
  const { ask, confirmSlot } = useInlineConfirm();
  const { data: buyers = [], isLoading } = usePunchoutBuyers();
  const { data: customers = [] } = useAdminCustomerOptions();
  const { data: countries = [] } = useCountries();
  const save = useSavePunchoutBuyer();
  const del = useDeletePunchoutBuyer();
  const test = useTestPunchoutSession();
  const buyer = id ? buyers.find((b) => b.id === id) ?? null : null;
  const [draft, setDraft] = useState<BuyerDraft>(EMPTY_BUYER);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [tried, setTried] = useState(false);
  const [accountQ, setAccountQ] = useState("");
  useEffect(() => { if (buyer) setDraft(draftOf(buyer)); }, [buyer]);

  if (isLoading) return <Loading t={t} />;
  if (id && !buyer) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("err_not_found")}</p></AdminSubpage>;

  const set = <K extends keyof BuyerDraft>(k: K, v: BuyerDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const errs = buyerErrors(draft, !id, secret);
  const err = (k: BuyerError) => (tried && errs.includes(k) ? t(`err_${k}`) : null);
  const region = (code: string) => { try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; } catch { return code; } };
  const q = accountQ.trim().toLowerCase();
  const accountOptions = customers.filter((c) => !c.is_admin && (!q || `${c.full_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q) || c.user_id === draft.user_id)).slice(0, 200);
  const endpoint = endpointUrl(siteUrl());

  const submit = async () => {
    setTried(true);
    if (errs.length) { toast.error(t(`err_${errs[0]}`)); return; }
    try {
      const saved = await save.mutateAsync({ id, draft, secret });
      toast.success(id ? t("saved") : t("created"));
      setSecret(""); setGenerated(false); setTried(false);
      if (!id) onSaved(saved);
    } catch (e) {
      toast.error(t(`err_${buyerErrorOf((e as Error)?.message)}`));
    }
  };
  const remove = async () => {
    if (!buyer || !(await ask(t("delete_confirm", { name: buyer.name }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try { await del.mutateAsync(buyer.id); toast.success(t("deleted")); onBack(); } catch { toast.error(t("save_error")); }
  };
  const runTest = async () => {
    if (!buyer) return;
    try {
      const token = await test.mutateAsync(buyer.id);
      window.open(`${siteUrl()}/punchout/entrar?s=${token}`, "_blank", "noopener");
      toast.success(t("test_opened"));
    } catch (e) {
      toast.error(String((e as Error)?.message ?? "").includes("feature_off") ? t("err_feature_off") : t("save_error"));
    }
  };

  return (
    <AdminSubpage
      title={buyer ? buyer.name : t("new_title")}
      subtitle={buyer ? [t(buyer.protocol === "oci" ? "proto_oci" : "proto_cxml"), buyer.is_active ? t("active") : t("inactive"),
        buyer.last_used_at ? t("last_used", { when: fmt.relative(buyer.last_used_at) }) : t("never_used")].join(" · ") : undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={buyer ? (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
      ) : undefined}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {/* Empresa */}
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <h4 className="font-semibold">{t("sec_company")}</h4>
            <Field id="po-name" label={t("f_name")} error={err("name")}>
              <Input id="po-name" value={draft.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder={t("f_name_ph")} />
            </Field>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_active")}</span><span className="block text-xs text-muted-foreground">{t("f_active_d")}</span></span>
              <Switch checked={draft.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </label>
            <Field id="po-notes" label={t("f_notes")}>
              <Textarea id="po-notes" rows={2} maxLength={1000} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("f_notes_ph")} />
            </Field>
          </section>

          {/* Ligação */}
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <div>
              <h4 className="font-semibold">{t("sec_connection")}</h4>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("sec_connection_d")}</p>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">{t("f_protocol")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["cxml", "oci"] as const).map((p) => (
                  <label key={p} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors duration-150",
                    draft.protocol === p ? "border-primary bg-brand-orange-soft/60" : "hover:border-primary/40")}>
                    <input type="radio" name="po-protocol" value={p} checked={draft.protocol === p} onChange={() => set("protocol", p)} className="mt-1 accent-[hsl(var(--primary))]" />
                    <span>
                      <span className="block text-sm font-semibold">{t(p === "cxml" ? "f_protocol_cxml" : "f_protocol_oci")}</span>
                      <span className="block text-xs text-muted-foreground">{t(p === "cxml" ? "f_protocol_cxml_d" : "f_protocol_oci_d")}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.protocol === "cxml" ? (
              <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                <Field id="po-domain" label={t("f_domain")} hint={t("f_domain_d")}>
                  <select id="po-domain" value={draft.cxml_domain} onChange={(e) => set("cxml_domain", e.target.value)} className={select}>
                    {[...new Set([draft.cxml_domain, ...CXML_DOMAINS])].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field id="po-identity" label={t("f_identity")} hint={t("f_identity_d")} error={err("login")}>
                  <Input id="po-identity" value={draft.cxml_identity} maxLength={120} onChange={(e) => set("cxml_identity", e.target.value)} placeholder="AN01000000123" className="font-mono" />
                </Field>
              </div>
            ) : (
              <Field id="po-username" label={t("f_username")} hint={t("f_username_d")} error={err("login")}>
                <Input id="po-username" value={draft.oci_username} maxLength={60} onChange={(e) => set("oci_username", e.target.value)} className="font-mono" autoComplete="off" />
              </Field>
            )}
            <Field id="po-secret" label={t(draft.protocol === "oci" ? "f_secret_oci" : "f_secret")} error={err("secret")}
              hint={buyer?.has_secret && !secret ? t("f_secret_keep") : t("f_secret_new")}>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-0 flex-1">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="po-secret" type={showSecret ? "text" : "password"} value={secret} maxLength={200} autoComplete="new-password"
                    onChange={(e) => { setSecret(e.target.value); setGenerated(false); }} className="pl-9 pr-10 font-mono" placeholder={buyer?.has_secret ? "••••••••••••" : ""} />
                  <button type="button" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? t("f_secret_hide") : t("f_secret_show")}
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={() => { setSecret(generateSecret()); setShowSecret(true); setGenerated(true); }}><Wand2 className="mr-1.5 h-4 w-4" />{t("f_secret_generate")}</Button>
                {secret.length >= SECRET_MIN && <CopyButton value={secret} t={t} className="h-10" />}
              </div>
              {generated && <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("f_secret_copy_note")}</p>}
            </Field>
          </section>

          {/* Preços e pedidos */}
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <div>
              <h4 className="font-semibold">{t("sec_prices")}</h4>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("sec_prices_d")}</p>
            </div>
            <Field id="po-account" label={t("f_account")} hint={t("f_account_d")} error={err("account")}>
              <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Input value={accountQ} onChange={(e) => setAccountQ(e.target.value)} placeholder={t("f_account_search")} aria-label={t("f_account_search")} />
                <select id="po-account" value={draft.user_id} onChange={(e) => set("user_id", e.target.value)} className={select}>
                  <option value="">{t("f_account_none")}</option>
                  {accountOptions.map((c) => <option key={c.user_id} value={c.user_id}>{[c.full_name, c.email].filter(Boolean).join(" · ")}</option>)}
                </select>
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="po-country" label={t("f_country")} hint={t("f_country_d")} error={err("country")}>
                <select id="po-country" value={draft.country_code} onChange={(e) => set("country_code", e.target.value)} className={select}>
                  {[...new Set([draft.country_code, ...countries.map((c) => c.code)])].map((c) => <option key={c} value={c}>{region(c)}</option>)}
                </select>
              </Field>
              <Field id="po-fee" label={t("f_fee")} hint={t("f_fee_d")} error={err("fee")}>
                <Input id="po-fee" inputMode="decimal" value={draft.shipping_fee} onChange={(e) => set("shipping_fee", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_accept_orders")}</span><span className="block text-xs text-muted-foreground">{t("f_accept_orders_d")}</span></span>
              <Switch checked={draft.accept_orders} onCheckedChange={(v) => set("accept_orders", v)} disabled={draft.protocol === "oci"} />
            </label>
            <Field id="po-unspsc" label={t("f_unspsc")} hint={t("f_unspsc_d")} error={err("unspsc")}>
              <Input id="po-unspsc" inputMode="numeric" value={draft.unspsc} maxLength={8} onChange={(e) => set("unspsc", e.target.value.replace(/\D/g, ""))} className="max-w-[200px] font-mono" />
            </Field>
          </section>

          {/* Segurança */}
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <h4 className="font-semibold">{t("sec_security")}</h4>
            <Field id="po-hosts" label={t("f_hosts")} hint={t("f_hosts_d")} error={err("hosts")}>
              <Textarea id="po-hosts" rows={3} value={draft.hosts} onChange={(e) => set("hosts", e.target.value)} className="font-mono text-sm" placeholder="s1.ariba.com" />
            </Field>
            <Field id="po-minutes" label={t("f_minutes")} error={err("minutes")}>
              <select id="po-minutes" value={draft.session_minutes} onChange={(e) => set("session_minutes", Number(e.target.value))} className={cn(select, "max-w-[240px]")}>
                {[...new Set([draft.session_minutes, ...SESSION_MINUTE_OPTIONS])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>{m % 60 === 0 && m >= 120 ? t("hours_n", { n: m / 60 }) : t("minutes_n", { n: m })}</option>
                ))}
              </select>
            </Field>
          </section>

          <div className="sticky bottom-3 z-10 flex justify-end">
            <Button size="lg" onClick={() => void submit()} disabled={save.isPending} className="shadow-lg">
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {save.isPending ? t("saving") : id ? t("save") : t("create")}
            </Button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-[18px] border bg-card p-4">
            <h4 className="font-semibold">{t("side_endpoint")}</h4>
            <p className="text-xs text-muted-foreground">{t("side_endpoint_d")}</p>
            <code className="block break-all rounded-lg bg-muted px-3 py-2 text-xs">{endpoint}</code>
            <CopyButton value={endpoint} t={t} />
          </section>
          <section className="space-y-3 rounded-[18px] border bg-card p-4">
            <h4 className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{t("side_test")}</h4>
            <p className="text-xs text-muted-foreground">{buyer ? t("side_test_d") : t("side_test_save_first")}</p>
            <Button className="w-full" variant="outline" onClick={() => void runTest()} disabled={!buyer || test.isPending}>
              {test.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1.5 h-4 w-4" />}{t("side_test")}
            </Button>
          </section>
          <section className="space-y-2 rounded-[18px] border bg-card p-4">
            <h4 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />{draft.protocol === "oci" ? t("side_example_oci") : t("side_example")}</h4>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed">
              {draft.protocol === "oci" ? ociStartUrl(siteUrl(), draft.oci_username) : sampleSetupRequest(draft)}
            </pre>
          </section>
          {buyer && <BuyerActivity buyerId={buyer.id} t={t} />}
        </aside>
      </div>
    </AdminSubpage>
  );
}

function BuyerActivity({ buyerId, t }: { buyerId: string; t: T }) {
  const fmt = useAdminFormat();
  const { data: sessions = [] } = usePunchoutSessions(buyerId);
  const { data: orders = [] } = usePunchoutOrders(buyerId);
  return (
    <>
      <section className="space-y-2 rounded-[18px] border bg-card p-4">
        <h4 className="font-semibold">{t("side_recent")}</h4>
        {sessions.length === 0 ? <p className="text-sm text-muted-foreground">{t("side_recent_none")}</p> : (
          <ul className="divide-y text-sm">
            {sessions.slice(0, 5).map((s) => {
              const st = sessionStatus(s);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{fmt.dateTime(s.created_at)}</span>
                    <span className="block text-xs text-muted-foreground">{s.test ? t("st_test") : s.contact_name || t(`op_${s.operation as "create"}`)}</span>
                  </span>
                  <span className="text-right">
                    <Chip className={SESSION_TONE[st]}>{t(`st_${st}`)}</Chip>
                    {s.cart_total != null && <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{fmt.money(s.cart_total)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="space-y-2 rounded-[18px] border bg-card p-4">
        <h4 className="font-semibold">{t("side_orders")}</h4>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">{t("side_orders_none")}</p> : (
          <ul className="divide-y text-sm">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{o.po_number}</span>
                  <span className="block text-xs text-muted-foreground">{fmt.date(o.created_at)}</span>
                </span>
                {o.order_id ? <Link to={adminHref.order(o.order_id)} className="text-xs font-semibold text-brand-orange-text hover:underline">{t("po_open_order")}</Link>
                  : <Chip className="bg-red-50 text-red-700">{t("po_rejected")}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- Acessos e carrinhos ---------- */

type SessionFilter = "all" | SessionStatus;

function SessionList() {
  const { t } = useMessages(adminPunchoutMessages);
  const fmt = useAdminFormat();
  const { data: sessions = [], isLoading, error } = usePunchoutSessions();
  const { data: buyers = [] } = usePunchoutBuyers();
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [buyer, setBuyer] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const names = useMemo(() => new Map(buyers.map((b) => [b.id, b.name])), [buyers]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;
  const count = (f: SessionFilter) => sessions.filter((s) => f === "all" || sessionStatus(s) === f).length;
  const shown = sessions.filter((s) => (filter === "all" || sessionStatus(s) === filter) && (!buyer || s.buyer_id === buyer));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<SessionFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: sessions.length },
          { value: "returned", label: t("st_returned"), count: count("returned") },
          { value: "open", label: t("st_open"), count: count("open") },
          { value: "cancelled", label: t("st_cancelled"), count: count("cancelled") },
          { value: "expired", label: t("st_expired"), count: count("expired") },
        ]} />
        <select value={buyer} onChange={(e) => setBuyer(e.target.value)} aria-label={t("f_buyer")} className={cn(select, "sm:max-w-[280px]")}>
          <option value="">{t("all_buyers")}</option>
          {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {sessions.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("sessions_empty")}</p>
        : shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
          <ul className="space-y-3">
            {shown.slice(0, 200).map((s) => <SessionRow key={s.id} s={s} name={names.get(s.buyer_id) ?? ""} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} t={t} fmt={fmt} />)}
          </ul>
        )}
    </div>
  );
}

function SessionRow({ s, name, open, onToggle, t, fmt }: { s: AdminPunchoutSession; name: string; open: boolean; onToggle: () => void; t: T; fmt: ReturnType<typeof useAdminFormat> }) {
  const st = sessionStatus(s);
  const lines = s.cart?.lines ?? [];
  const qty = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <li className="rounded-[18px] border bg-card">
      <button type="button" onClick={onToggle} disabled={!lines.length} aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left disabled:cursor-default">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-orange-soft text-brand-orange-text"><ShoppingCart className="h-5 w-5" strokeWidth={1.8} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{name}</span>
            <Chip className={SESSION_TONE[st]}>{t(`st_${st}`)}</Chip>
            {s.test && <Chip className="bg-violet-50 text-violet-700">{t("st_test")}</Chip>}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {[fmt.dateTime(s.created_at), t(`op_${s.operation as "create"}`), s.contact_name ? t("by_contact", { name: s.contact_name }) : null,
              lines.length ? t(qty === 1 ? "items_one" : "items_n", { n: qty }) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        {s.cart_total != null && <span className="shrink-0 text-right font-semibold tabular-nums">{fmt.money(s.cart_total)}</span>}
        {lines.length > 0 && <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />}
      </button>
      {open && lines.length > 0 && (
        <div className="border-t px-4 pb-4 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("session_lines")}</p>
          <ul className="space-y-1.5 text-sm">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{l.quantity} x {l.name} <span className="font-mono text-xs text-muted-foreground">{l.sku}</span></span>
                <span className="shrink-0 tabular-nums">{fmt.money(l.unit * l.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ---------- Pedidos de compra ---------- */

type OrderFilter = "all" | "created" | "rejected" | "mismatch";

function OrderList() {
  const { t } = useMessages(adminPunchoutMessages);
  const fmt = useAdminFormat();
  const { data: orders = [], isLoading, error } = usePunchoutOrders();
  const { data: buyers = [] } = usePunchoutBuyers();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const names = useMemo(() => new Map(buyers.map((b) => [b.id, b.name])), [buyers]);
  if (isLoading) return <Loading t={t} />;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;
  const match = (o: AdminPunchoutOrder, f: OrderFilter) => f === "all" || (f === "mismatch" ? o.mismatch : o.status === f);
  const shown = orders.filter((o) => match(o, filter));

  return (
    <div className="space-y-5">
      <div className="rounded-[18px] border bg-card p-4">
        <FilterChips<OrderFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: orders.length },
          { value: "created", label: t("po_created"), count: orders.filter((o) => match(o, "created")).length },
          { value: "rejected", label: t("po_rejected"), count: orders.filter((o) => match(o, "rejected")).length },
          { value: "mismatch", label: t("po_mismatch").split(":")[0], count: orders.filter((o) => match(o, "mismatch")).length },
        ]} />
      </div>
      {orders.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("orders_empty")}</p>
        : shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
          <ul className="space-y-3">
            {shown.map((o) => (
              <li key={o.id} className="rounded-[18px] border bg-card p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", o.status === "created" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                    {o.status === "created" ? <ClipboardCheck className="h-5 w-5" strokeWidth={1.8} /> : <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{o.po_number}</span>
                      <Chip className={o.status === "created" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>{o.status === "created" ? t("po_created") : t("po_rejected")}</Chip>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {[names.get(o.buyer_id), fmt.dateTime(o.created_at), t(o.lines === 1 ? "items_one" : "items_n", { n: o.lines })].filter(Boolean).join(" · ")}
                    </span>
                    {o.reason && <span className="mt-1 block text-sm text-red-700">{o.reason}</span>}
                    {o.mismatch && <span className="mt-1 flex items-center gap-1.5 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{t("po_mismatch")}</span>}
                  </span>
                  <span className="grid shrink-0 grid-cols-2 gap-x-4 text-right text-sm">
                    <span className="text-xs text-muted-foreground">{t("po_total")}</span>
                    <span className="text-xs text-muted-foreground">{t("store_total")}</span>
                    <span className="tabular-nums">{o.po_total == null ? "-" : fmt.money(o.po_total)}</span>
                    <span className="font-semibold tabular-nums">{o.store_total == null ? "-" : fmt.money(o.store_total)}</span>
                  </span>
                  {o.order_id && (
                    <Link to={adminHref.order(o.order_id)} className="inline-flex h-9 items-center gap-1 self-center rounded-md px-3 text-sm font-semibold text-brand-orange-text hover:bg-muted">
                      {t("po_open_order")}<ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

/* ---------- Como ligar ---------- */

function Connect() {
  const { t } = useMessages(adminPunchoutMessages);
  const on = useFeature("punchout");
  const endpoint = endpointUrl(siteUrl());
  const block = (title: string, items: string[]) => (
    <section className="rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((x, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{x}</li>)}
      </ul>
    </section>
  );
  return (
    <div className="space-y-4">
      {!on && (
        <p className="flex flex-wrap items-center gap-2 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />{t("connect_feature_off")}
          <Link to="/admin?tab=features" className="font-semibold underline">{t("open_features")}</Link>
        </p>
      )}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("connect_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("connect_d")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 text-sm">{endpoint}</code>
          <CopyButton value={endpoint} t={t} />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {block(t("connect_cxml_title"), [t("connect_cxml_1"), t("connect_cxml_2"), t("connect_cxml_3"), t("connect_cxml_4")])}
        {block(t("connect_oci_title"), [t("connect_oci_1"), t("connect_oci_2")])}
      </div>
      {block(t("connect_security_title"), [t("connect_security_1"), t("connect_security_2"), t("connect_security_3")])}
    </div>
  );
}


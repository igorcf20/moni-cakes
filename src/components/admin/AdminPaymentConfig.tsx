// =====================================================================================
// Admin > Pagamentos: meios de pagamento da loja, por país.
//  - Lista (ordem = ordem do checkout): uma linha por meio, com ligar/desligar e Configurar.
//  - Página própria de cada meio (?tab=payment&ver=meio&id=<id>, sem janelas): países, desconto, pedido mínimo
//    e máximo, nome e instruções por idioma, dados para o cliente pagar (meios manuais) e a conta do provedor
//    (meios online: as mesmas chaves de Admin > Integrações, editadas ali mesmo).
//  - Adicionar: grelha com os meios do catálogo (src/lib/paymentMethods.ts) que ainda não estão na lista;
//    o meio novo abre logo a sua página.
// Dados: payment_config (só admin; o checkout lê os ativos por get_active_payment_methods). O servidor
// (create-order) volta a validar país, valor e desconto; nada daqui decide o total do pedido.
// Textos: src/i18n/adminPayments.ts (nomes padrão para o cliente em src/i18n/checkout.ts, pm_<tipo>).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Copy, ExternalLink, Info, KeyRound, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { ProviderCard, type Provider } from "./AdminIntegrations";
import { cn } from "@/lib/utils";
import { siteUrl } from "@/lib/siteUrl";
import { countryName } from "@/lib/countries";
import { PAYMENT_CATALOG, paymentEntry, paymentIconOf, type PaymentCatalogEntry } from "@/lib/paymentMethods";
import { LOCALES, useMessages, type Locale } from "@/i18n";
import { adminPaymentsMessages, type AdminPaymentsKey } from "@/i18n/adminPayments";
import { checkoutMessages, type CheckoutKey } from "@/i18n/checkout";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";

type Row = {
  id: string;
  type: string;
  name: string;
  is_active: boolean;
  details: Record<string, any>;
  display_order: number;
  countries: string[] | null;
  name_i18n: Record<string, string> | null;
  instructions_i18n: Record<string, string> | null;
  discount_percent: number | string | null;
  min_total: number | string | null;
  max_total: number | string | null;
};
type Account = { configured: boolean; active: boolean; environment: string };
type T = (key: AdminPaymentsKey, vars?: Record<string, string | number>) => string;

const db = supabase as any;
const KEY = ["adminPaymentConfig"] as const;
const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "telefone", "aleatoria", "nif"] as const;
const LANG_LABEL: Record<Locale, string> = { "pt-BR": "Português (Brasil)", "pt-PT": "Português (Portugal)", en: "English", es: "Español" };
const PROVIDER_NAME: Record<string, string> = { mercado_pago: "Mercado Pago", stripe: "Stripe", paypal: "PayPal", viva: "Viva Wallet" };

/** Nome padrão para o cliente num idioma (o mesmo que o checkout usa quando o Admin não muda). */
const defaultName = (type: string, lang: Locale) => {
  const k = `pm_${type}` as CheckoutKey;
  return (checkoutMessages[lang] as Record<string, string>)[k] ?? (checkoutMessages["pt-BR"] as Record<string, string>)[k] ?? type;
};
const apiBase = () => ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || siteUrl()).replace(/\/+$/, "");
const numText = (v: unknown) => (v == null || v === "" ? "" : String(v));
const numOrNull = (s: string) => {
  const n = Number(String(s).replace(",", ".").trim());
  return String(s).trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Estado das contas dos provedores (chaves obrigatórias gravadas, ligada, ambiente). */
async function loadAccounts(): Promise<Record<string, Account>> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const providers = PAYMENT_CATALOG.filter((m) => m.provider).map((m) => m.provider!) as string[];
  const required: Record<string, string[]> = { mercado_pago: ["access_token"], stripe: ["secret_key"], paypal: ["client_id", "client_secret"], viva: ["client_id", "client_secret"] };
  const out: Record<string, Account> = {};
  await Promise.all(providers.map(async (p) => {
    try {
      const r = await fetch(`${apiBase()}/functions/v1/admin-credentials?provider=${p}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      out[p] = { configured: (required[p] ?? []).every((k) => !!j?.masked?.[k]), active: !!j?.is_active, environment: String(j?.environment ?? "demo") };
    } catch {
      out[p] = { configured: false, active: false, environment: "demo" };
    }
  }));
  return out;
}

const AdminPaymentConfig = () => {
  const { t } = useMessages(adminPaymentsMessages);
  const qc = useQueryClient();
  const methods = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await db.from("payment_config").select("*").order("display_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const countries = useQuery({
    queryKey: ["adminPaymentCountries"],
    queryFn: async () => {
      const { data } = await db.from("countries").select("code,is_active,display_order").order("display_order");
      const list = (data ?? []) as { code: string; is_active: boolean }[];
      return list.length ? list : [{ code: "BR", is_active: true }, { code: "PT", is_active: true }, { code: "ES", is_active: false }];
    },
  });
  const accounts = useQuery({ queryKey: ["adminPaymentAccounts"], queryFn: loadAccounts, staleTime: 30_000 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["paymentConfigs"] });
  };

  const page = useAdminPage();
  const add = useMutation({
    mutationFn: async (entry: PaymentCatalogEntry) => {
      const rows = methods.data ?? [];
      const { data, error } = await db.from("payment_config").insert({
        type: entry.type, name: defaultName(entry.type, "pt-BR"), is_active: false, details: entry.proof ? { requires_proof: true } : {},
        countries: entry.countries, display_order: Math.max(-1, ...rows.map((r) => r.display_order ?? 0)) + 1,
      }).select("id").single();
      if (error) throw error;
      return String(data.id);
    },
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ["paymentConfigs"] }); toast.success(t("added")); page.open("meio", id); },
    onError: () => toast.error(t("add_error")),
  });

  const sorted = useMemo(() => [...(methods.data ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)), [methods.data]);
  const missing = PAYMENT_CATALOG.filter((m) => !sorted.some((r) => r.type === m.type));

  const move = async (index: number, dir: -1 | 1) => {
    const a = sorted[index], b = sorted[index + dir];
    if (!a || !b) return;
    const [r1, r2] = await Promise.all([
      db.from("payment_config").update({ display_order: b.display_order }).eq("id", a.id),
      db.from("payment_config").update({ display_order: a.display_order === b.display_order ? b.display_order + dir : a.display_order }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) toast.error(t("save_error", { error: (r1.error || r2.error).message }));
    refresh();
  };

  if (methods.isLoading) return <div className="p-8 text-center text-muted-foreground">{t("loading")}</div>;
  if (methods.error) {
    return (
      <div role="alert" className="space-y-3 rounded-2xl border p-4">
        <p>{t("load_error")}</p>
        <Button variant="outline" onClick={() => methods.refetch()}>{t("retry")}</Button>
      </div>
    );
  }

  const accountOf = (row: Row) => {
    const provider = paymentEntry(row.type)?.provider;
    return provider ? accounts.data?.[provider] : undefined;
  };
  const opened = page.view === "meio" ? sorted.find((r) => r.id === page.id) : undefined;
  if (opened) {
    return (
      <MethodPage
        key={opened.id}
        row={opened}
        t={t}
        countries={countries.data ?? []}
        account={accountOf(opened)}
        onAccountChanged={() => accounts.refetch()}
        onSaved={refresh}
        onClose={page.close}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <AdminHelp id="pagamentos" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4"), t("help_5")]} />

      {sorted.length === 0 && <p role="status" className="rounded-2xl border p-4 text-sm text-muted-foreground">{t("empty")}</p>}
      <div className="space-y-3">
        {sorted.map((row, i) => (
          <MethodRow
            key={row.id}
            row={row}
            t={t}
            account={accountOf(row)}
            onSaved={refresh}
            onOpen={() => page.open("meio", row.id)}
            first={i === 0}
            last={i === sorted.length - 1}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div>
          <h3 className="text-base font-semibold">{t("add_title")}</h3>
          <p className="text-sm text-muted-foreground">{t("add_lead")}</p>
        </div>
        {missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("all_added")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {missing.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.type} className="flex flex-col gap-3 rounded-xl border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{t(`n_${m.type}` as AdminPaymentsKey)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t(`d_${m.type}` as AdminPaymentsKey)}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <Badge variant="outline" className="font-normal">{m.kind === "gateway" ? t("kind_gateway") : t("kind_manual")}</Badge>
                    <Button size="sm" variant="outline" onClick={() => add.mutate(m)} disabled={add.isPending}>
                      <Plus className="mr-1 h-4 w-4" />{t("add_btn")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// ── Cartão de um meio ─────────────────────────────────────────────────────
type Draft = {
  is_active: boolean;
  details: Record<string, any>;
  countries: string[];
  name_i18n: Record<string, string>;
  instructions_i18n: Record<string, string>;
  discount: string;
  min: string;
  max: string;
};
const toDraft = (r: Row): Draft => ({
  is_active: r.is_active,
  details: { ...(r.details ?? {}) },
  countries: r.countries ?? [],
  name_i18n: { ...(r.name_i18n ?? {}) },
  // Instruções antigas (só um texto) aparecem no português do Brasil até serem traduzidas.
  instructions_i18n: { ...(r.details?.instrucoes ? { "pt-BR": r.details.instrucoes } : {}), ...(r.instructions_i18n ?? {}) },
  discount: numText(Number(r.discount_percent) || ""),
  min: numText(r.min_total),
  max: numText(r.max_total),
});

/** Validação e gravação de um meio (a lista usa-a para ligar/desligar; a página, para tudo). */
function useSaveMethod(row: Row, t: T, account: Account | undefined, onSaved: () => void) {
  const entry = paymentEntry(row.type);
  return useMutation({
    mutationFn: async (next: Draft) => {
      if (next.is_active && entry) {
        const lacks = entry.fields.some((f) => f.required && !String(next.details[f.key] ?? "").trim());
        if (lacks) throw new Error(t("need_fields"));
        if (entry.provider && entry.provider !== "viva" && !(account?.configured && account.active)) {
          throw new Error(t("need_account", { name: PROVIDER_NAME[entry.provider] }));
        }
      }
      const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
      const instr = clean(next.instructions_i18n);
      const names = clean(next.name_i18n);
      const details = { ...next.details };
      // details.instrucoes = texto de reserva para telas que ainda não leem as traduções.
      const fallbackInstr = instr["pt-BR"] ?? Object.values(instr)[0];
      if (fallbackInstr) details.instrucoes = fallbackInstr; else delete details.instrucoes;
      const { error } = await db.from("payment_config").update({
        is_active: next.is_active,
        details,
        countries: next.countries,
        name_i18n: names,
        instructions_i18n: instr,
        name: names["pt-BR"] || defaultName(row.type, "pt-BR"),
        discount_percent: Math.min(50, Math.max(0, numOrNull(next.discount) ?? 0)),
        min_total: numOrNull(next.min),
        max_total: numOrNull(next.max),
      }).eq("id", row.id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("saved")); onSaved(); },
    onError: (e: Error) => toast.error(t("save_error", { error: e.message })),
  });
}

const methodTitle = (row: Row, t: T) => (paymentEntry(row.type) ? t(`n_${row.type}` as AdminPaymentsKey) : row.name);

/** Linha da lista: ordem, nome, estado, ligar/desligar e Configurar (abre a página do meio). */
function MethodRow({ row, t, account, onSaved, onOpen, first, last, onMove }: {
  row: Row; t: T; account?: Account; onSaved: () => void; onOpen: () => void; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void;
}) {
  const { locale } = useMessages(adminPaymentsMessages);
  const entry = paymentEntry(row.type);
  const Icon = paymentIconOf(row.type);
  const save = useSaveMethod(row, t, account, onSaved);
  const [active, setActive] = useState(row.is_active);
  useEffect(() => { setActive(row.is_active); }, [row.is_active]);
  const title = methodTitle(row, t);
  const countryList = row.countries?.length ? row.countries.map((c) => countryName(c, locale)).join(", ") : t("all_countries");
  const discount = Number(row.discount_percent) || 0;
  const toggle = (v: boolean) => {
    setActive(v);
    save.mutate({ ...toDraft(row), is_active: v }, { onError: () => setActive(!v) });
  };
  return (
    <article className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={first} onClick={() => onMove(-1)} aria-label={t("move_up")} title={t("move_up")}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={last} onClick={() => onMove(1)} aria-label={t("move_down")} title={t("move_down")}><ArrowDown className="h-4 w-4" /></Button>
      </div>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          <Badge className={active ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-muted text-muted-foreground hover:bg-muted"}>{active ? t("active") : t("inactive")}</Badge>
          {discount > 0 && <Badge variant="outline" className="border-emerald-300 text-emerald-700">-{discount}%</Badge>}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {entry?.kind === "gateway" ? t("kind_gateway") : t("kind_manual")} · {t("countries_label", { list: countryList })}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={toggle} disabled={save.isPending} aria-label={title} />
        <Button variant="outline" size="sm" onClick={onOpen}>{t("configure")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </article>
  );
}

/** Página de um meio de pagamento (sem janelas sobrepostas). */
function MethodPage({ row, t, countries, account, onAccountChanged, onSaved, onClose }: {
  row: Row; t: T; countries: { code: string; is_active: boolean }[]; account?: Account;
  onAccountChanged: () => void; onSaved: () => void; onClose: () => void;
}) {
  const { locale } = useMessages(adminPaymentsMessages);
  const { currency } = useAdminFormat();
  const entry = paymentEntry(row.type);
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  useEffect(() => { setDraft(toDraft(row)); }, [row]);
  const save = useSaveMethod(row, t, account, onSaved);
  const { ask, confirmSlot } = useInlineConfirm();

  const title = methodTitle(row, t);
  const setDetail = (k: string, v: unknown) => setDraft((d) => ({ ...d, details: { ...d.details, [k]: v } }));
  const remove = async () => {
    if (!(await ask(t("delete_confirm", { name: title }), { confirmLabel: t("delete") }))) return;
    const { error } = await db.from("payment_config").delete().eq("id", row.id);
    if (error) toast.error(t("save_error", { error: error.message }));
    else { toast.success(t("deleted")); onSaved(); onClose(); }
  };
  const saveButton = (
    <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
      {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      {save.isPending ? t("saving") : t("save")}
    </Button>
  );

  return (
    <AdminSubpage
      title={title}
      subtitle={entry?.kind === "gateway" ? t("kind_gateway") : t("kind_manual")}
      backLabel={t("back")}
      onBack={onClose}
      actions={
        <label className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-medium">
          <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} />
          {draft.is_active ? t("active") : t("inactive")}
        </label>
      }
    >
      <div className="max-w-4xl space-y-6">
        {entry?.provider && (
          <Section title={t("sec_account")}>
            <p className="text-sm text-muted-foreground">{t(`gw_${entry.provider}` as AdminPaymentsKey)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium",
                account?.configured && account.active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
                {account?.configured && account.active ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                {account?.configured
                  ? account.active ? t("account_ok", { env: t(account.environment === "production" ? "env_production" : "env_demo") }) : t("account_off")
                  : t("account_missing")}
              </span>
              {entry.site && (
                <a href={entry.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange-text underline-offset-4 hover:underline">
                  {t("account_site", { name: PROVIDER_NAME[entry.provider] })}<ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><KeyRound className="h-3.5 w-3.5" />{t("account_keys_note")}</p>
            <ProviderCard provider={entry.provider as Provider} onSaved={onAccountChanged} />
            {entry.provider !== "viva" && (
              <CopyField
                label={t("webhook_title")}
                value={`${apiBase()}/functions/v1/payment-webhook?provider=${entry.provider}`}
                hint={t(`webhook_hint_${entry.provider}` as AdminPaymentsKey)}
              />
            )}
          </Section>
        )}

        {entry && entry.fields.length > 0 && (
          <Section title={t("sec_data")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {entry.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`${row.id}-${f.key}`} className="text-xs font-semibold text-muted-foreground">
                    {t(`f_${f.key}` as AdminPaymentsKey)}{f.required && <span className="font-normal"> ({t("required")})</span>}
                  </Label>
                  {f.key === "tipo_chave" ? (
                    <Select value={String(draft.details.tipo_chave ?? "")} onValueChange={(v) => setDetail("tipo_chave", v)}>
                      <SelectTrigger id={`${row.id}-${f.key}`}><SelectValue placeholder="..." /></SelectTrigger>
                      <SelectContent>{PIX_KEY_TYPES.map((k) => <SelectItem key={k} value={k}>{t(`k_${k}` as AdminPaymentsKey)}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${row.id}-${f.key}`}
                      value={String(draft.details[f.key] ?? "")}
                      placeholder={f.placeholder}
                      onChange={(e) => setDetail(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            {entry.proof && (
              <ToggleRow label={t("proof")} hint={t("proof_hint")} checked={!!draft.details.requires_proof} onChange={(v) => setDetail("requires_proof", v)} />
            )}
          </Section>
        )}
        {row.type === "on_delivery" && (
          <Section title={t("sec_data")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label={t("cash")} checked={!!draft.details.accepts_cash} onChange={(v) => setDetail("accepts_cash", v)} />
              <ToggleRow label={t("card")} checked={!!draft.details.accepts_card} onChange={(v) => setDetail("accepts_card", v)} />
            </div>
          </Section>
        )}

        <Section title={t("sec_where")}>
          <div className="flex flex-wrap gap-2">
            <Chip active={draft.countries.length === 0} onClick={() => setDraft((d) => ({ ...d, countries: [] }))}>{t("all_countries")}</Chip>
            {countries.map((c) => (
              <Chip
                key={c.code}
                active={draft.countries.includes(c.code)}
                muted={!c.is_active}
                onClick={() => setDraft((d) => ({ ...d, countries: d.countries.includes(c.code) ? d.countries.filter((x) => x !== c.code) : [...d.countries, c.code] }))}
              >
                {countryName(c.code, locale)}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("countries_hint")}</p>
        </Section>

        <Section title={t("sec_rules")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumField id={`${row.id}-disc`} label={t("discount")} value={draft.discount} onChange={(v) => setDraft((d) => ({ ...d, discount: v }))} />
            <NumField id={`${row.id}-min`} label={t("min", { currency })} value={draft.min} onChange={(v) => setDraft((d) => ({ ...d, min: v }))} />
            <NumField id={`${row.id}-max`} label={t("max", { currency })} value={draft.max} onChange={(v) => setDraft((d) => ({ ...d, max: v }))} />
          </div>
          <p className="text-xs text-muted-foreground">{t("discount_hint")} {t("limits_hint")}</p>
        </Section>

        <Section title={t("sec_texts")}>
          <Tabs defaultValue={locale}>
            <TabsList className="h-auto flex-wrap">
              {LOCALES.map((l) => <TabsTrigger key={l} value={l}>{LANG_LABEL[l]}</TabsTrigger>)}
            </TabsList>
            {LOCALES.map((l) => (
              <TabsContent key={l} value={l} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-name-${l}`} className="text-xs font-semibold text-muted-foreground">{t("name_label")}</Label>
                  <Input
                    id={`${row.id}-name-${l}`}
                    value={draft.name_i18n[l] ?? ""}
                    placeholder={defaultName(row.type, l)}
                    onChange={(e) => setDraft((d) => ({ ...d, name_i18n: { ...d.name_i18n, [l]: e.target.value } }))}
                  />
                  <p className="text-xs text-muted-foreground">{t("name_hint", { name: defaultName(row.type, l) })}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-instr-${l}`} className="text-xs font-semibold text-muted-foreground">{t("instructions")}</Label>
                  <Textarea
                    id={`${row.id}-instr-${l}`}
                    rows={3}
                    value={draft.instructions_i18n[l] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, instructions_i18n: { ...d.instructions_i18n, [l]: e.target.value } }))}
                  />
                  <p className="text-xs text-muted-foreground">{t("instructions_hint")}</p>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Section>

        {confirmSlot}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />{t("delete")}</Button>
          {saveButton}
        </div>
      </div>
    </AdminSubpage>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
    {children}
  </section>
);

const Chip = ({ active, muted, onClick, children }: { active: boolean; muted?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "min-h-[36px] rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
      muted && !active && "text-muted-foreground",
    )}
  >
    {children}
  </button>
);

const ToggleRow = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

const NumField = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{label}</Label>
    <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} />
  </div>
);

const CopyField = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="space-y-1 rounded-xl border border-dashed bg-muted/30 p-3 text-xs">
    <p className="font-semibold text-foreground">{label}</p>
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded border bg-background px-2 py-1 text-[11px]">{value}</code>
      <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={label}
        onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("OK"), () => undefined)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
    <p className="text-muted-foreground">{hint}</p>
  </div>
);

export default AdminPaymentConfig;

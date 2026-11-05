// =====================================================================================
// Admin > Vendas > Campos do checkout (recurso checkout_fields em Admin > Recursos da loja). Telas, sem janelas:
//   lista   números (ativos, obrigatórios, pedidos e valor dos extras em 30 dias), modelos prontos, campos pela
//           ordem do checkout com setas para mudar a ordem, Novo campo
//   novo    (ver=novo[&modelo=<id>]) tipo, nome interno, texto e ajuda por idioma, preço ou opções, máximo de
//           caracteres, obrigatório, ligado, países e a prévia de como o cliente vê
//   campo   (ver=campo&id=<id>) os mesmos dados e apagar
// Regras em src/lib/checkoutFields.ts (igual ao servidor). Migration 20261007060000_checkout_fields.sql.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlignLeft, ArrowDown, ArrowUp, CheckSquare, ChevronRight, Coins, ListChecks, ListOrdered, Loader2, Plus, Save, ShoppingCart,
  Sparkles, Trash2, Type, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminStatCard } from "./AdminListKit";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import CheckoutExtraFields from "@/components/checkout/CheckoutExtraFields";
import { Flag } from "@/components/Flag";
import { useMessages, type Locale } from "@/i18n";
import { adminCheckoutFieldsMessages, type AdminCheckoutFieldsKey } from "@/i18n/adminCheckoutFields";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useAdminCheckoutFields, useCheckoutFieldUsage, useDeleteCheckoutField, useMoveCheckoutField, useSaveCheckoutField,
} from "@/hooks/useCheckoutFields";
import { countryName, useCountries } from "@/lib/countries";
import {
  answerLines, DEFAULT_MAX_LENGTH, fieldInputErrors, FIELD_KINDS, localText, normalizeField, type Answers, type CheckoutField,
  type FieldKind, type I18nText,
} from "@/lib/checkoutFields";
import { cn } from "@/lib/utils";

type T = (key: AdminCheckoutFieldsKey, vars?: Record<string, string | number>) => string;
const LOCALES = [["pt-BR", "lang_pt_BR"], ["pt-PT", "lang_pt_PT"], ["en", "lang_en"], ["es", "lang_es"]] as const;
const KIND_ICON: Record<FieldKind, LucideIcon> = { checkbox: CheckSquare, select: ListOrdered, text: Type, textarea: AlignLeft };
const TEMPLATE_IDS = ["gift", "card", "time", "ref"] as const;
type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Texto da mesma chave nos 4 idiomas (modelos prontos já saem traduzidos). */
const all = (key: AdminCheckoutFieldsKey): I18nText =>
  Object.fromEntries(LOCALES.map(([loc]) => [loc, adminCheckoutFieldsMessages[loc as Locale][key]]));

const EMPTY: CheckoutField = normalizeField({ id: "", name: "", kind: "checkbox", is_active: true, max_length: DEFAULT_MAX_LENGTH });

function template(id: TemplateId, locale: Locale): CheckoutField {
  const msg = adminCheckoutFieldsMessages[locale];
  const base = { ...EMPTY };
  if (id === "gift") return { ...base, name: msg.tpl_gift, kind: "checkbox", label_i18n: all("tpl_gift"), price: 0 };
  if (id === "card") return { ...base, name: msg.tpl_card, kind: "textarea", label_i18n: all("tpl_card"), help_i18n: all("tpl_card_help"), max_length: 200 };
  if (id === "ref") return { ...base, name: msg.tpl_ref, kind: "text", label_i18n: all("tpl_ref"), max_length: 40 };
  return {
    ...base, name: msg.tpl_time, kind: "select", label_i18n: all("tpl_time"),
    options: [
      { id: "manha", label_i18n: all("opt_morning"), price: 0 },
      { id: "tarde", label_i18n: all("opt_afternoon"), price: 0 },
      { id: "noite", label_i18n: all("opt_evening"), price: 0 },
    ],
  };
}

export default function AdminCheckoutFields() {
  const { t } = useMessages(adminCheckoutFieldsMessages);
  const page = useAdminPage();
  const [params] = useSearchParams();
  if (page.view === "novo") {
    const tpl = params.get("modelo") as TemplateId | null;
    return <FieldNew template={tpl && TEMPLATE_IDS.includes(tpl) ? tpl : null} onBack={page.close} onSaved={(id) => page.open("campo", id)} />;
  }
  if (page.view === "campo" && page.id) return <FieldPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="checkout-fields" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <FieldList onOpen={(id) => page.open("campo", id)} />
    </div>
  );
}

/* ---------- Lista ---------- */

function FieldList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useMessages(adminCheckoutFieldsMessages);
  const fmt = useAdminFormat();
  const [params, setParams] = useSearchParams();
  const { data: fields = [], isLoading, error } = useAdminCheckoutFields();
  const { data: usage } = useCheckoutFieldUsage();
  const move = useMoveCheckoutField();
  const active = fields.filter((f) => f.is_active);

  const openNew = (tpl?: TemplateId) => {
    const next = new URLSearchParams(params);
    next.set("ver", "novo");
    next.delete("id");
    if (tpl) next.set("modelo", tpl); else next.delete("modelo");
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const swap = (from: number, to: number) => move.mutate({ fields, from, to }, { onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => openNew()}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("new")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={ListChecks} label={t("st_active")} value={active.length} />
        <AdminStatCard icon={CheckSquare} label={t("st_required")} value={active.filter((f) => f.required).length} />
        <AdminStatCard icon={ShoppingCart} label={t("st_orders")} value={usage?.orders ?? 0} />
        <AdminStatCard icon={Coins} label={t("st_amount")} value={fmt.money(usage?.amount ?? 0)} />
      </div>

      <section className="space-y-3 rounded-[18px] border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{t("templates")}</h2>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_IDS.map((id) => {
            const f = template(id, locale);
            const Icon = KIND_ICON[f.kind];
            return (
              <Button key={id} type="button" variant="outline" size="sm" onClick={() => openNew(id)}>
                <Icon className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{f.name}
              </Button>
            );
          })}
        </div>
      </section>

      {fields.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("list_title")}</h2>
          <ul className="divide-y rounded-[18px] border bg-card">
            {fields.map((f, i) => {
              const Icon = KIND_ICON[f.kind];
              const used = usage?.byField[f.id]?.orders ?? 0;
              const priceText = f.kind === "select"
                ? t("options_n", { n: f.options.length })
                : f.price > 0 ? fmt.money(f.price) : "";
              return (
                <li key={f.id} className="flex items-center gap-2 p-2 sm:p-3">
                  <div className="flex shrink-0 flex-col">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0 || move.isPending} onClick={() => swap(i, i - 1)} aria-label={t("up")}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === fields.length - 1 || move.isPending} onClick={() => swap(i, i + 1)} aria-label={t("down")}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <button type="button" onClick={() => onOpen(f.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-orange-text"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{f.name}</span>
                        {f.required && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-brand-orange-text">{t("required")}</span>}
                        {!f.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("hidden")}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {[t(`k_${f.kind}` as AdminCheckoutFieldsKey), priceText, f.countries.length ? f.countries.join(", ") : t("all_countries"), used ? t("used_n", { n: used }) : ""].filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{localText(f.label_i18n, locale)}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Formulário ---------- */

const parsePrice = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

function I18nInputs({ id, value, onChange, max, t }: { id: string; value: I18nText; onChange: (v: I18nText) => void; max: number; t: T }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LOCALES.map(([loc, label]) => (
        <div key={loc} className="grid gap-1">
          <Label htmlFor={`${id}-${loc}`} className="text-xs text-muted-foreground">{t(label)}</Label>
          <Input id={`${id}-${loc}`} value={value[loc] ?? ""} maxLength={max} onChange={(e) => {
            const next = { ...value, [loc]: e.target.value };
            if (!e.target.value) delete next[loc];
            onChange(next);
          }} />
        </div>
      ))}
    </div>
  );
}

function PriceInput({ id, value, onChange, label }: { id: string; value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => { setText(value ? String(value) : ""); }, [value]);
  return (
    <Input id={id} aria-label={label} inputMode="decimal" placeholder="0" value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={() => onChange(parsePrice(text))} />
  );
}

function FieldForm({ initial, onSaved }: { initial: CheckoutField; onSaved: (id: string) => void }) {
  const { t, locale } = useMessages(adminCheckoutFieldsMessages);
  const fmt = useAdminFormat();
  const save = useSaveCheckoutField();
  const { data: fields = [] } = useAdminCheckoutFields();
  const { data: countries = [] } = useCountries();
  const [form, setForm] = useState<CheckoutField>(initial);
  const [preview, setPreview] = useState<Answers>({});
  useEffect(() => { setForm(initial); }, [initial]);
  const set = <K extends keyof CheckoutField>(k: K, v: CheckoutField[K]) => setForm((f) => ({ ...f, [k]: v }));
  const clean = useMemo(() => normalizeField({ ...form, name: form.name.trim() }), [form]);
  const problems = fieldInputErrors(clean);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const countryCodes = [...new Set([...countries.map((c) => c.code), ...form.countries])];

  const submit = () => {
    if (problems.length) { toast.error(t(`err_${problems[0]}` as AdminCheckoutFieldsKey)); return; }
    const order = clean.id ? clean.display_order : Math.max(0, ...fields.map((f) => f.display_order)) + 10;
    save.mutate({ ...clean, display_order: order }, {
      onSuccess: (id) => { toast.success(t("saved")); onSaved(id); },
      onError: () => toast.error(t("save_error")),
    });
  };

  const setOption = (i: number, patch: Partial<CheckoutField["options"][number]>) =>
    set("options", form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const addOption = () => {
    const used = new Set(form.options.map((o) => o.id));
    let n = form.options.length + 1;
    while (used.has(`op${n}`)) n += 1;
    set("options", [...form.options, { id: `op${n}`, label_i18n: {}, price: 0 }]);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-5 rounded-[18px] border bg-card p-5">
        <h2 className="text-base font-semibold">{t("data_title")}</h2>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("kind")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELD_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const on = form.kind === k;
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => setForm((f) => ({ ...f, kind: k, options: k === "select" && f.options.length === 0 ? [{ id: "op1", label_i18n: {}, price: 0 }] : f.options }))}
                  className={cn("flex items-start gap-3 rounded-[14px] border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary bg-accent/60" : "hover:border-primary/40")}>
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-primary" : "text-muted-foreground")} strokeWidth={1.8} />
                  <span>
                    <span className="block text-sm font-semibold">{t(`k_${k}` as AdminCheckoutFieldsKey)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`k_${k}_d` as AdminCheckoutFieldsKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="cf-name">{t("name")}</Label>
          <Input id="cf-name" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("name_hint")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("label")}</legend>
          <p className="text-xs text-muted-foreground">{t("label_hint")}</p>
          <I18nInputs id="cf-label" value={form.label_i18n} onChange={(v) => set("label_i18n", v)} max={120} t={t} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("help")}</legend>
          <p className="text-xs text-muted-foreground">{t("help_hint")}</p>
          <I18nInputs id="cf-help" value={form.help_i18n} onChange={(v) => set("help_i18n", v)} max={240} t={t} />
        </fieldset>

        {form.kind === "select" ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("options")}</legend>
            <p className="text-xs text-muted-foreground">{t("options_hint")} {t("price_hint", { currency: fmt.currency })}</p>
            {form.options.map((o, i) => (
              <div key={o.id} className="space-y-3 rounded-[14px] border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{localText(o.label_i18n, locale, `${i + 1}`)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("options", form.options.filter((_, j) => j !== i))} disabled={form.options.length <= 1}>
                    <X className="mr-1 h-4 w-4" />{t("option_remove")}
                  </Button>
                </div>
                <I18nInputs id={`cf-op-${o.id}`} value={o.label_i18n} onChange={(v) => setOption(i, { label_i18n: v })} max={80} t={t} />
                <div className="grid max-w-[200px] gap-1">
                  <Label htmlFor={`cf-op-${o.id}-price`} className="text-xs text-muted-foreground">{t("option_price")} ({fmt.currency})</Label>
                  <PriceInput id={`cf-op-${o.id}-price`} label={t("option_price")} value={o.price} onChange={(n) => setOption(i, { price: n })} />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addOption} disabled={form.options.length >= 30}><Plus className="mr-1.5 h-4 w-4" />{t("option_add")}</Button>
          </fieldset>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cf-price">{t(form.kind === "checkbox" ? "price_checkbox" : "price_text")} ({fmt.currency})</Label>
              <PriceInput id="cf-price" label={t(form.kind === "checkbox" ? "price_checkbox" : "price_text")} value={form.price} onChange={(n) => set("price", n)} />
              <p className="text-xs text-muted-foreground">{t("price_hint", { currency: fmt.currency })}</p>
            </div>
            {form.kind !== "checkbox" && (
              <div className="grid gap-1.5">
                <Label htmlFor="cf-max">{t("max_length")}</Label>
                <Input id="cf-max" inputMode="numeric" value={String(form.max_length)} onChange={(e) => set("max_length", Number(e.target.value.replace(/\D/g, "")) || 0)} />
              </div>
            )}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("countries")}</legend>
          <p className="text-xs text-muted-foreground">{t("countries_hint")}</p>
          <div className="flex flex-wrap gap-2">
            {countryCodes.map((code) => {
              const on = form.countries.includes(code);
              return (
                <button key={code} type="button" aria-pressed={on}
                  onClick={() => set("countries", on ? form.countries.filter((c) => c !== code) : [...form.countries, code])}
                  className={cn("flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary bg-accent/60 font-semibold" : "hover:border-primary/40")}>
                  <Flag code={code} className="h-3.5 w-5 rounded-sm" />{countryName(code, locale)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-4 border-t pt-4">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">{t("is_required")}</span>
              <span className="block text-xs text-muted-foreground">{t("is_required_hint")}</span>
            </span>
            <Switch checked={form.required} onCheckedChange={(v) => set("required", v)} />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">{t("is_active")}</span>
              <span className="block text-xs text-muted-foreground">{t("is_active_hint")}</span>
            </span>
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          {dirty && initial.id && <span className="text-xs font-medium text-amber-700">{t("unsaved")}</span>}
          <Button onClick={submit} disabled={save.isPending || (!!initial.id && !dirty)}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
          </Button>
        </div>
      </section>

      <aside className="min-w-0">
        <div className="space-y-3 rounded-[18px] border bg-brand-alt/50 p-5 xl:sticky xl:top-24">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("preview")}</h2>
          <div className="rounded-[16px] border bg-white p-4">
            <CheckoutExtraFields
              fields={[{ ...clean, id: "preview", name: clean.name || t("new") }]}
              answers={preview}
              onChange={(id, v) => setPreview((a) => ({ ...a, [id]: v }))}
              errors={answerLines([{ ...clean, id: "preview" }], preview).errors}
              showErrors={false}
              money={fmt.money}
              compact
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldNew({ template: tpl, onBack, onSaved }: { template: TemplateId | null; onBack: () => void; onSaved: (id: string) => void }) {
  const { t, locale } = useMessages(adminCheckoutFieldsMessages);
  const initial = useMemo(() => (tpl ? template(tpl, locale) : EMPTY), [tpl, locale]);
  return (
    <AdminSubpage title={tpl ? initial.name : t("new")} subtitle={t("new_hint")} backLabel={t("back")} onBack={onBack}>
      <FieldForm initial={initial} onSaved={onSaved} />
    </AdminSubpage>
  );
}

/* ---------- Página do campo ---------- */

function FieldPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminCheckoutFieldsMessages);
  const { data: fields = [], isLoading } = useAdminCheckoutFields();
  const { data: usage } = useCheckoutFieldUsage();
  const remove = useDeleteCheckoutField();
  const { ask, confirmSlot } = useInlineConfirm();
  const f = fields.find((x) => x.id === id);
  const initial = useMemo(() => f ?? null, [f]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!f || !initial) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const del = async () => {
    if (!(await ask(t("delete_confirm", { name: f.name }), { description: t("delete_hint"), confirmLabel: t("delete"), tone: "danger" }))) return;
    remove.mutate(f.id, { onSuccess: () => { toast.success(t("deleted")); onBack(); }, onError: () => toast.error(t("save_error")) });
  };
  const used = usage?.byField[f.id]?.orders ?? 0;

  return (
    <AdminSubpage
      title={f.name}
      subtitle={[t(`k_${f.kind}` as AdminCheckoutFieldsKey), f.is_active ? "" : t("hidden"), t("used_n", { n: used })].filter(Boolean).join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<Button variant="outline" onClick={del} disabled={remove.isPending} className="text-destructive hover:text-destructive"><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>}
    >
      {confirmSlot}
      <FieldForm initial={initial} onSaved={() => undefined} />
    </AdminSubpage>
  );
}

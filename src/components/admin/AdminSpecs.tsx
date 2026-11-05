// =====================================================================================
// Admin > Especificações (recurso spec_filters em Admin > Recursos da loja). Sem janelas:
//   lista        características na ordem dos filtros (setas para mudar), quantos valores e produtos, onde aparecem
//   nova/editar  (ver=nova | ver=caract&id=<id>) nome, nome no endereço, unidade, onde aparece, traduções e valores
//                (com cor opcional e ordem); apagar com confirmação na página
// Os valores de cada produto marcam-se na aba Especificações do produto (ProductSpecsEditor).
// Tabelas na migration 20261006210000_product_specs.sql; contas em src/lib/productSpecs.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Filter, Languages, ListChecks, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALES, LOCALE_NAMES, useMessages, type Locale } from "@/i18n";
import { adminSpecsMessages } from "@/i18n/adminSpecs";
import {
  useDeleteSpecAttribute, useReorderSpecAttributes, useSaveSpecAttribute, useSpecAttributes, useSpecRows,
  type SpecOptionDraft,
} from "@/hooks/useProductSpecs";
import { specSlug, specText, type SpecAttribute } from "@/lib/productSpecs";
import { cn } from "@/lib/utils";

const OTHER_LOCALES = LOCALES.filter((l) => l !== "pt-BR");
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export default function AdminSpecs() {
  const { t } = useMessages(adminSpecsMessages);
  const page = useAdminPage();
  const { data: attrs = [], isLoading, error } = useSpecAttributes();
  if (page.view === "nova") return <SpecForm attr={null} all={attrs} onBack={page.close} onSaved={(id) => page.open("caract", id)} />;
  if (page.view === "caract" && page.id) {
    const attr = attrs.find((a) => a.id === page.id);
    if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
    if (attr) return <SpecForm key={attr.id} attr={attr} all={attrs} onBack={page.close} onSaved={() => undefined} />;
  }
  return (
    <div className="space-y-5">
      <AdminHelp id="specs" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <div className="flex justify-end">
        <Button onClick={() => page.open("nova")}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("new")}</Button>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
      ) : (
        <SpecList attrs={attrs} onOpen={(id) => page.open("caract", id)} />
      )}
    </div>
  );
}

/* ---------- Lista ---------- */

function SpecList({ attrs, onOpen }: { attrs: SpecAttribute[]; onOpen: (id: string) => void }) {
  const { t, locale } = useMessages(adminSpecsMessages);
  const { data: rows = [] } = useSpecRows();
  const reorder = useReorderSpecAttributes();
  const usage = useMemo(() => {
    const byOption = new Map<string, string>();
    attrs.forEach((a) => a.options.forEach((o) => byOption.set(o.id, a.id)));
    const products = new Map<string, Set<string>>();
    for (const r of rows) {
      const a = byOption.get(r.option_id);
      if (!a) continue;
      if (!products.has(a)) products.set(a, new Set());
      products.get(a)!.add(r.product_id);
    }
    return products;
  }, [attrs, rows]);

  if (!attrs.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;

  const move = (i: number, d: -1 | 1) => {
    const ids = attrs.map((a) => a.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids, { onError: () => toast.error(t("save_error")) });
  };

  return (
    <ul className="space-y-3">
      {attrs.map((a, i) => {
        const n = usage.get(a.id)?.size ?? 0;
        return (
          <li key={a.id} className="flex flex-col gap-3 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-center">
            <div className="flex shrink-0 gap-1 sm:flex-col">
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("move_up")} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("move_down")} disabled={i === attrs.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            </div>
            <button type="button" onClick={() => onOpen(a.id)} className="min-w-0 flex-1 text-left">
              <p className="font-semibold">{specText(a.name_i18n, locale, a.slug)}{a.unit ? <span className="font-normal text-muted-foreground"> ({a.unit})</span> : null}</p>
              <p className="text-sm text-muted-foreground">
                {a.options.length === 1 ? t("values_one") : t("values_n", { n: a.options.length })} · {n === 1 ? t("products_one") : t("products_n", { n })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.options.slice(0, 8).map((o) => (
                  <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    {o.color && <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: o.color }} aria-hidden="true" />}
                    {specText(o.label_i18n, locale, o.slug)}
                  </span>
                ))}
                {a.options.length > 8 && <span className="text-xs text-muted-foreground">+{a.options.length - 8}</span>}
              </div>
            </button>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {a.show_in_filters && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Filter className="h-3 w-3" />{t("in_filters")}</span>}
              {a.show_on_product && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700"><Eye className="h-3 w-3" />{t("on_product")}</span>}
              {!a.show_in_filters && !a.show_on_product && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"><EyeOff className="h-3 w-3" />{t("hidden")}</span>}
              <Button variant="outline" size="sm" onClick={() => onOpen(a.id)}><Pencil className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("edit")}</Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Criar e editar ---------- */

type ValueRow = SpecOptionDraft & { key: string };
type Form = {
  name: Record<string, string>;
  slug: string;
  slugTouched: boolean;
  unit: string;
  show_in_filters: boolean;
  show_on_product: boolean;
  values: ValueRow[];
};

let rowSeq = 0;
const newRow = (): ValueRow => ({ key: `n${++rowSeq}`, slug: "", label_i18n: {}, color: null });
const toForm = (a: SpecAttribute | null): Form => ({
  name: { ...(a?.name_i18n ?? {}) },
  slug: a?.slug ?? "",
  slugTouched: !!a,
  unit: a?.unit ?? "",
  show_in_filters: a?.show_in_filters ?? true,
  show_on_product: a?.show_on_product ?? true,
  values: a?.options.length ? a.options.map((o) => ({ key: o.id, id: o.id, slug: o.slug, label_i18n: { ...o.label_i18n }, color: o.color })) : [newRow()],
});

function SpecForm({ attr, all, onBack, onSaved }: { attr: SpecAttribute | null; all: SpecAttribute[]; onBack: () => void; onSaved: (id: string) => void }) {
  const { t, locale } = useMessages(adminSpecsMessages);
  const save = useSaveSpecAttribute();
  const remove = useDeleteSpecAttribute();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<Form>(() => toForm(attr));
  const [langs, setLangs] = useState(() => !!attr && OTHER_LOCALES.some((l) => attr.name_i18n[l]));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setErr(null); }, [f]);

  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const setName = (l: Locale, v: string) => setF((x) => ({
    ...x, name: { ...x.name, [l]: v }, slug: l === "pt-BR" && !x.slugTouched ? specSlug(v) : x.slug,
  }));
  const setValue = (i: number, p: Partial<ValueRow>) => setF((x) => ({ ...x, values: x.values.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const setLabel = (i: number, l: Locale, v: string) => setF((x) => ({
    ...x, values: x.values.map((r, j) => (j === i ? { ...r, label_i18n: { ...r.label_i18n, [l]: v } } : r)),
  }));
  const moveValue = (i: number, d: -1 | 1) => setF((x) => {
    const v = [...x.values];
    const j = i + d;
    if (j < 0 || j >= v.length) return x;
    [v[i], v[j]] = [v[j], v[i]];
    return { ...x, values: v };
  });

  const submit = async () => {
    const name = (f.name["pt-BR"] ?? "").trim();
    if (!name) return setErr(t("e_name"));
    if (!SLUG_RE.test(f.slug)) return setErr(t("e_slug"));
    if (all.some((a) => a.slug === f.slug && a.id !== attr?.id)) return setErr(t("e_slug_taken"));
    const values = f.values
      .map((r) => ({ ...r, label_i18n: Object.fromEntries(Object.entries(r.label_i18n).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) }))
      .filter((r) => r.label_i18n["pt-BR"]);
    if (!values.length) return setErr(t("e_values"));
    // Valores já gravados mantêm o nome no endereço (links de filtros continuam a funcionar).
    const slugs = values.map((r) => (r.id && r.slug ? r.slug : specSlug(r.label_i18n["pt-BR"], 60) || "valor"));
    if (new Set(slugs).size !== slugs.length) return setErr(t("e_value_dup"));
    try {
      const id = await save.mutateAsync({
        id: attr?.id ?? null,
        draft: {
          slug: f.slug,
          name_i18n: Object.fromEntries(Object.entries(f.name).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
          unit: f.unit.trim() || null,
          show_in_filters: f.show_in_filters,
          show_on_product: f.show_on_product,
          ...(attr ? {} : { sort_order: all.length }),
          options: values.map((r, i) => ({ id: r.id, slug: slugs[i], label_i18n: r.label_i18n, color: r.color })),
        },
      });
      toast.success(t("saved"));
      onSaved(id);
    } catch {
      toast.error(t("save_error"));
    }
  };

  const del = async () => {
    if (!attr || !(await ask(t("confirm_delete"), { confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await remove.mutateAsync(attr.id);
      toast.success(t("deleted"));
      onBack();
    } catch {
      toast.error(t("save_error"));
    }
  };

  const title = attr ? specText(attr.name_i18n, locale, attr.slug) : t("new");
  return (
    <AdminSubpage title={title} subtitle={attr ? undefined : t("new_hint")} backLabel={t("back")} onBack={onBack}>
      <section className="space-y-5 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sp-name">{t("f_name")}</Label>
            <Input id="sp-name" value={f.name["pt-BR"] ?? ""} maxLength={60} onChange={(e) => setName("pt-BR", e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("f_name_hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-slug">{t("f_slug")}</Label>
            <Input id="sp-slug" value={f.slug} maxLength={40} onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} />
            <p className="text-xs text-muted-foreground">{t("f_slug_hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-unit">{t("f_unit")}</Label>
            <Input id="sp-unit" value={f.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t("f_unit_hint")}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
            <span><span className="block text-sm font-semibold">{t("f_filters")}</span><span className="block text-xs text-muted-foreground">{t("f_filters_hint")}</span></span>
            <Switch checked={f.show_in_filters} onCheckedChange={(v) => set({ show_in_filters: v })} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
            <span><span className="block text-sm font-semibold">{t("f_product")}</span><span className="block text-xs text-muted-foreground">{t("f_product_hint")}</span></span>
            <Switch checked={f.show_on_product} onCheckedChange={(v) => set({ show_on_product: v })} />
          </label>
        </div>
        <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
          <span className="flex items-start gap-2"><Languages className="mt-0.5 h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-semibold">{t("f_translations")}</span><span className="block text-xs text-muted-foreground">{t("f_translations_hint")}</span></span></span>
          <Switch checked={langs} onCheckedChange={setLangs} />
        </label>
        {langs && (
          <div className="grid gap-3 sm:grid-cols-3">
            {OTHER_LOCALES.map((l) => (
              <div key={l} className="space-y-1.5">
                <Label htmlFor={`sp-name-${l}`}>{t("f_name")} ({LOCALE_NAMES[l]})</Label>
                <Input id={`sp-name-${l}`} value={f.name[l] ?? ""} maxLength={60} placeholder={f.name["pt-BR"] ?? ""} onChange={(e) => setName(l, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Valores */}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4 text-primary" />{t("f_values")}</h4>
          <p className="text-sm text-muted-foreground">{t("f_values_hint")} {t("f_color_hint")}</p>
        </div>
        <ul className="space-y-2">
          {f.values.map((r, i) => (
            <li key={r.key} className="space-y-2 rounded-xl border bg-background p-3">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label={t("move_up")} disabled={i === 0} onClick={() => moveValue(i, -1)} className="grid h-5 w-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={t("move_down")} disabled={i === f.values.length - 1} onClick={() => moveValue(i, 1)} className="grid h-5 w-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <Input aria-label={`${t("f_value")} ${i + 1}`} value={r.label_i18n["pt-BR"] ?? ""} maxLength={60} onChange={(e) => setLabel(i, "pt-BR", e.target.value)} className="min-w-0 flex-1" />
                <label className={cn("relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border", !r.color && "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--muted))_4px,hsl(var(--muted))_8px)]")} style={r.color ? { backgroundColor: r.color } : undefined} title={t("f_color")}>
                  <span className="sr-only">{t("f_color")}</span>
                  <input type="color" value={r.color ?? "#ff5a0a"} onChange={(e) => setValue(i, { color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
                {r.color && <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={t("f_no_color")} title={t("f_no_color")} onClick={() => setValue(i, { color: null })}><X className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-destructive" aria-label={t("f_remove_value")} title={t("f_remove_value")} disabled={f.values.length === 1} onClick={() => set({ values: f.values.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {langs && (
                <div className="grid gap-2 pl-9 sm:grid-cols-3">
                  {OTHER_LOCALES.map((l) => (
                    <Input key={l} aria-label={`${t("f_value")} ${i + 1} (${LOCALE_NAMES[l]})`} value={r.label_i18n[l] ?? ""} maxLength={60} placeholder={`${LOCALE_NAMES[l]}: ${r.label_i18n["pt-BR"] ?? ""}`} onChange={(e) => setLabel(i, l, e.target.value)} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={() => set({ values: [...f.values, newRow()] })}><Plus className="mr-1.5 h-4 w-4" />{t("f_add_value")}</Button>
      </section>

      {err && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{err}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {attr ? <Button variant="ghost" className="text-destructive" onClick={() => void del()} disabled={remove.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button> : <span />}
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("save")}
        </Button>
      </div>
      {confirmSlot}
    </AdminSubpage>
  );
}

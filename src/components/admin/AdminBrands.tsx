// =====================================================================================
// Admin > Catálogo > Marcas (recurso brands em Admin > Recursos da loja). Telas, sem janelas:
//   lista   números (visíveis, produtos com marca, sem produtos, escondidas), filtros, busca, Nova marca
//   nova    (ver=nova) nome, endereço, logo, site, descrição por idioma, ordem, visível
//   marca   (ver=marca&id=<id>) os mesmos dados, produtos da marca, apagar
// A marca de cada produto escolhe-se na aba Dados do produto (BrandField). Migration 20261007010000_brands.sql.
// =====================================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, EyeOff, ExternalLink, ImageOff, Loader2, Package, PackageX, Plus, Save, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { adminBrandsMessages, type AdminBrandsKey } from "@/i18n/adminBrands";
import { brandErrorCode, useAdminBrands, useBrandProducts, useDeleteBrand, useSaveBrand, type AdminBrand, type BrandInput } from "@/hooks/useBrands";
import { brandSlug, SLUG_RE } from "@/lib/brands";
import { cn } from "@/lib/utils";

type T = (key: AdminBrandsKey, vars?: Record<string, string | number>) => string;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const LOCALES = [["pt-BR", "lang_pt_BR"], ["pt-PT", "lang_pt_PT"], ["en", "lang_en"], ["es", "lang_es"]] as const;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const productsLabel = (t: T, n: number) => t(n === 1 ? "products_one" : "products_other", { n });

export default function AdminBrands() {
  const { t } = useMessages(adminBrandsMessages);
  const page = useAdminPage();
  if (page.view === "nova") return <BrandNew onBack={page.close} onSaved={(id) => page.open("marca", id)} />;
  if (page.view === "marca" && page.id) return <BrandPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="brands" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <BrandList onOpen={(id) => page.open("marca", id)} onNew={() => page.open("nova")} />
    </div>
  );
}

/* ---------- Lista ---------- */

type Filter = "all" | "visible" | "hidden" | "empty";

function BrandList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useMessages(adminBrandsMessages);
  const { data: brands = [], isLoading, error } = useAdminBrands();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const visible = brands.filter((b) => b.is_active);
  const empty = brands.filter((b) => b.products === 0);
  const shown = brands.filter((b) => (filter === "all" || (filter === "visible" && b.is_active) || (filter === "hidden" && !b.is_active) || (filter === "empty" && b.products === 0))
    && (!q.trim() || norm(`${b.name} ${b.slug}`).includes(norm(q.trim()))));

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        {visible.length > 0 && <Button variant="outline" asChild><a href="/marcas" target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open_all")}</a></Button>}
        <Button onClick={onNew}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("new")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Tag} label={t("st_brands")} value={visible.length} active={filter === "visible"} onClick={() => setFilter("visible")} />
        <AdminStatCard icon={Package} label={t("st_products")} value={brands.reduce((s, b) => s + b.products, 0)} />
        <AdminStatCard icon={PackageX} label={t("st_empty")} value={empty.length} tone={empty.length ? "warning" : "default"} active={filter === "empty"} onClick={() => setFilter("empty")} />
        <AdminStatCard icon={EyeOff} label={t("st_hidden")} value={brands.length - visible.length} active={filter === "hidden"} onClick={() => setFilter("hidden")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: brands.length },
          { value: "visible", label: t("f_visible"), count: visible.length },
          { value: "hidden", label: t("f_hidden"), count: brands.length - visible.length },
        ]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{brands.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b.id)} className="flex h-full w-full items-center gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Logo src={b.logo_url} name={b.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{b.name}</span>
                    {!b.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("hidden")}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">{productsLabel(t, b.products)} · {b.slug}</span>
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

function Logo({ src, name, size = "md" }: { src: string | null; name: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-24 w-36" : "h-12 w-16";
  return src
    ? <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-white p-1.5", box)}><img src={src} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /></span>
    : <span className={cn("grid shrink-0 place-items-center rounded-xl border bg-muted text-sm font-bold text-muted-foreground", box)}>{name.slice(0, 2).toUpperCase() || <ImageOff className="h-4 w-4" />}</span>;
}

/* ---------- Dados da marca ---------- */

const EMPTY: BrandInput = { slug: "", name: "", logo_url: null, website: null, description_i18n: {}, is_active: true, display_order: 0 };

function BrandFields({ initial, onSaved }: { initial: BrandInput; onSaved: (id: string) => void }) {
  const { t } = useMessages(adminBrandsMessages);
  const save = useSaveBrand();
  const [form, setForm] = useState<BrandInput>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setForm(initial); setSlugTouched(!!initial.id); }, [initial]);
  const set = <K extends keyof BrandInput>(k: K, v: BrandInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const website = form.website?.trim() || null;
  const valid = form.name.trim().length > 0 && form.name.trim().length <= 80 && SLUG_RE.test(form.slug) && (!website || /^https?:\/\//.test(website));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const upload = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type) || file.size > 2 * 1024 * 1024) { toast.error(t("logo_error")); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `brands/${form.slug || "marca"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      set("logo_url", supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    } catch {
      toast.error(t("logo_error"));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!valid) { toast.error(t("invalid")); return; }
    save.mutate({ ...form, name: form.name.trim(), website }, {
      onSuccess: (id) => { toast.success(t("saved")); onSaved(id); },
      onError: (e) => { const c = brandErrorCode(e); toast.error(t(c === "unknown" ? "save_error" : c)); },
    });
  };

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-5">
      <h2 className="text-base font-semibold">{t("data_title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="br-name">{t("name")}</Label>
          <Input id="br-name" value={form.name} maxLength={80} onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : brandSlug(name) }));
          }} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="br-slug">{t("slug")}</Label>
          <Input id="br-slug" value={form.slug} maxLength={80} className="font-mono" onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
          <p className="text-xs text-muted-foreground">{t("slug_hint", { slug: form.slug || "..." })}</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t("logo")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <Logo src={form.logo_url} name={form.name} size="lg" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}{t(form.logo_url ? "logo_change" : "logo_upload")}
            </Button>
            {form.logo_url && <Button type="button" variant="ghost" onClick={() => set("logo_url", null)}><X className="mr-1.5 h-4 w-4" />{t("logo_remove")}</Button>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("logo_hint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="grid gap-1.5">
          <Label htmlFor="br-site">{t("website")}</Label>
          <Input id="br-site" type="url" inputMode="url" placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("website_hint")}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="br-order">{t("order")}</Label>
          <Input id="br-order" inputMode="numeric" value={String(form.display_order)} onChange={(e) => set("display_order", Number(e.target.value.replace(/[^\d-]/g, "")) || 0)} />
          <p className="text-xs text-muted-foreground">{t("order_hint")}</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("description")}</legend>
        <p className="text-xs text-muted-foreground">{t("description_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCALES.map(([loc, label]) => (
            <div key={loc} className="grid gap-1">
              <Label htmlFor={`br-desc-${loc}`} className="text-xs text-muted-foreground">{t(label)}</Label>
              <Textarea id={`br-desc-${loc}`} rows={2} maxLength={400} value={form.description_i18n[loc] ?? ""}
                onChange={(e) => setForm((f) => {
                  const next = { ...f.description_i18n, [loc]: e.target.value };
                  if (!e.target.value.trim()) delete next[loc];
                  return { ...f, description_i18n: next };
                })} />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start justify-between gap-3 border-t pt-4">
        <span>
          <span className="block text-sm font-semibold">{t("is_active")}</span>
          <span className="block text-xs text-muted-foreground">{t("is_active_hint")}</span>
        </span>
        <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
      </label>
      <div className="flex items-center justify-end gap-3">
        {dirty && initial.id && <span className="text-xs font-medium text-amber-700">{t("unsaved")}</span>}
        <Button onClick={submit} disabled={save.isPending || uploading || !valid || (!!initial.id && !dirty)}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
        </Button>
      </div>
    </section>
  );
}

function BrandNew({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const { t } = useMessages(adminBrandsMessages);
  return (
    <AdminSubpage title={t("new")} subtitle={t("new_hint")} backLabel={t("back")} onBack={onBack}>
      <BrandFields initial={EMPTY} onSaved={onSaved} />
    </AdminSubpage>
  );
}

/* ---------- Página da marca ---------- */

function BrandPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminBrandsMessages);
  const { data: brands = [], isLoading } = useAdminBrands();
  const remove = useDeleteBrand();
  const { ask, confirmSlot } = useInlineConfirm();
  const b = brands.find((x) => x.id === id);
  const initial = useMemo<BrandInput | null>(() => {
    if (!b) return null;
    const { products: _n, ...rest } = b as AdminBrand;
    void _n;
    return rest;
  }, [b]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!b || !initial) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const del = async () => {
    if (!(await ask(t("delete_confirm", { name: b.name }), { description: t("delete_hint"), confirmLabel: t("delete"), tone: "danger" }))) return;
    remove.mutate(b.id, { onSuccess: () => { toast.success(t("deleted")); onBack(); }, onError: () => toast.error(t("save_error")) });
  };

  return (
    <AdminSubpage
      title={b.name}
      subtitle={`${productsLabel(t, b.products)} · ${b.is_active ? t("visible") : t("hidden")}`}
      backLabel={t("back")}
      onBack={onBack}
      actions={(
        <>
          {b.is_active && <Button variant="outline" asChild><a href={`/produtos?marca=${encodeURIComponent(b.slug)}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("view_store")}</a></Button>}
          <Button variant="outline" onClick={del} disabled={remove.isPending} className="text-destructive hover:text-destructive"><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
        </>
      )}
    >
      {confirmSlot}
      <BrandFields initial={initial} onSaved={() => undefined} />
      <BrandProducts brandId={b.id} />
    </AdminSubpage>
  );
}

function BrandProducts({ brandId }: { brandId: string }) {
  const { t } = useMessages(adminBrandsMessages);
  const { data: products = [], isLoading } = useBrandProducts(brandId);
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{t("products_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("products_hint")}</p>
      </div>
      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : products.length === 0 ? <p className="rounded-[14px] border border-dashed p-4 text-center text-sm text-muted-foreground">{t("products_none")}</p>
          : (
            <ul className="divide-y rounded-[14px] border">
              {products.map((p) => (
                <li key={p.id}>
                  <Link to={adminHref.product(p.id)} className="flex items-center gap-3 p-2.5 transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                    {p.image ? <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                      : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><ImageOff className="h-4 w-4" /></span>}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {!p.is_active && <span className="text-xs text-amber-700">{t("product_hidden")}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

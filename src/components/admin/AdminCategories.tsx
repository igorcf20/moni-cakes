// =====================================================================================
// Admin > Categorias: as categorias da loja, que também formam o menu do site.
//
//   Lista em árvore      categorias principais e, por baixo, as subcategorias (parent_id), pela ordem do menu;
//                        setas trocam a ordem com a vizinha (display_order).
//   Catálogo padrão      sem categorias principais no menu, o site mostra o catálogo em código
//                        (src/lib/catalog.ts); o botão "Copiar categorias padrão" grava-o aqui para editar.
//   Formulário           nome (+ outros idiomas em name_i18n), endereço (slug), categoria principal,
//                        ícone, foto, link interno opcional, descrição, SEO, "Mostrar no menu" e "Ativa".
//   Produtos             associação em lote pela tabela product_categories.
//   Menu (ver=menu)      categorias em destaque com banner no menu Todas as categorias (categories/MegaMenuSettings.tsx).
//
// O site lê estas linhas em src/hooks/useCatalogMenu.ts; depois de gravar, invalida CATEGORIES_QUERY_KEY.
// Textos em src/i18n/adminCategories.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, BarChart3, CornerDownRight, Copy, Image as ImageIcon, LayoutGrid, Package, Pencil, Plus, Search, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import { useAdminPage } from "./AdminSubpage";
import MegaMenuSettings, { MegaMenuSummary } from "./categories/MegaMenuSettings";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { ImageUploader } from "./ImageUploader";
import { CATEGORIES_QUERY_KEY } from "@/hooks/useCatalogMenu";
import { CATEGORY_ICONS, defaultMenuAsRows, subSlugOf } from "@/lib/catalogMenu";
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, useMessages } from "@/i18n";
import { adminCategoriesMessages } from "@/i18n/adminCategories";
import { cn } from "@/lib/utils";

export type CategoryFormRow = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_active: boolean | null;
  display_order: number | null;
  icon?: string | null;
  name_i18n?: Record<string, string> | null;
  link_url?: string | null;
  show_in_menu?: boolean | null;
};

type Row = CategoryFormRow;

const ADMIN_KEY = ["admin-categories"] as const;
const OTHER_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
const NO_PARENT = "__none__";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINK_RE = /^\/(?!\/)\S*$/;
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const byOrder = (a: Row, b: Row) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name);
const db = supabase as any;

/** Depois de qualquer gravação: lista do Admin, menu do site e Primeiros passos. */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ADMIN_KEY });
    qc.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["admin-start-status"] });
    qc.invalidateQueries({ queryKey: ["admin-catalog-index"] });
  };
}

// ─────────────────────────────────────────────
// Seção: lista ou a página do menu Todas as categorias (ver=menu, categories/MegaMenuSettings.tsx)
// ─────────────────────────────────────────────
export const AdminCategories = () => {
  const page = useAdminPage();
  if (page.view === "menu") return <MegaMenuSettings onBack={page.close} />;
  return <CategoryListPage onOpenMenu={() => page.open("menu")} />;
};

// ─────────────────────────────────────────────
// Lista
// ─────────────────────────────────────────────
const CategoryListPage = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const { t } = useMessages(adminCategoriesMessages);
  const refresh = useRefresh();
  const navigate = useNavigate();
  const { ask, confirmSlot } = useInlineConfirm();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await db.from("categories").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Árvore: principais pela ordem, cada uma seguida das suas subcategorias (órfãs no fim, como principais).
  const tree = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const tops = rows.filter((r) => !r.parent_id || !ids.has(r.parent_id)).sort(byOrder);
    return tops.map((top) => ({ top, kids: rows.filter((r) => r.parent_id === top.id).sort(byOrder) }));
  }, [rows]);
  const usingDefaults = !rows.some((r) => !r.parent_id && r.is_active !== false && r.show_in_menu !== false);

  const copyDefaults = useMutation({
    mutationFn: async () => {
      const existing = new Map(rows.map((r) => [r.slug, r.id]));
      for (const { top, subs } of defaultMenuAsRows()) {
        let parentId = existing.get(top.slug);
        if (!parentId) {
          const { data, error } = await db.from("categories").insert({ ...top, is_active: true }).select("id").single();
          if (error) throw error;
          parentId = data.id as string;
        }
        const missing = subs.filter((s) => !existing.has(s.slug));
        if (missing.length) {
          const { error } = await db.from("categories").insert(
            missing.map((s, i) => ({ ...s, parent_id: parentId, is_active: true, show_in_menu: true, display_order: i + 1 })),
          );
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { refresh(); toast.success(t("copied")); },
    onError: () => { refresh(); toast.error(t("copy_error")); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success(t("deleted")); },
    onError: () => toast.error(t("delete_error")),
  });

  // Troca a ordem com a vizinha; renumera o grupo para não depender de números repetidos.
  const move = useMutation({
    mutationFn: async ({ group, index, dir }: { group: Row[]; index: number; dir: -1 | 1 }) => {
      const next = [...group];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      for (const [i, r] of next.entries()) {
        if ((r.display_order ?? 0) === i + 1) continue;
        const { error } = await db.from("categories").update({ display_order: i + 1 }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
    onError: () => { refresh(); toast.error(t("order_error")); },
  });

  // Criar e editar abrem em página própria (sem janela por cima); apagar pede confirmação na própria página.
  const openForm = (row: Row | null) => navigate(row ? adminHref.editCategory(row.id) : adminHref.newCategory());
  const askDelete = async (row: Row) => {
    const n = rows.filter((r) => r.parent_id === row.id).length;
    const text = n ? t("confirm_delete_children", { name: row.name, n }) : t("confirm_delete", { name: row.name });
    if (await ask(text, { confirmLabel: t("remove") })) remove.mutate(row.id);
  };

  if (isLoading) return <div className="flex justify-center p-8">{t("loading")}</div>;

  const tops = tree.map((g) => g.top);
  const line = (row: Row, group: Row[], index: number, parent: Row | null) => {
    const isSub = !!parent;
    const Icon = CATEGORY_ICONS[row.icon ?? ""] ?? (isSub ? null : LayoutGrid);
    const translations = Object.values(row.name_i18n ?? {}).filter((v) => typeof v === "string" && v.trim()).length;
    const address = row.link_url || (parent ? `/categoria/${parent.slug}?sub=${subSlugOf(parent.slug, row.slug)}` : `/categoria/${row.slug}`);
    return (
      <li key={row.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap", isSub && "pl-8 sm:pl-12")}>
        {isSub && <CornerDownRight className="-ml-5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        {row.image_url ? (
          <img src={row.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-primary">
            {Icon ? <Icon className="h-5 w-5" strokeWidth={1.8} /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Link to={adminHref.category(row.id)} className={cn("block truncate font-medium hover:underline", isSub && "text-[15px]")}>{row.name}</Link>
          <p className="truncate text-xs text-muted-foreground">
            {address}
            {translations > 0 && <> · {t("translations_count", { n: translations })}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          {row.show_in_menu === false && <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{t("col_menu")}: {t("no")}</span>}
          {row.is_active === false && <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{t("inactive")}</span>}
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={index === 0 || move.isPending} onClick={() => move.mutate({ group, index, dir: -1 })} aria-label={t("move_up")} title={t("move_up")}><ArrowUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={index === group.length - 1 || move.isPending} onClick={() => move.mutate({ group, index, dir: 1 })} aria-label={t("move_down")} title={t("move_down")}><ArrowDown className="h-4 w-4" /></Button>
          <Button asChild variant="ghost" size="icon" className="h-9 w-9"><Link to={adminHref.category(row.id)} aria-label={t("stats")} title={t("stats")}><BarChart3 className="h-4 w-4" /></Link></Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openForm(row)} aria-label={t("edit")} title={t("edit")}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => askDelete(row)} aria-label={t("remove")} title={t("remove")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <AdminHelp id="categorias" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <MegaMenuSummary onOpen={onOpenMenu} />

      {usingDefaults && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold">{t("default_title")}</p>
            <p className="mt-1 text-sm">{t("default_text")}</p>
          </div>
          <Button variant="outline" className="shrink-0 bg-white" disabled={copyDefaults.isPending} onClick={() => copyDefaults.mutate()}>
            <Copy className="mr-2 h-4 w-4" />{copyDefaults.isPending ? t("copying") : t("copy_defaults")}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{t("list_title")}</CardTitle>
          <Button onClick={() => openForm(null)}><Plus className="mr-2 h-4 w-4" />{t("new_category")}</Button>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {tree.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground sm:px-0">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border sm:rounded-xl sm:border">
              {tree.map(({ top, kids }, i) => [
                line(top, tops, i, null),
                ...kids.map((k, j) => line(k, kids, j, top)),
              ])}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirmSlot}
    </div>
  );
};

// ─────────────────────────────────────────────
// Formulário
// ─────────────────────────────────────────────
function Hint({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Formulário da categoria, usado na página própria (src/pages/admin/AdminCategoryFormPage.tsx). onClose recebe o id gravado. */
export const CategoryForm = ({ category, rows, onClose }: { category: Row | null; rows: Row[]; onClose: (savedId?: string) => void }) => {
  const { t } = useMessages(adminCategoriesMessages);
  const refresh = useRefresh();
  const [form, setForm] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parent_id: category?.parent_id ?? null,
    icon: category?.icon ?? null,
    image_url: category?.image_url ?? "",
    name_i18n: { ...(category?.name_i18n ?? {}) } as Record<string, string>,
    link_url: category?.link_url ?? "",
    description: category?.description ?? "",
    seo_title: category?.seo_title ?? "",
    seo_description: category?.seo_description ?? "",
    display_order: category?.display_order ?? (rows.filter((r) => !r.parent_id).length + 1),
    show_in_menu: category?.show_in_menu ?? true,
    is_active: category?.is_active ?? true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Só categorias principais podem ter subcategorias (o menu tem dois níveis); uma com filhas não pode virar sub.
  const hasKids = !!category && rows.some((r) => r.parent_id === category.id);
  const parents = rows.filter((r) => !r.parent_id && r.id !== category?.id).sort(byOrder);
  const parent = rows.find((r) => r.id === form.parent_id) ?? null;
  const isSub = !!form.parent_id;

  const slugValue = form.slug.trim() || (form.name ? (parent ? `${parent.slug}-${slugify(form.name)}` : slugify(form.name)) : "");
  const slugError = form.slug.trim() && !SLUG_RE.test(form.slug.trim()) ? t("slug_invalid") : null;
  const linkError = form.link_url.trim() && !LINK_RE.test(form.link_url.trim()) ? t("link_invalid") : null;

  const save = useMutation({
    mutationFn: async () => {
      const name_i18n = Object.fromEntries(Object.entries(form.name_i18n).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const payload = {
        name: form.name.trim(),
        slug: slugValue,
        parent_id: form.parent_id,
        icon: form.icon,
        image_url: form.image_url || null,
        name_i18n,
        link_url: isSub && form.link_url.trim() ? form.link_url.trim() : null,
        description: form.description || null,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        display_order: form.display_order,
        show_in_menu: form.show_in_menu,
        is_active: form.is_active,
      };
      const { data, error } = category
        ? await db.from("categories").update(payload).eq("id", category.id)
        : await db.from("categories").insert(payload).select("id").single();
      if (error) throw error;
      return category ? category.id : (data as { id: string }).id;
    },
    onSuccess: (id: string) => { refresh(); toast.success(category ? t("updated") : t("created")); onClose(id); },
    onError: (e: { code?: string }) => toast.error(e?.code === "23505" ? t("slug_taken") : t("save_error")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t("name_required"));
    if (slugError || linkError || !slugValue) return;
    save.mutate();
  };

  return (
    <Tabs defaultValue="info">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="info" className="flex-1 gap-1.5"><ImageIcon className="h-4 w-4" />{t("tab_info")}</TabsTrigger>
        <TabsTrigger value="products" className="flex-1 gap-1.5" disabled={!category}>
          <Package className="h-4 w-4" />{t("tab_products")} {!category && t("save_first")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">{t("name")} *</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              <Hint>{t("name_hint")}</Hint>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">{t("slug")}</Label>
              <Input id="cat-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugValue || "minha-categoria"} aria-invalid={!!slugError} />
              {slugError ? <p className="text-xs text-destructive">{slugError}</p> : <Hint>{t("slug_hint")}</Hint>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("parent")}</Label>
            <Select value={form.parent_id ?? NO_PARENT} onValueChange={(v) => set("parent_id", v === NO_PARENT ? null : v)} disabled={hasKids}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>{t("parent_none")}</SelectItem>
                {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Hint>{t("parent_hint")}</Hint>
          </div>

          {!isSub && (
            <div className="space-y-1.5">
              <Label>{t("icon")}</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("icon")}>
                {Object.entries(CATEGORY_ICONS).map(([id, Icon]) => {
                  const on = (form.icon ?? "LayoutGrid") === id;
                  return (
                    <button
                      key={id} type="button" role="radio" aria-checked={on} title={id} aria-label={id} onClick={() => set("icon", id)}
                      className={cn("grid h-10 w-10 place-items-center rounded-xl border transition-colors", on ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </button>
                  );
                })}
              </div>
              <Hint>{t("icon_hint")}</Hint>
            </div>
          )}

          {!isSub && (
            <div className="space-y-1.5">
              <ImageUploader category="category" currentImage={form.image_url} onImageUploaded={(url) => set("image_url", url)} />
              <Hint>{t("image_hint")}</Hint>
            </div>
          )}

          <fieldset className="space-y-2 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t("translations")}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {OTHER_LOCALES.map((l) => (
                <div key={l} className="space-y-1">
                  <Label htmlFor={`cat-name-${l}`} className="text-xs">{LOCALE_NAMES[l]}</Label>
                  <Input id={`cat-name-${l}`} value={form.name_i18n[l] ?? ""} placeholder={form.name} onChange={(e) => set("name_i18n", { ...form.name_i18n, [l]: e.target.value })} />
                </div>
              ))}
            </div>
            <Hint>{t("translations_hint")}</Hint>
          </fieldset>

          {isSub && (
            <div className="space-y-1.5">
              <Label htmlFor="cat-link">{t("link")}</Label>
              <Input id="cat-link" value={form.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="/personalizar" aria-invalid={!!linkError} />
              {linkError ? <p className="text-xs text-destructive">{linkError}</p> : <Hint>{t("link_hint")}</Hint>}
            </div>
          )}

          {!isSub && (
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">{t("description")}</Label>
              <Textarea id="cat-desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
              <Hint>{t("description_hint")}</Hint>
            </div>
          )}

          {!isSub && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-seo-title">{t("seo_title")}</Label>
                <Input id="cat-seo-title" value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} maxLength={70} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-seo-desc">{t("seo_description")}</Label>
                <Textarea id="cat-seo-desc" value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} rows={2} maxLength={170} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-start">
            <div className="space-y-1.5">
              <Label htmlFor="cat-order">{t("order")}</Label>
              <Input id="cat-order" type="number" value={form.display_order} onChange={(e) => set("display_order", parseInt(e.target.value) || 0)} />
            </div>
            <Hint>{t("order_hint")}</Hint>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch id="cat-menu" checked={form.show_in_menu} onCheckedChange={(v) => set("show_in_menu", v)} />
              <Label htmlFor="cat-menu">{t("show_in_menu")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="cat-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label htmlFor="cat-active">{t("is_active")}</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onClose()}>{t("cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
          </div>
        </form>
      </TabsContent>

      <TabsContent value="products">{category && <CategoryProducts categoryId={category.id} onClose={onClose} />}</TabsContent>
    </Tabs>
  );
};

// ─────────────────────────────────────────────
// Produtos da categoria (product_categories)
// ─────────────────────────────────────────────
function CategoryProducts({ categoryId, onClose }: { categoryId: string; onClose: (savedId?: string) => void }) {
  const { t } = useMessages(adminCategoriesMessages);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["admin-all-products-for-category"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id, name, category, image").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; category: string | null; image: string | null }[];
    },
  });
  const { data: linked } = useQuery({
    queryKey: ["category-products", categoryId],
    queryFn: async () => {
      const { data, error } = await db.from("product_categories").select("product_id").eq("category_id", categoryId);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: { product_id: string }) => r.product_id));
    },
  });
  const chosen = selected ?? linked ?? new Set<string>();

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await db.from("product_categories").delete().eq("category_id", categoryId);
      if (delErr) throw delErr;
      if (!chosen.size) return;
      const { error } = await db.from("product_categories").insert([...chosen].map((product_id) => ({ category_id: categoryId, product_id })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-products", categoryId] });
      qc.invalidateQueries({ queryKey: ["catalog-products"] });
      qc.invalidateQueries({ queryKey: ["admin-catalog-index"] });
      toast.success(t("products_saved"));
    },
    onError: () => toast.error(t("products_error")),
  });

  const q = search.toLowerCase();
  const visible = products.filter((p) => p.name.toLowerCase().includes(q));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("products_title")}</p>
          <p className="text-xs text-muted-foreground">{t("products_count", { n: chosen.size, total: products.length })}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set([...chosen, ...visible.map((p) => p.id)]))}>{t("select_all")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t("clear")}</Button>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={t("search_product")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ScrollArea className="h-[340px] rounded-lg border border-border p-2">
        <div className="space-y-1">
          {visible.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
              <Checkbox checked={chosen.has(p.id)} onCheckedChange={() => toggle(p.id)} />
              {p.image && <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                {p.category && <p className="text-[11px] text-muted-foreground">{p.category}</p>}
              </div>
            </label>
          ))}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("no_products")}</p>}
        </div>
      </ScrollArea>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onClose()}>{t("cancel")}</Button>
        <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? t("saving") : t("save_products", { n: chosen.size })}</Button>
      </div>
    </div>
  );
}

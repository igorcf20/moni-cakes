import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmStrip } from "./shell/AdminPageParts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { adminHref } from "@/components/admin/shell/adminSections";
import {
  Plus, Search, MoreVertical, Pencil, Trash2, Eye, EyeOff, Copy,
  Star, StarOff, Package, Ruler, Palette, ExternalLink,
  AlertCircle, Sparkles, ShoppingBag, ArrowUp, ArrowDown,
  Download, PackageX, ArrowUpDown, List, LayoutGrid, BarChart3
} from "lucide-react";
import { formatPrice } from "@/utils/currency";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPager, AdminStatCard } from "./AdminListKit";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { downloadCsv, csvNumber } from "@/lib/csv";
import { useMessages } from "@/i18n";
import { adminManageMessages, type AdminManageKey } from "@/i18n/adminManage";

type ProductSort = "manual" | "newest" | "name" | "price_asc" | "price_desc" | "stock" | "sales";
const VIEW_KEY = "admin-products-view";

const AdminProducts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [sort, setSort] = useState<ProductSort>("manual");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Lista ou grade: lembrado neste navegador (preferência de quem usa o painel).
  const [view, setViewState] = useState<"list" | "grid">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list"; } catch { return "list"; }
  });
  const setView = (v: "list" | "grid") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sem armazenamento */ } };
  const { t } = useMessages(adminManageMessages);
  const fmt = useAdminFormat();

  // Fetch categories for filter
  const { data: dbCategories = [] } = useQuery({
    queryKey: ["adminProductCategories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("name")
        .order("display_order");
      if (error) throw error;
      return ["Todos", "Destaques", ...(data || []).map((c: any) => c.name)];
    },
  });



  const { data: products = [], isLoading, error: productsError, refetch } = useQuery({
    queryKey: ["adminProducts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const categoriesToUse = Array.from(new Set([
    "Todos", "Destaques", ...dbCategories,
    ...products.map((product: any) => product.category).filter(Boolean),
  ])) as string[];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = supabase as any;
      // Limpa dependências que podem não ter ON DELETE CASCADE
      await sb.from("product_variation_sizes").delete().in(
        "variation_id",
        (await sb.from("product_variations").select("id").eq("product_id", id)).data?.map((v: any) => v.id) ?? []
      );
      await sb.from("product_variations").delete().eq("product_id", id);
      await sb.from("product_images").delete().eq("product_id", id);
      await sb.from("product_sizes").delete().eq("product_id", id);
      await sb.from("product_categories").delete().eq("product_id", id);
      await sb.from("product_frame_pricing").delete().eq("product_id", id);
      await sb.from("related_products").delete().or(`product_id.eq.${id},related_product_id.eq.${id}`);
      await sb.from("wishlist").delete().eq("product_id", id);
      await sb.from("product_reviews").delete().eq("product_id", id);
      await sb.from("product_views").delete().eq("product_id", id);
      await sb.from("kit_items").delete().eq("product_id", id);
      await sb.from("home_section_items").delete().eq("product_id", id);
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      toast.success("Produto deletado!");
      setDeleteId(null);
    },
    onError: (e: any) =>
      toast.error(
        e?.message?.includes("order_items")
          ? "Não é possível eliminar: produto já está associado a pedidos. Considere desativá-lo."
          : `Erro ao eliminar produto: ${e?.message ?? "desconhecido"}`
      ),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, is_featured }: { id: string; is_featured: boolean }) => {
      const update: Record<string, unknown> = { is_featured };
      if (is_featured) {
        const { data: lastFeatured } = await (supabase as any)
          .from("products")
          .select("featured_display_order")
          .eq("is_featured", true)
          .order("featured_display_order", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        update.featured_display_order = Number(lastFeatured?.featured_display_order ?? -1) + 1;
      }
      let { error } = await (supabase as any).from("products").update(update).eq("id", id);
      if (error && is_featured && (error.code === "42703" || /featured_display_order/i.test(error.message || ""))) {
        ({ error } = await (supabase as any).from("products").update({ is_featured }).eq("id", id));
      }
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      toast.success(vars.is_featured ? "Produto destacado!" : "Destaque removido");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = supabase as any;
      const { data: original, error: fetchErr } = await sb
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!original) throw new Error("Produto não encontrado");
      const ts = Date.now().toString(36);
      const newId = `${original.id}-copia-${ts}`.slice(0, 80);
      const { id: _omit, created_at, updated_at, ...rest } = original;
      const { data: lastProduct } = await sb
        .from("products")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const copy: any = {
        ...rest,
        id: newId,
        name: `${original.name} (Cópia)`,
        is_featured: false,
        is_active: false,
        display_order: Number(lastProduct?.display_order ?? -1) + 1,
      };
      if (rest.slug) {
        copy.slug = `${rest.slug}-copia-${ts}`.slice(0, 80);
      }
      try {
        const { error: insErr } = await sb.from("products").insert([copy]);
        if (insErr) throw insErr;

      // Helper: strip id/created_at/updated_at and rewrite product_id
      const clean = (row: any) => {
        const { id: _i, created_at: _c, updated_at: _u, ...r } = row;
        return { ...r, product_id: newId };
      };

      // 1) product_sizes  (id → newSizeId map for availability rewrite)
      const sizeIdMap = new Map<string, string>();
      const { data: sizes } = await sb.from("product_sizes").select("*").eq("product_id", id);
      if (sizes?.length) {
        const rows = sizes.map((s: any) => {
          const { id: oldId, created_at, ...rest } = s;
          const newRow = { ...rest, product_id: newId };
          return { oldId, newRow };
        });
        const { data: inserted, error } = await sb
          .from("product_sizes")
          .insert(rows.map((r) => r.newRow))
          .select("id, size_label");
        if (error) throw error;
        // map by size_label (unique per product)
        const byLabel = new Map((inserted || []).map((x: any) => [x.size_label, x.id]));
        sizes.forEach((s: any) => {
          const nid = byLabel.get(s.size_label);
          if (nid) sizeIdMap.set(s.id, nid as string);
        });
      }

      // 2) product_variations (with id map)
      const varIdMap = new Map<string, string>();
      const { data: variations } = await sb.from("product_variations").select("*").eq("product_id", id);
      if (variations?.length) {
        for (const v of variations) {
          const { id: oldId, created_at, ...rest } = v;
          const { data: ins, error } = await sb
            .from("product_variations")
            .insert([{ ...rest, product_id: newId }])
            .select("id")
            .single();
          if (error) throw error;
          varIdMap.set(oldId, ins.id);
        }

        // 2a) product_variation_sizes
        const varIds = variations.map((v: any) => v.id);
        const { data: vsizes } = await sb.from("product_variation_sizes").select("*").in("variation_id", varIds);
        if (vsizes?.length) {
          const rows = vsizes.map((vs: any) => {
            const { id: _i, created_at, ...rest } = vs;
            return { ...rest, variation_id: varIdMap.get(vs.variation_id) };
          });
          const { error } = await sb.from("product_variation_sizes").insert(rows);
          if (error) throw error;
        }

        // 2b) product_variation_size_availability
        const { data: avail } = await sb
          .from("product_variation_size_availability")
          .select("*")
          .in("variation_id", varIds);
        if (avail?.length) {
          const rows = avail
            .map((a: any) => {
              const { id: _i, created_at, ...rest } = a;
              return {
                ...rest,
                variation_id: varIdMap.get(a.variation_id),
                product_size_id: sizeIdMap.get(a.product_size_id) ?? a.product_size_id,
              };
            })
            .filter((r: any) => r.variation_id);
          if (rows.length) {
            const { error } = await sb.from("product_variation_size_availability").insert(rows);
            if (error) throw error;
          }
        }
      }

      // 3) product_images (rewrite variation_id via map)
      const { data: images } = await sb.from("product_images").select("*").eq("product_id", id);
      if (images?.length) {
        const rows = images.map((im: any) => {
          const { id: _i, created_at, ...rest } = im;
          return {
            ...rest,
            product_id: newId,
            variation_id: im.variation_id ? varIdMap.get(im.variation_id) ?? null : null,
          };
        });
        const { error } = await sb.from("product_images").insert(rows);
        if (error) throw error;
      }

      // 4) product_categories
      const { data: pcats } = await sb.from("product_categories").select("*").eq("product_id", id);
      if (pcats?.length) {
        const rows = pcats.map(clean);
        const { error } = await sb.from("product_categories").insert(rows);
        if (error) throw error;
      }

      // 5) product_frame_pricing
      const { data: fp } = await sb.from("product_frame_pricing").select("*").eq("product_id", id);
      if (fp?.length) {
        const rows = fp.map(clean);
        const { error } = await sb.from("product_frame_pricing").insert(rows);
        if (error) throw error;
      }

      // 6) product_faqs
      const { data: faqs } = await sb.from("product_faqs").select("*").eq("product_id", id);
      if (faqs?.length) {
        const rows = faqs.map(clean);
        const { error } = await sb.from("product_faqs").insert(rows);
        if (error) throw error;
      }

      // 7) product_volume_tiers
      const { data: tiers } = await sb.from("product_volume_tiers").select("*").eq("product_id", id);
      if (tiers?.length) {
        const rows = tiers.map(clean);
        const { error } = await sb.from("product_volume_tiers").insert(rows);
        if (error) throw error;
      }

      // 8) related_products (only outbound)
      const { data: rel } = await sb.from("related_products").select("*").eq("product_id", id);
      if (rel?.length) {
        const rows = rel.map(clean);
        const { error } = await sb.from("related_products").insert(rows);
        if (error) throw error;
      }

      // 9) Configuração completa do produto personalizável e dados auxiliares.
      // Os registos são cópias independentes; editar a cópia nunca altera o original.
      for (const table of ["product_print_areas", "product_3d_models", "product_colors"]) {
        const { data: related, error: relatedReadError } = await sb.from(table).select("*").eq("product_id", id);
        if (relatedReadError) throw relatedReadError;
        if (related?.length) {
          for (const row of related) {
            const { data: insertedRow, error: relatedInsertError } = await sb.from(table).insert(clean(row)).select("*").single();
            if (relatedInsertError) throw relatedInsertError;
            if (table === "product_print_areas") {
              const { data: techniques, error: techniqueError } = await sb.from("product_print_area_techniques").select("*").eq("print_area_id", row.id);
              if (techniqueError && !["42P01", "PGRST205"].includes(techniqueError.code)) throw techniqueError;
              for (const technique of techniques ?? []) {
                const { id: sourceTechniqueId, created_at, updated_at, ...techniqueData } = technique;
                const { data: insertedTechnique, error: insertTechniqueError } = await sb.from("product_print_area_techniques")
                  .insert({ ...techniqueData, print_area_id: insertedRow.id }).select("id").single();
                if (insertTechniqueError) throw insertTechniqueError;
                const { data: materials, error: materialsError } = await sb.from("product_print_area_technique_materials")
                  .select("*").eq("area_technique_id", sourceTechniqueId);
                if (materialsError) throw materialsError;
                if (materials?.length) {
                  const { error: insertMaterialsError } = await sb.from("product_print_area_technique_materials").insert(
                    materials.map(({ id, created_at, updated_at, ...material }: any) => ({ ...material, area_technique_id: insertedTechnique.id })),
                  );
                  if (insertMaterialsError) throw insertMaterialsError;
                }
              }
            }
          }
        }
      }

      return newId;
      } catch (error) {
        // Duplicação é uma operação única para o utilizador. Se qualquer parte
        // falhar, removemos a cópia incompleta e mantemos o original intocado.
        await sb.from("products").delete().eq("id", newId);
        throw error;
      }
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      toast.success("Produto duplicado como rascunho. Reveja e ative quando estiver pronto.");
      navigate(`/admin/produto/${newId}`);
    },
    onError: (e: any) => toast.error(`Erro ao duplicar: ${e.message}`),
  });

  const updateStock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await (supabase as any).from("products").update({ stock_quantity: stock }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      toast.success(t("stock_saved"));
      queryClient.invalidateQueries({ queryKey: ["admin-attention"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("products").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      toast.success(vars.is_active ? t("product_activated") : t("product_deactivated"));
      queryClient.invalidateQueries({ queryKey: ["admin-attention"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? "desconhecido"}`),
  });

  const orderField = categoryFilter === "Destaques"
    ? "featured_display_order"
    : categoryFilter === "Todos"
      ? "display_order"
      : "category_display_order";

  const updateOrder = useMutation({
    mutationFn: async ({ rows, field }: { rows: { id: string; position: number }[]; field: string }) => {
      for (const r of rows) {
        const { error } = await (supabase as any)
          .from("products")
          .update({ [field]: r.position })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminProducts"] }),
    onError: () => toast.error("Erro ao reordenar"),
  });

  const moveProduct = (id: string, dir: -1 | 1) => {
    const idx = filtered.findIndex((p: any) => p.id === id);
    const other = filtered[idx + dir];
    if (!other) return;
    const a = filtered[idx];
    const aOrder = a[orderField] ?? a.display_order ?? idx;
    const bOrder = other[orderField] ?? other.display_order ?? idx + dir;
    updateOrder.mutate({
      field: orderField,
      rows: [
        { id: a.id, position: bOrder },
        { id: other.id, position: aOrder },
      ],
    });
  };

  const moveProductFirst = (id: string) => {
    const reordered = [
      ...filtered.filter((product: any) => product.id === id),
      ...filtered.filter((product: any) => product.id !== id),
    ];
    updateOrder.mutate({
      field: orderField,
      rows: reordered.map((product: any, position: number) => ({ id: product.id, position })),
    });
  };

  // Estoque só conta em produtos não personalizáveis (os personalizados são feitos sob encomenda).
  const tracksStock = (p: any) => !p.customizable && p.stock_quantity !== null && p.stock_quantity !== undefined;
  const isOut = (p: any) => tracksStock(p) && Number(p.stock_quantity) <= 0;
  const isLow = (p: any) => tracksStock(p) && Number(p.stock_quantity) > 0 && Number(p.stock_quantity) <= 5;
  const effectivePrice = (p: any) =>
    p.promo_active && p.promo_value
      ? p.promo_type === "percent" || p.promo_type === "percentage"
        ? Number(p.price) * (1 - Number(p.promo_value) / 100)
        : p.promo_type === "fixed_price" ? Number(p.promo_value) : Math.max(0, Number(p.price) - Number(p.promo_value))
      : Number(p.price);

  const filtered = products.filter((p: any) => {
    const normalizedSearch = search.trim().toLocaleLowerCase(fmt.locale);
    const matchSearch = !normalizedSearch ||
      p.name?.toLocaleLowerCase(fmt.locale).includes(normalizedSearch) ||
      p.id?.toLocaleLowerCase(fmt.locale).includes(normalizedSearch) ||
      String(p.sku ?? "").toLocaleLowerCase(fmt.locale).includes(normalizedSearch) ||
      p.category?.toLocaleLowerCase(fmt.locale).includes(normalizedSearch);
    const matchCat = categoryFilter === "Todos" ||
      (categoryFilter === "Destaques" ? p.is_featured : p.category === categoryFilter);
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? p.is_active !== false : p.is_active === false);
    const matchStock = stockFilter === "all" || (stockFilter === "out" ? isOut(p) : isLow(p));
    return matchSearch && matchCat && matchStatus && matchStock;
  }).sort((a: any, b: any) => {
    switch (sort) {
      case "name": return String(a.name).localeCompare(String(b.name), fmt.locale);
      case "price_asc": return effectivePrice(a) - effectivePrice(b);
      case "price_desc": return effectivePrice(b) - effectivePrice(a);
      case "stock": return Number(a.stock_quantity ?? 0) - Number(b.stock_quantity ?? 0);
      case "sales": return Number(b.sales_count ?? 0) - Number(a.sales_count ?? 0);
      case "newest": return String(b.created_at).localeCompare(String(a.created_at));
      default: {
        const aOrder = a[orderField] ?? a.display_order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b[orderField] ?? b.display_order ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || String(a.name).localeCompare(String(b.name), fmt.locale);
      }
    }
  });
  const manualOrder = sort === "manual";
  const paged = usePaged(filtered, 25);

  // Números do topo (cada cartão também é um filtro)
  const totalProducts = products.length;
  const activeCount = products.filter((p: any) => p.is_active !== false).length;
  const lowStockCount = products.filter(isLow).length;
  const outOfStockCount = products.filter(isOut).length;

  // Ações em vários produtos de uma vez
  const selectedList = filtered.filter((p: any) => selected.has(p.id));
  const allOnPageSelected = paged.items.length > 0 && paged.items.every((p: any) => selected.has(p.id));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPageSelected) paged.items.forEach((p: any) => n.delete(p.id)); else paged.items.forEach((p: any) => n.add(p.id));
    return n;
  });
  const bulkUpdate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const ids = Array.from(selected);
      const { error } = await (supabase as any).from("products").update(patch).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-attention"] });
      toast.success(t("bulk_done", { n }));
      setSelected(new Set());
    },
    onError: (e: any) => toast.error(t("bulk_error"), { description: e?.message }),
  });

  const exportCsv = () => {
    const list = selectedList.length ? selectedList : filtered;
    downloadCsv(t("csv_products_file"), [t("csv_id"), t("csv_name"), t("csv_category"), t("csv_price"), t("csv_promo_price"), t("csv_cost"), t("csv_stock"), t("csv_sales"), t("csv_active"), t("csv_featured")],
      list.map((p: any) => [
        p.id, p.name, p.category,
        csvNumber(Number(p.price || 0), fmt.locale),
        p.promo_active ? csvNumber(effectivePrice(p), fmt.locale) : "",
        p.cost_price != null ? csvNumber(Number(p.cost_price), fmt.locale) : "",
        p.customizable ? "" : p.stock_quantity ?? "",
        p.sales_count ?? 0,
        p.is_active === false ? t("no") : t("yes"),
        p.is_featured ? t("yes") : t("no"),
      ]));
  };

  const actionsFor = (product: any) => ({
    onEdit: () => navigate(`/admin/produto/${product.id}`),
    onStats: () => navigate(adminHref.productStats(product.id)),
    onView: () => window.open(`/produto/${product.id}`, "_blank"),
    onDelete: () => setDeleteId(product.id),
    onToggleFeatured: () => toggleFeatured.mutate({ id: product.id, is_featured: !product.is_featured }),
    onUpdateStock: (stock: number) => updateStock.mutate({ id: product.id, stock }),
    onManageSizes: () => navigate(`/admin/produto/${product.id}?tab=sizes`),
    onManageVariations: () => navigate(`/admin/produto/${product.id}?tab=variations`),
    onMoveUp: () => moveProduct(product.id, -1),
    onMoveDown: () => moveProduct(product.id, 1),
    onMoveFirst: () => moveProductFirst(product.id),
    onDuplicate: () => { if (!duplicateMutation.isPending) duplicateMutation.mutate(product.id); },
    onToggleActive: () => toggleActive.mutate({ id: product.id, is_active: !(product.is_active !== false) }),
  });

  const clearFilters = () => { setSearch(""); setCategoryFilter("Todos"); setStatusFilter("all"); setStockFilter("all"); };
  const hasFilters = !!search || categoryFilter !== "Todos" || statusFilter !== "all" || stockFilter !== "all";

  return (
    <div className="space-y-5">
      {/* Topo: resumo e botão principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("products_summary", { total: totalProducts, active: activeCount })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> {t("export_csv")}
          </Button>
          <Button onClick={() => navigate("/admin/produto/novo")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("new_product")}
          </Button>
        </div>
      </div>

      {/* Números que também filtram */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard icon={ShoppingBag} label={t("stat_products")} value={totalProducts} active={!hasFilters} onClick={clearFilters} />
        <AdminStatCard icon={Eye} label={t("stat_active")} value={activeCount} tone="success" active={statusFilter === "active"} onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")} />
        <AdminStatCard icon={AlertCircle} label={t("stat_low_stock")} value={lowStockCount} tone="warning" active={stockFilter === "low"} onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")} />
        <AdminStatCard icon={PackageX} label={t("stat_out_of_stock")} value={outOfStockCount} tone="danger" active={stockFilter === "out"} onClick={() => setStockFilter(stockFilter === "out" ? "all" : "out")} />
      </div>

      {/* Busca, filtros, ordem e modo de ver */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9 text-base md:text-sm" placeholder={t("products_search")} aria-label={t("products_search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="col-span-2 sm:w-48" aria-label={t("category")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoriesToUse.map((c: string) => (
                <SelectItem key={c} value={c}>{c === "Todos" ? t("all_categories") : c === "Destaques" ? t("featured_only") : c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40" aria-label={t("product_status")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("status_all")}</SelectItem>
              <SelectItem value="active">{t("status_active")}</SelectItem>
              <SelectItem value="draft">{t("status_inactive")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as ProductSort)}>
            <SelectTrigger className="sm:w-48" aria-label={t("sort")}><ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["manual", "newest", "name", "price_asc", "price_desc", "stock", "sales"] as ProductSort[]).map((k) => (
                <SelectItem key={k} value={k}>{t(`sort_${k}` as AdminManageKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="group" aria-label={t("view_mode")} className="flex rounded-xl border bg-card p-0.5">
            {([["list", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} title={t(`view_${v}`)}
                className={`grid h-9 w-10 place-items-center rounded-[10px] transition-colors ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t(`view_${v}`)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p className="text-muted-foreground" aria-live="polite">{t("products_found", { n: filtered.length })}</p>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>{t("clear_filters")}</Button>}
        {!manualOrder && <p className="text-xs text-muted-foreground">{t("manual_order_hint")}</p>}
      </div>

      {/* Barra das ações em massa */}
      {selected.size > 0 && (
        <div className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-[18px] border bg-card p-3 shadow-sm">
          <p className="mr-2 text-sm font-semibold">{t("selected_n", { n: selected.size })}</p>
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ is_active: true })}><Eye className="h-4 w-4" aria-hidden="true" />{t("bulk_activate")}</Button>
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ is_active: false })}><EyeOff className="h-4 w-4" aria-hidden="true" />{t("bulk_deactivate")}</Button>
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ is_featured: true })}><Star className="h-4 w-4" aria-hidden="true" />{t("bulk_feature")}</Button>
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ is_featured: false })}><StarOff className="h-4 w-4" aria-hidden="true" />{t("bulk_unfeature")}</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" />{t("export_csv")}</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>{t("clear_selection")}</Button>
        </div>
      )}

      {/* Confirmação para apagar, na própria página */}
      <ConfirmStrip
        open={!!deleteId}
        title={t("delete_product_title")}
        description={<><strong className="text-foreground">{products.find((p: any) => p.id === deleteId)?.name}</strong>. {t("delete_product_text")}</>}
        confirmLabel={t("delete")}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }}
      />

      {duplicateMutation.isPending && <p role="status" className="rounded-xl border p-3 text-sm">{t("duplicating")}</p>}

      {productsError ? (
        <div role="alert" className="rounded-[18px] border p-6 space-y-3">
          <p>{t("products_load_error")}</p>
          <Button variant="outline" onClick={() => refetch()}>{t("retry")}</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">{totalProducts ? t("products_none_found") : t("products_empty")}</p>
          <p className="text-sm mt-1">{totalProducts ? t("products_none_found_hint") : t("products_empty_hint")}</p>
          {hasFilters ? <Button variant="outline" className="mt-4" onClick={clearFilters}>{t("clear_filters")}</Button>
            : <Button className="mt-4" onClick={() => navigate("/admin/produto/novo")}><Plus className="h-4 w-4" aria-hidden="true" />{t("new_product")}</Button>}
        </div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-[18px] border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allOnPageSelected} onCheckedChange={togglePage} aria-label={t("select_page")} /></TableHead>
                <TableHead>{t("col_product")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("category")}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t("col_price")}</TableHead>
                <TableHead className="hidden sm:table-cell w-32">{t("col_stock")}</TableHead>
                <TableHead className="hidden lg:table-cell text-right">{t("col_sales")}</TableHead>
                <TableHead className="w-14 px-2">{t("col_active")}</TableHead>
                <TableHead className="w-10 px-1"><span className="sr-only">{t("col_actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.items.map((p: any) => (
                <ProductRow key={p.id} product={p} selected={selected.has(p.id)} onSelect={() => toggleOne(p.id)}
                  money={fmt.money} price={effectivePrice(p)} low={isLow(p)} out={isOut(p)} manualOrder={manualOrder} {...actionsFor(p)} />
              ))}
            </TableBody>
          </Table>
          <div className="px-4 pb-4"><AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} /></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {paged.items.map((product: any) => (
              <ProductCard key={product.id} product={product} {...actionsFor(product)} />
            ))}
          </div>
          <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
        </>
      )}

    </div>
  );
};

// ─── Linha da lista de produtos ──────────────────────────────────────────────────
type ProductActions = {
  onEdit: () => void; onStats: () => void; onView: () => void; onDelete: () => void; onToggleFeatured: () => void; onUpdateStock: (stock: number) => void;
  onManageSizes: () => void; onManageVariations: () => void; onMoveUp: () => void; onMoveDown: () => void; onMoveFirst: () => void;
  onDuplicate: () => void; onToggleActive: () => void;
};

const ProductRow = ({
  product, selected, onSelect, money, price, low, out, manualOrder, ...a
}: ProductActions & { product: any; selected: boolean; onSelect: () => void; money: (v: number) => string; price: number; low: boolean; out: boolean; manualOrder: boolean }) => {
  const { t } = useMessages(adminManageMessages);
  const [stockEdit, setStockEdit] = useState<string | null>(null);
  const inactive = product.is_active === false;
  const promo = product.promo_active && price < Number(product.price);
  const saveStock = () => {
    if (stockEdit === null) return;
    const n = Math.max(0, Math.round(Number(stockEdit)));
    if (Number.isFinite(n) && n !== product.stock_quantity) a.onUpdateStock(n);
    setStockEdit(null);
  };
  return (
    <TableRow data-state={selected ? "selected" : undefined} className={inactive ? "bg-muted/30" : undefined}>
      <TableCell className="pr-1 sm:pr-4"><Checkbox checked={selected} onCheckedChange={onSelect} aria-label={t("select_product", { name: product.name })} /></TableCell>
      <TableCell>
        <button type="button" onClick={a.onStats} className="flex min-w-0 items-center gap-2 sm:gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border bg-muted sm:h-12 sm:w-12">
            {product.image ? <img src={product.image} alt="" loading="lazy" className={`h-full w-full object-cover ${inactive ? "opacity-50" : ""}`} />
              : <Package className="m-2.5 h-5 w-5 text-muted-foreground/50 sm:m-3.5" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block line-clamp-2 font-medium text-foreground hover:underline max-w-[130px] sm:line-clamp-1 sm:max-w-[260px]">{product.name}</span>
            <span className="block text-sm font-semibold tabular-nums sm:hidden">{money(price)}</span>
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span className="hidden font-mono sm:inline">{product.id}</span>
              {inactive && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t("badge_inactive")}</Badge>}
              {product.is_featured && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/40 text-brand-orange-text"><Star className="mr-0.5 h-3 w-3 fill-current" aria-hidden="true" />{t("badge_featured")}</Badge>}
              {product.customizable && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t("badge_custom")}</Badge>}
            </span>
          </span>
        </button>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{product.category}</TableCell>
      <TableCell className="hidden sm:table-cell text-right whitespace-nowrap tabular-nums">
        <span className="font-semibold">{money(price)}</span>
        {promo && <span className="block text-xs text-muted-foreground line-through">{money(Number(product.price))}</span>}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {product.customizable ? <span className="text-xs text-muted-foreground">{t("stock_on_demand")}</span> : (
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${out ? "bg-destructive" : low ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
            <Input type="number" min={0} inputMode="numeric" aria-label={t("stock_of", { name: product.name })}
              className="h-8 w-20 tabular-nums text-base md:text-sm"
              value={stockEdit ?? String(product.stock_quantity ?? 0)}
              onChange={(e) => setStockEdit(e.target.value)} onBlur={saveStock}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setStockEdit(null); }} />
          </div>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-right tabular-nums text-sm">{product.sales_count ?? 0}</TableCell>
      <TableCell className="px-2"><Switch checked={!inactive} onCheckedChange={a.onToggleActive} aria-label={t("active_switch", { name: product.name })} /></TableCell>
      <TableCell className="px-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("actions_of", { name: product.name })}><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={a.onStats}><BarChart3 className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_stats")}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onEdit}><Pencil className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_edit")}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onDuplicate}><Copy className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_duplicate")}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onView}><ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_view")}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onToggleFeatured}>
              {product.is_featured ? <StarOff className="h-4 w-4 mr-2" aria-hidden="true" /> : <Star className="h-4 w-4 mr-2" aria-hidden="true" />}
              {product.is_featured ? t("act_unfeature") : t("act_feature")}
            </DropdownMenuItem>
            {manualOrder && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={a.onMoveFirst}><ArrowUp className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_move_first")}</DropdownMenuItem>
                <DropdownMenuItem onClick={a.onMoveUp}><ArrowUp className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_move_up")}</DropdownMenuItem>
                <DropdownMenuItem onClick={a.onMoveDown}><ArrowDown className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_move_down")}</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={a.onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />{t("delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

// ─── Premium Product Card ───────────────────────────────────────────────────────
interface ProductCardProps {
  product: any;
  onEdit: () => void;
  onStats: () => void;
  onView: () => void;
  onDelete: () => void;
  onToggleFeatured: () => void;
  onUpdateStock: (stock: number) => void;
  onManageSizes: () => void;
  onManageVariations: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveFirst: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
}

const ProductCard = ({
  product,
  onEdit,
  onStats,
  onView,
  onDelete,
  onToggleFeatured,
  onUpdateStock,
  onManageSizes,
  onManageVariations,
  onMoveUp,
  onMoveDown,
  onMoveFirst,
  onDuplicate,
  onToggleActive,
}: ProductCardProps) => {
  const { t } = useMessages(adminManageMessages);
  const [stockEdit, setStockEdit] = useState<number | null>(null);
  const stockValue = stockEdit !== null ? stockEdit : (product.stock_quantity ?? 0);
  const isLowStock = product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity <= 5;
  const isOutOfStock = product.stock_quantity === 0;
  const isInactive = product.is_active === false;

  return (
    <div className={`group relative rounded-2xl border bg-card overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 ${isInactive ? "opacity-60 grayscale" : ""}`}>
      {/* Product Image */}
      <div className="relative aspect-[3/4] bg-muted overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/60">
            <Package className="h-12 w-12 text-muted-foreground/30" />
            <span className="text-xs text-muted-foreground/50">Sem imagem</span>
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status badges top-left */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
          {isInactive && (
            <Badge variant="outline" className="text-xs bg-background/90 border-muted-foreground/40 shadow-md">
              Inativo
            </Badge>
          )}
          {product.is_featured && (
            <Badge className="text-xs bg-accent hover:bg-accent text-accent-foreground border-0 shadow-md gap-1">
              <Sparkles className="h-3 w-3" /> Destaque
            </Badge>
          )}
          {isOutOfStock && (
            <Badge variant="destructive" className="text-xs shadow-md">Esgotado</Badge>
          )}
          {isLowStock && !isOutOfStock && (
            <Badge className="text-xs bg-secondary text-secondary-foreground border-0 shadow-md">Baixo</Badge>
          )}
        </div>

        {/* Actions top-right */}
        <div className="absolute top-2.5 right-2.5">
          <div className="flex gap-1 mb-1">
            <Button
              variant="secondary"
              size="icon"
              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md backdrop-blur-sm bg-card/90"
              onClick={onMoveUp}
              title="Mover para cima"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md backdrop-blur-sm bg-card/90"
              onClick={onMoveDown}
              title="Mover para baixo"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg backdrop-blur-sm bg-card/90"
                aria-label={`Ações de ${product.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onStats}>
                <BarChart3 className="h-4 w-4 mr-2" /> Números do produto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Editar produto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" /> Duplicar produto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveFirst}>
                <ArrowUp className="h-4 w-4 mr-2" /> Mover para primeiro nesta lista
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onView}>
                <ExternalLink className="h-4 w-4 mr-2" /> Ver na loja
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onManageSizes}>
                <Ruler className="h-4 w-4 mr-2" /> Tamanhos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onManageVariations}>
                <Palette className="h-4 w-4 mr-2" /> Variações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleFeatured}>
                {product.is_featured ? (
                  <><StarOff className="h-4 w-4 mr-2" /> Remover destaque</>
                ) : (
                  <><Star className="h-4 w-4 mr-2" /> Adicionar destaque</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
                {isInactive ? (
                  <><Eye className="h-4 w-4 mr-2" /> Ativar produto</>
                ) : (
                  <><EyeOff className="h-4 w-4 mr-2" /> Desativar produto</>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick edit button - bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs font-semibold shadow-lg"
            style={{ background: "var(--gradient-primary)" }}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar Produto
          </Button>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-3">
        {/* Name & Category */}
        <div>
          <p className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{product.category}</p>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-primary">
            {formatPrice(Number(product.price))}
          </span>
          <button
            onClick={onToggleFeatured}
            className={`p-1.5 rounded-lg transition-colors ${
              product.is_featured
                ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                : "text-muted-foreground hover:text-amber-500 hover:bg-amber-50"
            }`}
            title={product.is_featured ? "Remover destaque" : "Destacar produto"}
          >
            <Star className={`h-4 w-4 ${product.is_featured ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Stock editor */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isOutOfStock ? "bg-destructive" : isLowStock ? "bg-orange-500" : "bg-green-500"
          }`} />
          <span className="text-xs text-muted-foreground flex-shrink-0">{t("col_stock")}:</span>
          <Input
            type="number"
            className="h-6 text-xs px-2 border-0 bg-transparent focus-visible:ring-0 flex-1 font-semibold p-0 min-w-0"
            value={stockValue}
            onChange={(e) => setStockEdit(Number(e.target.value))}
            onBlur={() => {
              if (stockEdit !== null && stockEdit !== product.stock_quantity) {
                onUpdateStock(stockEdit);
              }
              setStockEdit(null);
            }}
          />
          <span className="text-xs text-muted-foreground">un.</span>
        </div>

        {/* ID */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11 gap-2" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</Button>
          <Button variant="outline" className="min-h-11 gap-2" onClick={onDuplicate}><Copy className="h-4 w-4" />Duplicar</Button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 font-mono truncate">#{product.id}</p>
      </div>
    </div>
  );
};

export default AdminProducts;

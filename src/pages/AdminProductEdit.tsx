import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import ProductSafetyEditor from "@/components/admin/ProductSafetyEditor";
import ProductSpecsEditor from "@/components/admin/ProductSpecsEditor";
import ProductSubscriptionPlans from "@/components/admin/ProductSubscriptionPlans";
import ProductRentalEditor from "@/components/admin/ProductRentalEditor";
import ProductPreorderEditor from "@/components/admin/ProductPreorderEditor";
import HelpTip from "@/components/admin/HelpTip";
import { ProductSectionNav, type ProductSection } from "@/components/admin/product/ProductSectionNav";
import { adminProductNavMessages } from "@/i18n/adminProductNav";
import ProductDigitalEditor from "@/components/admin/ProductDigitalEditor";
import { adminDigitalMessages } from "@/i18n/adminDigital";
import { adminRentalsMessages } from "@/i18n/adminRentals";
import { adminPreordersMessages } from "@/i18n/adminPreorders";
import { adminSubscriptionsMessages } from "@/i18n/adminSubscriptions";
import ProductVariantsEditor from "@/components/admin/ProductVariantsEditor";
import ProductLinksEditor from "@/components/admin/ProductLinksEditor";
import BrandField from "@/components/admin/BrandField";
import VendorField from "@/components/admin/VendorField";
import { crossSellMessages } from "@/i18n/crossSell";
import { adminVariantsMessages } from "@/i18n/adminVariants";
import { isValidGtin, isValidSku, normalizeGtin, normalizeSku } from "@/lib/variants";
import { isValidInternalCode, isValidMpn, normalizeInternalCode, normalizeMpn } from "@/lib/productCodes";

import { useAdminAccess } from "@/hooks/useAdminSecurity";
import { canOpenAdmin } from "@/lib/adminSecurity";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminProductMessages } from "@/i18n/adminProduct";
import { adminProductTabsMessages } from "@/i18n/adminProductTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { VariationImagesManager } from "@/components/admin/VariationImagesManager";
import { ProductGalleryManager } from "@/components/admin/ProductGalleryManager";
import { ProductMediaManager } from "@/components/admin/ProductMediaManager";
import ColorPaletteManager from "@/components/admin/ColorPaletteManager";
import MaterialTagsPicker from "@/components/admin/MaterialTagsPicker";
import ProductCustomizationManager from "@/components/admin/SimpleProductAreas";
import TechniquePricingManager from "@/components/admin/TechniquePricingManager";

import { toast } from "sonner";
import {
  ExternalLink, Save, Package, Ruler, Palette, Plus, Trash2, Banknote, Images, Layers, Truck, CheckCircle2, Boxes, Link2,
  Loader2, Image, Settings2, AlertTriangle, Upload, X, Euro, HelpCircle, ArrowUp, ArrowDown, Pencil, Check, Bookmark, ChevronDown, Percent, Box, BarChart3, ShieldCheck, ListChecks,
  Repeat, CalendarRange, FileDown, Hourglass,
} from "lucide-react";
import { useFeature } from "@/hooks/useFeatures";
import { useDeliveryRules } from "@/hooks/useDeliveryDates";
import { cn } from "@/lib/utils";
import { moneyInputValue, parseMoneyInput } from "@/lib/moneyInput";

interface ProductSize {
  id: string;
  product_id: string;
  size_label: string;
  stock_quantity: number;
  display_order: number;
  is_active: boolean;
  price_modifier?: number | null;
}

// ── Selector de DTF indicado ─────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sanitizeUuidArray = (arr: any): string[] =>
  Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && UUID_RE.test(x)) : [];

function RecommendedDtfSelector({
  value,
  currentProductId,
  onChange,
}: {
  value: string[];
  currentProductId?: string;
  onChange: (v: string[]) => void;
}) {
  const { data: dtfs = [] } = useQuery({
    queryKey: ["admin-dtf-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id,name,unit_type")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) return [];
      return (data || []).filter((p: any) => p.id !== currentProductId);
    },
  });

  const selected = sanitizeUuidArray(value);
  const allIds = dtfs.map((p: any) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id: string) => selected.includes(id));
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  const toggleAll = () => onChange(allSelected ? [] : allIds);
  const label =
    selected.length === 0
      ? "Sem produto indicado"
      : allSelected
      ? `Todos os produtos (${allIds.length})`
      : `${selected.length} produto(s) selecionado(s)`;

  return (
    <div className="flex items-center gap-2 max-w-md">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="justify-between w-full">
            <span className="truncate">{label}</span>
            <Plus className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={toggleAll}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent border-b"
            >
              <Checkbox checked={allSelected} />
              <span>Selecionar todos</span>
            </button>
            {dtfs.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground">Sem produtos disponíveis.</div>
            )}
            {dtfs.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <Checkbox checked={selected.includes(p.id)} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ── Selector de Categorias indicadas ─────────────────────────────────────
function RecommendedCategoriesSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-all-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select("id,name")
        .order("name", { ascending: true });
      if (error) return [];
      return data || [];
    },
  });

  const selected = sanitizeUuidArray(value);
  const allIds = categories.map((c: any) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id: string) => selected.includes(id));
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  const toggleAll = () => onChange(allSelected ? [] : allIds);
  const label =
    selected.length === 0
      ? "Sem categoria indicada"
      : allSelected
      ? `Todas as categorias (${allIds.length})`
      : `${selected.length} categoria(s) selecionada(s)`;

  return (
    <div className="flex items-center gap-2 max-w-md">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="justify-between w-full">
            <span className="truncate">{label}</span>
            <Plus className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={toggleAll}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent border-b"
            >
              <Checkbox checked={allSelected} />
              <span>Selecionar todas</span>
            </button>
            {categories.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground">Sem categorias disponíveis.</div>
            )}
            {categories.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <Checkbox checked={selected.includes(c.id)} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface Variation {
  id: string;
  product_id: string;
  name: string;
  color_hex: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  price_modifier?: number | null;
}

interface VariationSize {
  id: string;
  variation_id: string;
  size_label: string;
  stock_quantity: number;
  display_order: number;
  is_active: boolean;
  price_modifier?: number | null;
}

interface SizePreset {
  id: string;
  name: string;
  sizes: string[];
  items: Array<{ label: string; defaultPriceAdjustment: number; displayOrder: number }>;
  display_order: number;
}

const useSizePresets = () => {
  return useQuery({
    queryKey: ["sizePresets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("size_presets")
        .select("id, name, sizes, items, display_order")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return ((data || []) as any[]).map((p) => {
        const legacy = Array.isArray(p.sizes) ? p.sizes : [];
        const items = Array.isArray(p.items) && p.items.length
          ? p.items.map((item: any, index: number) => ({
              label: String(item?.label || "").trim(),
              defaultPriceAdjustment: Number(item?.defaultPriceAdjustment || 0),
              displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : index,
            })).filter((item: any) => item.label).sort((a: any, b: any) => a.displayOrder - b.displayOrder)
          : legacy.map((label: string, index: number) => ({ label, defaultPriceAdjustment: 0, displayOrder: index }));
        return { ...p, sizes: legacy, items };
      }) as SizePreset[];
    },
  });
};

/** Textos das abas internas (src/i18n/adminProductTabs.ts), formatação e símbolo da moeda da loja. */
const useTabText = () => {
  const { t: tx } = useMessages(adminProductTabsMessages);
  const fmt = useAdminFormat();
  let cur: string = fmt.currency;
  try { cur = new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? fmt.currency; } catch { /* moeda desconhecida: fica o código */ }
  return { tx, fmt, cur };
};

function SizePresetItemEditor({ preset, onSave, saving }: {
  preset: SizePreset;
  onSave: (items: SizePreset["items"]) => void;
  saving: boolean;
}) {
  const { tx, cur } = useTabText();
  const [items, setItems] = useState(() => preset.items.map((item) => ({ label: item.label, price: moneyInputValue(item.defaultPriceAdjustment) })));
  const move = (index: number, direction: number) => {
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  return <details className="w-full border-t pt-2">
    <summary className="min-h-10 cursor-pointer py-2 font-medium" onClick={() => setItems(preset.items.map((item) => ({ label: item.label, price: moneyInputValue(item.defaultPriceAdjustment) })))}>{tx("preset_edit_items")}</summary>
    <div className="space-y-3 pb-3">
      {items.map((item, index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border p-3">
        <label className="space-y-1 text-xs">{tx("preset_size")}<Input value={item.label} onChange={(event) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /></label>
        <label className="space-y-1 text-xs">{tx("preset_extra", { cur })}<Input inputMode="decimal" value={item.price} onChange={(event) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, price: event.target.value } : entry))} /></label>
        <div className="col-span-2 flex gap-2">
          <Button size="icon" variant="outline" aria-label={tx("move_up")} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" aria-label={tx("move_down")} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label={tx("preset_remove_size")} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setItems((current) => [...current, { label: "", price: "0.00" }])}>{tx("preset_add_size")}</Button>
        <Button disabled={saving || !items.length} onClick={() => {
          const names = items.map((item) => item.label.trim().toLocaleLowerCase("pt-PT"));
          if (new Set(names).size !== names.length || items.some((item) => !item.label.trim() || parseMoneyInput(item.price) === null)) {
            toast.error(tx("preset_items_invalid"));
            return;
          }
          onSave(items.map((item, displayOrder) => ({ label: item.label.trim(), defaultPriceAdjustment: parseMoneyInput(item.price)!, displayOrder })));
        }}>{tx("preset_save_items")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{tx("preset_items_hint")}</p>
    </div>
  </details>;
}

const SizePresetButtons = ({
  onApply,
  currentItems,
}: {
  onApply: (items: SizePreset["items"]) => void;
  currentItems: SizePreset["items"];
}) => {
  const queryClient = useQueryClient();
  const { tx } = useTabText();
  const { ask, confirmSlot } = useInlineConfirm();
  const { data: presets = [] } = useSizePresets();
  const [manageOpen, setManageOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetSource, setPresetSource] = useState("empty");
  const [selectedPreset, setSelectedPreset] = useState("");

  const savePreset = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error(tx("preset_name_required"));
      const items = presetSource === "product" ? currentItems : presets.find((p) => p.id === presetSource)?.items ?? [];
      if (items.some((item) => parseMoneyInput(item.defaultPriceAdjustment) === null)) throw new Error(tx("preset_review_extras"));
      if (presets.some((preset) => preset.name.toLocaleLowerCase("pt-PT") === trimmed.toLocaleLowerCase("pt-PT"))) throw new Error(tx("preset_name_taken"));
      const { error } = await (supabase as any).from("size_presets").upsert(
        {
          name: trimmed,
          sizes: items.map((item) => item.label),
          items: items.map((item, displayOrder) => ({ ...item, displayOrder })),
          display_order: presets.length,
        },
        { onConflict: "name" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sizePresets"] });
      toast.success(tx("preset_saved"));
      setPresetName("");
    },
    onError: (e: any) => toast.error(e.message || tx("error_generic")),
  });

  const updatePreset = useMutation({
    mutationFn: async (p: SizePreset) => {
      if (p.items.some((item) => !item.label.trim() || parseMoneyInput(item.defaultPriceAdjustment) === null)) {
        throw new Error(tx("preset_item_invalid"));
      }
      const { error } = await (supabase as any)
        .from("size_presets")
        .update({ name: p.name, sizes: p.items.map((item) => item.label), items: p.items.map((item, displayOrder) => ({ ...item, displayOrder })), display_order: p.display_order })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sizePresets"] }),
    onError: (e: any) => toast.error(e.message || tx("error_generic")),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("size_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sizePresets"] });
      toast.success(tx("preset_removed"));
    },
  });

  const reorder = (id: string, dir: -1 | 1) => {
    const i = presets.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= presets.length) return;
    const a = presets[i], b = presets[j];
    updatePreset.mutate({ ...a, display_order: b.display_order });
    updatePreset.mutate({ ...b, display_order: a.display_order });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><Label htmlFor="size-preset">{tx("preset_label")}</Label>
          <select id="size-preset" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)}>
            <option value="">{tx("preset_pick")}</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <Button variant="outline" disabled={!selectedPreset} onClick={() => { const p = presets.find((p) => p.id === selectedPreset); if (p) onApply(p.items); }}>{tx("preset_apply")}</Button>
        <Button variant="outline" onClick={() => setManageOpen((v) => !v)} aria-expanded={manageOpen}><Settings2 className="mr-2 h-4 w-4" />{tx("preset_manage")}</Button>
      </div>
      <InlinePanel open={manageOpen} onClose={() => setManageOpen(false)} title={tx("preset_panel_title")} description={tx("preset_panel_hint")}>
        {confirmSlot}
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs">{tx("preset_new")}</Label>
              <select aria-label={tx("preset_source")} className="my-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={presetSource} onChange={(e) => setPresetSource(e.target.value)}>
                <option value="empty">{tx("preset_source_empty")}</option><option value="product">{tx("preset_source_product")}</option>
                {presets.map((p) => <option key={p.id} value={p.id}>{tx("preset_source_copy", { name: p.name })}</option>)}
              </select>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={tx("preset_name_placeholder")}
                className="h-8"
              />
            </div>
            <Button size="sm" onClick={() => savePreset.mutate(presetName)} disabled={!presetName.trim() || savePreset.isPending}>
              <Bookmark className="h-3.5 w-3.5 mr-1" /> {tx("save")}
            </Button>
          </div>
          <div className="space-y-1">
            {presets.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 bg-background rounded-md px-2 py-1.5 text-sm">
                <Input
                  defaultValue={p.name}
                  className="h-7 text-xs w-40"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && updatePreset.mutate({ ...p, name: e.target.value.trim() })}
                />
                <span className="text-xs text-muted-foreground flex-1">{tx("preset_n_sizes", { n: p.items.length })}</span>
                <Button variant="outline" size="sm" onClick={() => { setPresetSource(p.id); setPresetName(`${p.name} ${tx("preset_copy_suffix")}`); }}>{tx("preset_duplicate")}</Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} aria-label={tx("move_up")} onClick={() => reorder(p.id, -1)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === presets.length - 1} aria-label={tx("move_down")} onClick={() => reorder(p.id, 1)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={tx("preset_delete_aria", { name: p.name })} onClick={async () => { if (await ask(tx("preset_delete_confirm"), { description: tx("preset_delete_hint"), confirmLabel: tx("preset_delete") })) deletePreset.mutate(p.id); }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
                <SizePresetItemEditor preset={p} onSave={(items) => updatePreset.mutate({ ...p, items })} saving={updatePreset.isPending} />
              </div>
            ))}
            {presets.length === 0 && <p className="text-sm text-muted-foreground">{tx("preset_empty")}</p>}
          </div>
        </div>
      </InlinePanel>
    </div>
  );
};

// ─── Pricing Tiers Tab (DTF / per meter pricing) ──────────────────────────────
interface PriceTier {
  id: string;
  product_id: string;
  min_meters: number;
  price_per_meter: number;
  label: string | null;
  display_order: number;
}

const PricingTiersTab = ({ productId, unitType }: { productId: string; unitType: "meter" | "unit" }) => {
  const queryClient = useQueryClient();
  const isUnit = unitType === "unit";
  const { tx, cur } = useTabText();
  const step = isUnit ? "1" : "0.01";
  const parseQty = (raw: string) => {
    const normalized = String(raw ?? "").replace(",", ".").trim();
    if (normalized === "") return 0;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  };
  const [draft, setDraft] = useState<{ min_meters: string; price_per_meter: string; label: string }>({
    min_meters: "1",
    price_per_meter: "12",
    label: "",
  });

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["adminPricingTiers", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_volume_tiers")
        .select("id, product_id, min_meters, price_per_meter, label, display_order")
        .eq("product_id", productId)
        .order("min_meters", { ascending: true });
      if (error) throw error;
      return (data || []) as PriceTier[];
    },
  });

  // Keep products.price in sync with the lowest-quantity tier price so the rest of the
  // app (cart, listings) automatically respects the pricing table.
  const syncBasePrice = async (rows: PriceTier[]) => {
    if (rows.length === 0) return;
    const sorted = [...rows].sort((a, b) => Number(a.min_meters) - Number(b.min_meters));
    const basePrice = Number(sorted[0].price_per_meter);
    if (!Number.isFinite(basePrice)) return;
    await (supabase as any).from("products").update({ price: basePrice }).eq("id", productId);
    queryClient.invalidateQueries({ queryKey: ["adminProductDetail", productId] });
    queryClient.invalidateQueries({ queryKey: ["product-by-slug-or-id"] });
  };

  const addTier = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("product_volume_tiers").insert({
        product_id: productId,
        min_meters: parseQty(draft.min_meters),
        price_per_meter: parseQty(draft.price_per_meter),
        label: draft.label.trim() || null,
        display_order: tiers.length,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["adminPricingTiers", productId] });
      queryClient.invalidateQueries({ queryKey: ["volume-tiers", productId] });
      toast.success(tx("tier_added"));
      setDraft({ min_meters: "1", price_per_meter: "12", label: "" });
      const { data } = await (supabase as any)
        .from("product_volume_tiers").select("min_meters, price_per_meter")
        .eq("product_id", productId);
      if (data) await syncBasePrice(data as any);
    },
    onError: (e: any) => toast.error(e.message || tx("error_generic")),
  });

  const updateTier = useMutation({
    mutationFn: async (t: PriceTier) => {
      const { error } = await (supabase as any).from("product_volume_tiers").update({
        min_meters: Number(t.min_meters),
        price_per_meter: Number(t.price_per_meter),
        label: t.label?.trim() || null,
      }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["adminPricingTiers", productId] });
      queryClient.invalidateQueries({ queryKey: ["volume-tiers", productId] });
      toast.success(tx("tier_updated"));
      const { data } = await (supabase as any)
        .from("product_volume_tiers").select("min_meters, price_per_meter")
        .eq("product_id", productId);
      if (data) await syncBasePrice(data as any);
    },
    onError: (e: any) => toast.error(e.message || tx("error_generic")),
  });

  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("product_volume_tiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["adminPricingTiers", productId] });
      queryClient.invalidateQueries({ queryKey: ["volume-tiers", productId] });
      toast.success(tx("tier_removed"));
      const { data } = await (supabase as any)
        .from("product_volume_tiers").select("min_meters, price_per_meter")
        .eq("product_id", productId);
      if (data) await syncBasePrice(data as any);
    },
  });

  const [edits, setEdits] = useState<Record<string, PriceTier>>({});
  const [rawMin, setRawMin] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, PriceTier> = {};
    const raws: Record<string, string> = {};
    tiers.forEach((t) => { map[t.id] = { ...t }; });
    tiers.forEach((t) => { raws[t.id] = String(t.min_meters).replace(".", ","); });
    setEdits(map);
    setRawMin(raws);
  }, [tiers]);

  if (isLoading) return <div className="text-sm text-muted-foreground">{tx("loading")}</div>;

  const sortedTiers = [...tiers].sort((a, b) => Number(a.min_meters) - Number(b.min_meters));
  const basePrice = sortedTiers[0] ? Number(sortedTiers[0].price_per_meter) : null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
        <p className="font-semibold text-foreground mb-1">{tx("how_it_works")}</p>
        <p className="text-muted-foreground">{isUnit ? tx("tier_help_unit") : tx("tier_help_meter")}</p>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("tier_label")}</TableHead>
              <TableHead className="w-36">{isUnit ? tx("tier_from_unit") : tx("tier_from_meter")}</TableHead>
              <TableHead className="w-32">{isUnit ? tx("tier_price_unit", { cur }) : tx("tier_price_meter", { cur })}</TableHead>
              {isUnit && <TableHead className="w-28">{tx("tier_discount")}</TableHead>}
              <TableHead className="w-40 text-right">{tx("tier_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.length === 0 && (
              <TableRow>
                <TableCell colSpan={isUnit ? 5 : 4} className="text-sm text-muted-foreground text-center py-6">
                  {tx("tier_none")}
                </TableCell>
              </TableRow>
            )}
            {sortedTiers.map((t) => {
              const e = edits[t.id] || t;
              const discount = isUnit && basePrice && basePrice > 0
                ? Math.max(0, Math.round((1 - Number(e.price_per_meter) / basePrice) * 100))
                : 0;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Input
                      value={e.label || ""}
                      placeholder={isUnit ? tx("tier_label_placeholder_unit") : tx("tier_label_placeholder_meter")}
                      onChange={(ev) => setEdits({ ...edits, [t.id]: { ...e, label: ev.target.value } })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]+([.,][0-9]+)?"
                      value={rawMin[t.id] ?? String(e.min_meters)}
                      onChange={(ev) => {
                        const raw = ev.target.value;
                        const cleaned = isUnit ? raw.replace(/[^0-9]/g, "") : raw.replace(/[^0-9.,]/g, "");
                        setRawMin({ ...rawMin, [t.id]: cleaned });
                        const num = isUnit ? (parseInt(cleaned, 10) || 0) : parseQty(cleaned);
                        setEdits({ ...edits, [t.id]: { ...e, min_meters: num } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" min="0"
                      value={e.price_per_meter}
                      onChange={(ev) => setEdits({ ...edits, [t.id]: { ...e, price_per_meter: parseFloat(ev.target.value) || 0 } })}
                    />
                  </TableCell>
                  {isUnit && (
                    <TableCell>
                      {discount > 0 ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-white">-{discount}%</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tx("tier_base")}</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" aria-label={tx("tier_save_aria")} onClick={() => updateTier.mutate(edits[t.id])}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={tx("tier_remove_aria")} onClick={() => deleteTier.mutate(t.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold mb-3">{tx("tier_new")}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">{tx("tier_label")}</Label>
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={isUnit ? tx("tier_new_placeholder_unit") : tx("tier_new_placeholder_meter")} />
          </div>
          <div>
            <Label className="text-xs">{isUnit ? tx("tier_from_unit") : tx("tier_from_meter")}</Label>
            <Input
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.,][0-9]+)?"
              value={draft.min_meters}
              onChange={(e) => {
                const raw = e.target.value;
                const cleaned = isUnit ? raw.replace(/[^0-9]/g, "") : raw.replace(/[^0-9.,]/g, "");
                setDraft({ ...draft, min_meters: cleaned });
              }}
            />
            {!isUnit && (
              <p className="text-[10px] text-muted-foreground mt-1">{tx("tier_meter_hint")}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">{isUnit ? tx("tier_price_unit", { cur }) : tx("tier_price_meter", { cur })}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={draft.price_per_meter}
              onChange={(e) => setDraft({ ...draft, price_per_meter: e.target.value.replace(/[^0-9.,]/g, "") })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => addTier.mutate()} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> {tx("add")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {isUnit ? tx("tier_tip_unit") : tx("tier_tip_meter")}
        </p>
      </div>
    </div>
  );
};

// Categories are now fetched from the database dynamically

// ─── FAQs Tab ──────────────────────────────────────────────────────────────────
interface ProductFaq {
  id: string;
  product_id: string;
  question: string;
  answer: string;
  display_order: number;
  is_active: boolean;
}

const FaqsTab = ({ productId }: { productId: string }) => {
  const queryClient = useQueryClient();
  const { tx } = useTabText();
  const [draft, setDraft] = useState({ question: "", answer: "" });

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["adminProductFaqs", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_faqs")
        .select("*")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as ProductFaq[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["adminProductFaqs", productId] });
    queryClient.invalidateQueries({ queryKey: ["product-faqs", productId] });
  };

  const addFaq = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("product_faqs").insert({
        product_id: productId,
        question: draft.question.trim(),
        answer: draft.answer.trim(),
        display_order: faqs.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success(tx("faq_added"));
      setDraft({ question: "", answer: "" });
    },
    onError: (e: any) => toast.error(e.message || tx("error_generic")),
  });

  const updateFaq = useMutation({
    mutationFn: async (f: ProductFaq) => {
      const { error } = await (supabase as any).from("product_faqs").update({
        question: f.question, answer: f.answer, is_active: f.is_active,
      }).eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success(tx("faq_updated")); },
  });

  const deleteFaq = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("product_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success(tx("faq_removed")); },
  });

  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = faqs.findIndex((f) => f.id === id);
      const swap = faqs[idx + dir];
      if (!swap) return;
      const a = faqs[idx];
      await (supabase as any).from("product_faqs").update({ display_order: swap.display_order }).eq("id", a.id);
      await (supabase as any).from("product_faqs").update({ display_order: a.display_order }).eq("id", swap.id);
    },
    onSuccess: invalidate,
  });

  const [edits, setEdits] = useState<Record<string, ProductFaq>>({});
  useEffect(() => {
    const m: Record<string, ProductFaq> = {};
    faqs.forEach((f) => { m[f.id] = { ...f }; });
    setEdits(m);
  }, [faqs]);

  if (isLoading) return <div className="text-sm text-muted-foreground">{tx("loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
        <p className="font-semibold text-foreground mb-1">{tx("how_it_works")}</p>
        <p className="text-muted-foreground">{tx("faq_help")}</p>
      </div>

      <div className="space-y-3">
        {faqs.length === 0 && (
          <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
            {tx("faq_none")}
          </div>
        )}
        {faqs.map((f, i) => {
          const e = edits[f.id] || f;
          return (
            <Card key={f.id} className="rounded-xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                  <Input
                    value={e.question}
                    onChange={(ev) => setEdits({ ...edits, [f.id]: { ...e, question: ev.target.value } })}
                    placeholder={tx("faq_question")}
                    className="font-semibold"
                  />
                  <Badge
                    variant={e.is_active ? "default" : "secondary"}
                    className="cursor-pointer shrink-0"
                    onClick={() => updateFaq.mutate({ ...e, is_active: !e.is_active })}
                  >
                    {e.is_active ? tx("faq_visible") : tx("faq_hidden")}
                  </Badge>
                </div>
                <Textarea
                  value={e.answer}
                  rows={3}
                  placeholder={tx("faq_answer")}
                  onChange={(ev) => setEdits({ ...edits, [f.id]: { ...e, answer: ev.target.value } })}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={i === 0} aria-label={tx("move_up")} onClick={() => reorder.mutate({ id: f.id, dir: -1 })}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={i === faqs.length - 1} aria-label={tx("move_down")} onClick={() => reorder.mutate({ id: f.id, dir: 1 })}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" aria-label={tx("remove")} onClick={() => deleteFaq.mutate(f.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    <Button size="sm" onClick={() => updateFaq.mutate(e)}>
                      <Save className="h-3.5 w-3.5 mr-1" /> {tx("save")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl border-dashed">
        <CardHeader className="pb-3"><CardTitle className="text-base">{tx("faq_new")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={draft.question}
            placeholder={tx("faq_new_question")}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
          <Textarea
            value={draft.answer}
            rows={3}
            placeholder={tx("faq_new_answer")}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
          />
          <Button onClick={() => addFaq.mutate()} disabled={!draft.question.trim() || !draft.answer.trim()}>
            <Plus className="h-4 w-4 mr-1" /> {tx("faq_add")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Sizes Tab ─────────────────────────────────────────────────────────────────
const SizesTab = ({ productId }: { productId: string }) => {
  const queryClient = useQueryClient();
  const { tx } = useTabText();
  const [newSize, setNewSize] = useState("");

  const { data: sizes = [], isLoading } = useQuery({
    queryKey: ["adminSizesEdit", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sizes").select("*")
        .eq("product_id", productId)
        .order("display_order", { ascending: true })
        .order("size_label", { ascending: true });
      if (error) throw error;
      return data as ProductSize[];
    },
  });

  const addSize = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase.from("product_sizes").insert({
        product_id: productId,
        size_label: label.trim().toUpperCase(),
        stock_quantity: 0,
        display_order: sizes.length,
        price_modifier: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] });
      toast.success(tx("size_added"));
      setNewSize("");
    },
  });

  const deleteSize = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_sizes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] }),
  });

  const updateSizeLabel = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("product_sizes").update({ size_label: label.trim().toUpperCase() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] });
      toast.success(tx("size_updated"));
    },
  });

  const updateSizePrice = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await supabase.from("product_sizes").update({ price_modifier: price } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] }),
    onError: () => toast.error(tx("size_extra_error")),
  });

  const reorderSize = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const i = sizes.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sizes.length) return null;
      const next = [...sizes];
      const [moved] = next.splice(i, 1);
      next.splice(j, 0, moved);
      // Renormalize ALL display_order values to 0..n-1 to fix any
      // pre-existing duplicates/gaps that break swap-based ordering.
      await Promise.all(
        next.map((s, idx) =>
          supabase.from("product_sizes").update({ display_order: idx }).eq("id", s.id)
        )
      );
      return next;
    },
    onMutate: async ({ id, dir }) => {
      await queryClient.cancelQueries({ queryKey: ["adminSizesEdit", productId] });
      const prev = queryClient.getQueryData<ProductSize[]>(["adminSizesEdit", productId]);
      if (prev) {
        const i = prev.findIndex((s) => s.id === id);
        const j = i + dir;
        if (i >= 0 && j >= 0 && j < prev.length) {
          const next = [...prev];
          const [moved] = next.splice(i, 1);
          next.splice(j, 0, moved);
          queryClient.setQueryData(
            ["adminSizesEdit", productId],
            next.map((s, idx) => ({ ...s, display_order: idx }))
          );
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["adminSizesEdit", productId], ctx.prev);
      toast.error(tx("size_reorder_error"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("product_sizes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] }),
  });

  const applyPreset = async (items: SizePreset["items"]) => {
    const existing = new Set(sizes.map((size) => size.size_label.trim().toLocaleLowerCase("pt-PT")));
    const missing = items.filter((item) => !existing.has(item.label.trim().toLocaleLowerCase("pt-PT")));
    if (!missing.length) {
      toast.info(tx("size_preset_all_exist"));
      return;
    }
    const { error } = await supabase.from("product_sizes").insert(missing.map((item, index) => ({
      product_id: productId,
      size_label: item.label.trim().toUpperCase(),
      stock_quantity: 0,
      price_modifier: Number(item.defaultPriceAdjustment || 0),
      display_order: sizes.length + index,
    })));
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["adminSizesEdit", productId] });
    toast.success(tx("size_preset_added", { n: missing.length }));
  };

  return (
    <div className="space-y-4">


      {/* Presets */}
      <div>

        <SizePresetButtons
          onApply={applyPreset}
          currentItems={sizes.map((size, displayOrder) => ({
            label: size.size_label,
            defaultPriceAdjustment: Number(size.price_modifier || 0),
            displayOrder,
          }))}
        />
      </div>

      <Separator />

      {/* Add custom size */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label>{tx("size_custom")}</Label>
          <Input
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            placeholder={tx("size_custom_placeholder")}
            onKeyDown={(e) => e.key === "Enter" && newSize.trim() && addSize.mutate(newSize)}
          />
        </div>
        <Button onClick={() => newSize.trim() && addSize.mutate(newSize)} disabled={!newSize.trim()}>
          <Plus className="h-4 w-4 mr-1" /> {tx("add")}
        </Button>
      </div>

      {/* Sizes table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> {tx("loading")}
        </div>
      ) : sizes.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          {tx("size_none")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("size_col")}</TableHead>
              <TableHead className="w-36">{tx("size_extra_col")}</TableHead>
              <TableHead>{tx("size_status_col")}</TableHead>
              <TableHead className="text-right w-40">{tx("tier_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sizes.map((size, i) => (
              <TableRow key={size.id}>
                <TableCell className="font-medium">
                  <Input
                    defaultValue={size.size_label}
                    className="w-24 h-8"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v.toUpperCase() !== size.size_label) updateSizeLabel.mutate({ id: size.id, label: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    key={`${size.id}-${size.price_modifier}`}
                    defaultValue={Number(size.price_modifier || 0).toFixed(2)}
                    inputMode="decimal"
                    className="h-8 w-28"
                    aria-label={tx("size_extra_aria", { size: size.size_label })}
                    onBlur={(event) => {
                      const price = parseMoneyInput(event.target.value);
                      if (price === null) {
                        toast.error(tx("invalid_extra"));
                        event.target.value = Number(size.price_modifier || 0).toFixed(2);
                      } else if (price !== Number(size.price_modifier || 0)) {
                        updateSizePrice.mutate({ id: size.id, price });
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant={size.is_active ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => toggleActive.mutate({ id: size.id, is_active: !size.is_active })}
                  >
                    {size.is_active ? tx("active") : tx("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" disabled={i === 0} aria-label={tx("move_up")} onClick={() => reorderSize.mutate({ id: size.id, dir: -1 })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={i === sizes.length - 1} aria-label={tx("move_down")} onClick={() => reorderSize.mutate({ id: size.id, dir: 1 })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={tx("remove")} onClick={() => deleteSize.mutate(size.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

// ─── Variation Image Dropzone ───────────────────────────────────────────────────
const VariationImageDropzone = ({ value, onChange }: { value: string; onChange: (url: string) => void }) => {
  const { tx } = useTabText();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error(tx("img_invalid")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(tx("img_too_big")); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `variations/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(urlData.publicUrl);
      toast.success(tx("img_sent"));
    } catch (err: any) {
      toast.error(err.message || tx("img_error"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div
      className={cn(
        "relative mt-1.5 border-2 border-dashed rounded-lg transition-colors cursor-pointer overflow-hidden",
        dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        value ? "p-1" : "p-3"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => { if (!uploading) inputRef.current?.click(); }}
    >
      {uploading ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">{tx("img_uploading")}</span>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2">
          <img src={value} alt="" className="w-10 h-10 object-cover rounded" />
          <span className="text-xs text-muted-foreground truncate flex-1">{tx("img_loaded")}</span>
          <button
            type="button"
            className="p-1 hover:bg-destructive/10 rounded"
            aria-label={tx("img_remove")}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          >
            <X className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-center">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{tx("img_drop")}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
      />
    </div>
  );
};

// ─── Variations Tab (Color list with per-color size availability/stock/price) ─
type AvailRow = {
  variation_id: string;
  product_size_id: string;
  is_available: boolean;
  stock_quantity: number;
  price_modifier: number;
};

const VariationsTab = ({ productId }: { productId: string }) => {
  const queryClient = useQueryClient();
  const [newVarName, setNewVarName] = useState("");
  const [newVarColor, setNewVarColor] = useState("#000000");
  const [newVarPriceMod, setNewVarPriceMod] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [bulkVariationPrice, setBulkVariationPrice] = useState("0.00");
  const { ask, confirmSlot } = useInlineConfirm();
  const { tx, fmt, cur } = useTabText();
  const [bulkSizePrice, setBulkSizePrice] = useState("0.00");
  const [bulkSaving, setBulkSaving] = useState<"variation" | "size" | null>(null);

  const { data: variations = [] } = useQuery({
    queryKey: ["adminVariations", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variations").select("*")
        .eq("product_id", productId).order("display_order");
      if (error) throw error;
      return data as Variation[];
    },
  });

  const { data: sizes = [] } = useQuery({
    queryKey: ["adminSizesEdit", productId, "active-variations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_sizes")
        .select("id, size_label, display_order, is_active, price_modifier")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: availability = [] } = useQuery<AvailRow[]>({
    queryKey: ["varSizeAvailability", productId, variations.map(v => v.id).join(",")],
    queryFn: async () => {
      if (!variations.length) return [];
      const { data, error } = await (supabase as any)
        .from("product_variation_size_availability")
        .select("variation_id, product_size_id, is_available, stock_quantity, price_modifier")
        .in("variation_id", variations.map(v => v.id));
      if (error) throw error;
      return (data || []) as AvailRow[];
    },
    enabled: variations.length > 0,
  });

  const availMap = new Map<string, AvailRow>();
  availability.forEach((a) => availMap.set(`${a.variation_id}:${a.product_size_id}`, a));
  const getAvail = (vid: string, sid: string): AvailRow => {
    return availMap.get(`${vid}:${sid}`) || {
      variation_id: vid,
      product_size_id: sid,
      is_available: true,
      stock_quantity: 0,
      price_modifier: 0,
    };
  };

  const upsertAvail = useMutation({
    mutationFn: async (row: { vid: string; sid: string; fields: Partial<AvailRow> }) => {
      const existing = availMap.get(`${row.vid}:${row.sid}`);
      const merged = {
        variation_id: row.vid,
        product_size_id: row.sid,
        is_available: existing?.is_available ?? true,
        stock_quantity: existing?.stock_quantity ?? 0,
        price_modifier: existing?.price_modifier ?? 0,
        ...row.fields,
      };
      const { error } = await (supabase as any)
        .from("product_variation_size_availability")
        .upsert(merged, { onConflict: "variation_id,product_size_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["varSizeAvailability", productId] }),
    onError: (e: any) => toast.error(e?.message || tx("error_generic")),
  });

  const setAllForVariation = async (vid: string, value: boolean) => {
    if (!sizes.length) return;
    const rows = sizes.map((s: any) => {
      const existing = availMap.get(`${vid}:${s.id}`);
      return {
        variation_id: vid,
        product_size_id: s.id,
        is_available: value,
        stock_quantity: existing?.stock_quantity ?? 0,
        price_modifier: existing?.price_modifier ?? 0,
      };
    });
    const { error } = await (supabase as any)
      .from("product_variation_size_availability")
      .upsert(rows, { onConflict: "variation_id,product_size_id" });
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["varSizeAvailability", productId] });
  };

  const setAllVariationPrices = async () => {
    const price = parseMoneyInput(bulkVariationPrice);
    if (price === null) {
      toast.error(tx("invalid_money"));
      return;
    }
    if (!(await ask(tx("var_bulk_colors_confirm", { n: variations.length, value: fmt.money(price) }), { tone: "warning", confirmLabel: tx("var_replace") }))) return;
    setBulkSaving("variation");
    const results = await Promise.all(
      variations.map((variation) => supabase.from("product_variations").update({ price_modifier: price } as any).eq("id", variation.id)),
    );
    setBulkSaving(null);
    if (results.some((result) => result.error)) toast.error(tx("var_bulk_partial"));
    else toast.success(tx("var_bulk_colors_done"));
    queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] });
  };

  const setAllCombinationPrices = async () => {
    const price = parseMoneyInput(bulkSizePrice);
    if (price === null) {
      toast.error(tx("invalid_money"));
      return;
    }
    if (!variations.length || !sizes.length) return;
    if (!(await ask(tx("var_bulk_combos_confirm", { n: variations.length * sizes.length, value: fmt.money(price) }), { tone: "warning", confirmLabel: tx("var_replace") }))) return;
    setBulkSaving("size");
    const rows = variations.flatMap((variation) => sizes.map((size: any) => {
      const existing = availMap.get(`${variation.id}:${size.id}`);
      return {
        variation_id: variation.id,
        product_size_id: size.id,
        is_available: existing?.is_available ?? true,
        stock_quantity: existing?.stock_quantity ?? 0,
        price_modifier: price,
      };
    }));
    const { error } = await (supabase as any)
      .from("product_variation_size_availability")
      .upsert(rows, { onConflict: "variation_id,product_size_id" });
    setBulkSaving(null);
    if (error) toast.error(error.message);
    else {
      toast.success(tx("var_bulk_combos_done"));
      queryClient.invalidateQueries({ queryKey: ["varSizeAvailability", productId] });
    }
  };

  const addVariation = useMutation({
    mutationFn: async () => {
      const price = parseMoneyInput(newVarPriceMod || "0");
      if (price === null) throw new Error(tx("invalid_money"));
      const { error } = await supabase.from("product_variations").insert({
        product_id: productId,
        name: newVarName.trim(),
        color_hex: newVarColor || null,
        price_modifier: price,
        display_order: variations.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] });
      toast.success(tx("var_added"));
      setNewVarName(""); setNewVarColor("#000000"); setNewVarPriceMod("");
    },
    onError: (error: Error) => toast.error(error.message || tx("var_add_error")),
  });

  const deleteVariation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_variations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] }),
  });

  const updateVariation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Partial<Variation> }) => {
      const { error } = await supabase.from("product_variations").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] }),
  });

  const reorderVariation = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const i = variations.findIndex((v) => v.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= variations.length) return;
      const a = variations[i], b = variations[j];
      await supabase.from("product_variations").update({ display_order: b.display_order }).eq("id", a.id);
      await supabase.from("product_variations").update({ display_order: a.display_order }).eq("id", b.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] }),
  });

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeCount = (vid: string) =>
    sizes.filter((s: any) => getAvail(vid, s.id).is_available).length;

  return (
    <div className="space-y-6">
      {confirmSlot}
      {/* Palette apply / management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" /> {tx("var_palettes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColorPaletteManager
            productId={productId}
            existingVariations={variations.map((variation) => ({
              id: variation.id,
              name: variation.name,
              color_hex: variation.color_hex,
              image_url: variation.image_url,
              price_modifier: variation.price_modifier,
              display_order: variation.display_order,
            }))}
            onApplied={() => queryClient.invalidateQueries({ queryKey: ["adminVariations", productId] })}
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            {tx("var_palettes_hint")}
          </p>
        </CardContent>
      </Card>

      <details className="rounded-lg border">
        <summary className="cursor-pointer p-3 text-sm font-medium">{tx("var_bulk")}</summary>
        <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
          <div className="rounded-lg border p-3 space-y-2">
            <Label htmlFor="bulk-variation-price" className="text-xs">{tx("var_bulk_colors")}</Label>
            <div className="flex gap-2">
              <Input id="bulk-variation-price" value={bulkVariationPrice} onChange={(event) => setBulkVariationPrice(event.target.value)} inputMode="decimal" />
              <Button variant="secondary" onClick={setAllVariationPrices} disabled={!variations.length || bulkSaving === "variation"}>
                {bulkSaving === "variation" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tx("apply")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{tx("var_bulk_colors_hint")}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <Label htmlFor="bulk-size-price" className="text-xs">{tx("var_bulk_combos")}</Label>
            <div className="flex gap-2">
              <Input id="bulk-size-price" value={bulkSizePrice} onChange={(event) => setBulkSizePrice(event.target.value)} inputMode="decimal" />
              <Button variant="secondary" onClick={setAllCombinationPrices} disabled={!variations.length || !sizes.length || bulkSaving === "size"}>
                {bulkSaving === "size" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tx("apply")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{tx("var_bulk_combos_hint")}</p>
          </div>
        </div>
      </details>

      {/* Add a single color manually */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tx("var_add_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="sm:col-span-2">
              <Label className="text-xs">{tx("var_name")} *</Label>
              <Input value={newVarName} onChange={(e) => setNewVarName(e.target.value)} placeholder={tx("var_name_placeholder")} />
            </div>
            <div>
              <Label className="text-xs">{tx("var_color")}</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(newVarColor) ? newVarColor : "#000000"}
                  onChange={(e) => setNewVarColor(e.target.value.toUpperCase())}
                  className="h-10 w-12 rounded-md border border-border cursor-pointer bg-background p-1"
                />
                <Input value={newVarColor} onChange={(e) => setNewVarColor(e.target.value)} placeholder="#FF0000" className="font-mono" />
              </div>
            </div>
            <div>
              <Label className="text-xs" title={tx("var_extra_hint")}>{tx("var_extra", { cur })}</Label>
              <Input type="number" step="0.01" value={newVarPriceMod} onChange={(e) => setNewVarPriceMod(e.target.value)} placeholder="0.00" />
            </div>
            <Button onClick={() => addVariation.mutate()} disabled={!newVarName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> {tx("add")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-color collapsible cards */}
      {variations.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          {tx("var_none")}
        </div>
      ) : (
        <div className="space-y-2">
          {variations.map((variation, vi) => {
            const isOpen = openIds.has(variation.id);
            const active = activeCount(variation.id);
            return (
              <Collapsible
                key={variation.id}
                open={isOpen}
                onOpenChange={() => toggleOpen(variation.id)}
                className="rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-2 p-2.5">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 text-left min-w-0 hover:bg-muted/50 rounded-md px-2 py-1 transition-colors"
                      aria-label={tx("var_open", { name: variation.name })}
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0",
                          isOpen ? "rotate-0" : "-rotate-90")}
                      />
                      <span
                        className="inline-block w-7 h-7 rounded-full border-2 border-border shrink-0"
                        style={{ backgroundColor: variation.color_hex || "transparent" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{variation.name || tx("var_no_name")}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {variation.color_hex || "-"}
                          {Number(variation.price_modifier || 0) !== 0 && (
                            <span className="ml-2 text-primary">
                              {Number(variation.price_modifier) > 0 ? "+" : ""}
                              {fmt.money(Number(variation.price_modifier))}
                            </span>
                          )}
                        </div>
                      </div>
                      {sizes.length > 0 && (
                        <Badge variant={active > 0 ? "default" : "secondary"} className="shrink-0">
                          {tx("var_sizes_badge", { active, total: sizes.length })}
                        </Badge>
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" disabled={vi === 0} aria-label={tx("move_up")} onClick={() => reorderVariation.mutate({ id: variation.id, dir: -1 })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={vi === variations.length - 1} aria-label={tx("move_down")} onClick={() => reorderVariation.mutate({ id: variation.id, dir: 1 })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={tx("var_remove_aria")} onClick={() => deleteVariation.mutate(variation.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="border-t border-border p-4 space-y-5 bg-muted/20">
                    {/* Color fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-3">
                        <Label className="text-xs">{tx("var_name")}</Label>
                        <Input
                          defaultValue={variation.name}
                          className="h-9"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== variation.name) updateVariation.mutate({ id: variation.id, fields: { name: v } });
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Hex</Label>
                        <div className="flex gap-1">
                          <input
                            type="color"
                            defaultValue={/^#[0-9a-fA-F]{6}$/.test(variation.color_hex || "") ? (variation.color_hex as string) : "#000000"}
                            onChange={(e) => updateVariation.mutate({ id: variation.id, fields: { color_hex: e.target.value.toUpperCase() } })}
                            className="h-9 w-10 rounded border p-0.5 cursor-pointer bg-background shrink-0"
                          />
                          <Input
                            defaultValue={variation.color_hex || ""}
                            className="h-9 font-mono text-xs"
                            placeholder="#RRGGBB"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (variation.color_hex || "")) updateVariation.mutate({ id: variation.id, fields: { color_hex: v || null } });
                            }}
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs" title={tx("var_extra_hint")}>{tx("var_extra", { cur })}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={Number(variation.price_modifier ?? 0)}
                          className="h-9"
                          placeholder="0.00"
                          onBlur={(e) => {
                            const price = parseMoneyInput(e.target.value);
                            if (price === null) {
                              toast.error(tx("invalid_extra"));
                              e.target.value = moneyInputValue(variation.price_modifier);
                            } else if (price !== Number(variation.price_modifier ?? 0)) {
                              updateVariation.mutate({ id: variation.id, fields: { price_modifier: price } as any });
                            }
                          }}
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <Label className="text-xs">{tx("var_image")}</Label>
                        <VariationImageDropzone
                          value={variation.image_url || ""}
                          onChange={(url) => updateVariation.mutate({ id: variation.id, fields: { image_url: url || null } })}
                        />
                      </div>
                    </div>

                    {/* Per-size matrix */}
                    {sizes.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        {tx("var_no_sizes")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            {tx("var_sizes_for_color")}
                          </Label>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAllForVariation(variation.id, true)}>
                              {tx("var_check_all")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAllForVariation(variation.id, false)}>
                              {tx("var_uncheck_all")}
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="text-left p-2 w-20">{tx("var_col_size")}</th>
                                <th className="text-center p-2 w-24" title={tx("var_col_available_hint")}>{tx("var_col_available")}</th>
                                <th className="text-center p-2 w-28" title={tx("var_col_stock_hint")}>{tx("var_col_stock")}</th>
                                <th className="text-center p-2 w-32" title={tx("var_col_extra_hint")}>{tx("var_col_extra", { cur })}</th>
                                <th className="text-right p-2 text-[10px] normal-case font-normal">{tx("var_col_final")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sizes.map((s: any) => {
                                const row = getAvail(variation.id, s.id);
                                return (
                                  <tr key={s.id} className="border-t">
                                    <td className="p-2 font-medium">{s.size_label}</td>
                                    <td className="p-2 text-center">
                                      <Switch
                                        checked={row.is_available}
                                        onCheckedChange={(checked) =>
                                          upsertAvail.mutate({ vid: variation.id, sid: s.id, fields: { is_available: checked } })
                                        }
                                      />
                                    </td>
                                    <td className="p-2 text-center">
                                      <Input
                                        type="number"
                                        className="h-8 w-24 mx-auto text-center"
                                        disabled={!row.is_available}
                                        defaultValue={Number(row.stock_quantity || 0)}
                                        key={`stk-${variation.id}-${s.id}-${row.stock_quantity}`}
                                        onBlur={(e) => {
                                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                          if (v !== Number(row.stock_quantity || 0)) {
                                            upsertAvail.mutate({ vid: variation.id, sid: s.id, fields: { stock_quantity: v } });
                                          }
                                        }}
                                      />
                                    </td>
                                    <td className="p-2 text-center">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="h-8 w-28 mx-auto text-center"
                                        disabled={!row.is_available}
                                        defaultValue={Number(row.price_modifier || 0)}
                                        key={`mod-${variation.id}-${s.id}-${row.price_modifier}`}
                                        placeholder="0.00"
                                        onBlur={(e) => {
                                          const price = parseMoneyInput(e.target.value);
                                          if (price === null) {
                                            toast.error(tx("invalid_extra"));
                                            e.target.value = moneyInputValue(row.price_modifier);
                                          } else if (price !== Number(row.price_modifier || 0)) {
                                            upsertAvail.mutate({ vid: variation.id, sid: s.id, fields: { price_modifier: price } });
                                          }
                                        }}
                                      />
                                    </td>
                                    <td className="p-2 text-right text-xs text-muted-foreground">
                                      {tx("var_final_formula", { color: fmt.money(Number(variation.price_modifier || 0)), size: fmt.money(Number(s.price_modifier || 0)), combo: fmt.money(Number(row.price_modifier || 0)) })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {tx("var_formula_hint")}
                        </p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ─── Main Page ─────────────────────────────────────────────────────────────────
/** Campo com rótulo e dica (fora do componente para o campo não perder o foco ao digitar). */
const Field = ({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-sm font-semibold">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);
/** Interruptor com título e explicação. */
const Toggle = ({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
  </label>
);

/** Prazo do produto em dias úteis: vazio = padrão da loja; um só preenchido vale para os dois; mínimo nunca acima do máximo. */
function leadTimePayload(minRaw: unknown, maxRaw: unknown): { lead_time_min_days: number | null; lead_time_max_days: number | null } {
  const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Math.min(120, Math.max(0, Math.floor(Number(v)))));
  const a = num(minRaw);
  const b = num(maxRaw);
  if (a == null && b == null) return { lead_time_min_days: null, lead_time_max_days: null };
  const lo = a ?? b!;
  const hi = b ?? a!;
  return { lead_time_min_days: Math.min(lo, hi), lead_time_max_days: Math.max(lo, hi) };
}

const AdminProductEdit = () => {
  const specsOn = useFeature("spec_filters");
  const variantsOn = useFeature("variants");
  const deliveryDatesOn = useFeature("delivery_dates");
  const deliveryRules = useDeliveryRules();
  const { t: tv } = useMessages(adminVariantsMessages);
  const crossSellOn = useFeature("cross_sell");
  const brandsOn = useFeature("brands");
  const marketplaceOn = useFeature("marketplace");
  const subscriptionsOn = useFeature("subscriptions");
  const { t: tsubs } = useMessages(adminSubscriptionsMessages);
  const rentalsOn = useFeature("rentals");
  const digitalOn = useFeature("digital_products");
  const { t: tdig } = useMessages(adminDigitalMessages);
  const { t: trent } = useMessages(adminRentalsMessages);
  const preordersOn = useFeature("preorders");
  const { t: tpre } = useMessages(adminPreordersMessages);
  const { t: tnav } = useMessages(adminProductNavMessages);
  const { t: tc } = useMessages(crossSellMessages);
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  // Admin com o código de 2 passos por fazer também entra: o AdminShell pede o código antes do formulário.
  const { data: access, isLoading: roleLoading } = useAdminAccess();
  const isAdmin = !!access && canOpenAdmin(access);
  const fmt = useAdminFormat();
  const { t } = useMessages(adminProductMessages);
  const isNew = id === "novo";

  const [formData, setFormData] = useState({
    id: "",
    slug: "",
    name: "",
    description: "",
    price: 0,
    category: "",
    image: "",
    stock_quantity: 0,
    sku: "",
    gtin: "",
    internal_code: "",
    mpn: "",
    brand_id: "",
    vendor_id: "",
    weight: 0.3,
    dimensions: { length: 30, width: 20, height: 10 },
    shipping_class: "",
    lead_time_min_days: "",
    lead_time_max_days: "",
    material: "",
    materials: [] as string[],
    is_active: true,
    is_featured: false,
    is_new: false,
    customizable: false,
    unit_type: "unit",
    inner_margin_mm: 5,
    roll_width_cm: 58,
    max_length_cm: 250,
    min_charge_meters: 0.5,
    cost_price: 0,
    cost_per_meter: 0,
    vat_rate: 23,
    disclaimer: "",
    recommended_dtf_ids: [] as string[],
    recommended_category_ids: [] as string[],
    // Promoção do produto
    promo_active: false,
    promo_type: "percentage" as "percentage" | "fixed",
    promo_value: 0,
    promo_label: "",
    promo_has_deadline: false,
    promo_starts_at: "" as string | null | "",
    promo_ends_at: "" as string | null | "",
    promo_show_countdown: true,
  });

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["adminCategoriesList"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("name")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((c: any) => c.name);
    },
  });

  useEffect(() => {
    if (isNew && !formData.category && dbCategories.length > 0) {
      setFormData((current) => ({ ...current, category: current.category || dbCategories[0] }));
    }
  }, [dbCategories, formData.category, isNew]);

  const { data: pricingTiersCount = 0 } = useQuery({
    queryKey: ["pricingTiersCount", id],
    queryFn: async () => {
      if (isNew || !id) return 0;
      const { count, error } = await (supabase as any)
        .from("product_volume_tiers")
        .select("id", { count: "exact", head: true })
        .eq("product_id", id);
      if (error) return 0;
      return count || 0;
    },
    enabled: !isNew && !!id,
  });
  const hasTiers = pricingTiersCount > 0;

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["adminProductDetail", id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase.from("products").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
  });

  // Retrato do que está gravado, para saber se há alterações por gravar.
  const [snapshot, setSnapshot] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      const loaded = {
        id: product.id,
        slug: (product as any).slug || "",
        name: product.name || "",
        description: product.description || "",
        price: product.price || 0,
        category: product.category || "",
        image: product.image || "",
        stock_quantity: product.stock_quantity || 0,
        sku: (product as any).sku || "",
        gtin: (product as any).gtin || "",
        internal_code: (product as any).internal_code || "",
        mpn: (product as any).mpn || "",
        brand_id: (product as any).brand_id || "",
        vendor_id: (product as any).vendor_id || "",
        weight: product.weight || 0.3,
        dimensions: (product.dimensions as any) || { length: 30, width: 20, height: 10 },
        shipping_class: (product as any).shipping_class || "",
        lead_time_min_days: (product as any).lead_time_min_days == null ? "" : String((product as any).lead_time_min_days),
        lead_time_max_days: (product as any).lead_time_max_days == null ? "" : String((product as any).lead_time_max_days),
        material: product.material || "",
        materials: Array.isArray((product as any).materials) ? (product as any).materials : [],
        is_active: (product as any).is_active !== false,
        is_featured: product.is_featured || false,
        is_new: (product as any).is_new || false,
        customizable: (product as any).customizable !== false,
        unit_type: "unit",
        inner_margin_mm: (product as any).inner_margin_mm ?? 5,
        roll_width_cm: Number((product as any).roll_width_cm ?? 58),
        max_length_cm: Number((product as any).max_length_cm ?? 250),
        min_charge_meters: Number((product as any).min_charge_meters ?? 0.5),
        cost_price: Number((product as any).cost_price ?? 0),
        cost_per_meter: Number((product as any).cost_per_meter ?? 0),
        vat_rate: Number((product as any).vat_rate ?? 23),
        disclaimer: (product as any).disclaimer || "",
        recommended_dtf_ids: sanitizeUuidArray(
          Array.isArray((product as any).recommended_dtf_ids)
            ? (product as any).recommended_dtf_ids
            : ((product as any).recommended_dtf_id ? [(product as any).recommended_dtf_id] : [])
        ),
        recommended_category_ids: sanitizeUuidArray((product as any).recommended_category_ids),
        promo_active: !!(product as any).promo_active,
        promo_type: (((product as any).promo_type as any) === "fixed" ? "fixed" : "percentage") as "fixed" | "percentage",
        promo_value: Number((product as any).promo_value ?? 0),
        promo_label: (product as any).promo_label || "",
        promo_has_deadline: !!(product as any).promo_ends_at || !!(product as any).promo_starts_at,
        promo_starts_at: (product as any).promo_starts_at ? String((product as any).promo_starts_at).slice(0, 16) : "",
        promo_ends_at: (product as any).promo_ends_at ? String((product as any).promo_ends_at).slice(0, 16) : "",
        promo_show_countdown: (product as any).promo_show_countdown !== false,
      };
      setFormData(loaded);
      setSnapshot(JSON.stringify(loaded));
    }
  }, [product]);

  const dirty = isNew ? !!(formData.name.trim() || formData.id.trim()) : snapshot != null && JSON.stringify(formData) !== snapshot;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate("/shop-kodeadmin");
    else if (!isAdmin) navigate("/shop-kodeadmin");
  }, [user, isAdmin, authLoading, roleLoading, navigate]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const normalizedId = data.id.trim();
      const normalizedName = data.name.trim();
      if (!normalizedId) throw new Error(t("err_id"));
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(normalizedId)) throw new Error(t("err_id_format"));
      if (!normalizedName) throw new Error(t("err_name"));
      if (!data.category.trim()) throw new Error(t("err_category"));
      const numericFields = [
        [t("price"), data.price],
        [t("stock"), data.stock_quantity],
        [t("weight"), data.weight],
        [t("cost"), data.cost_price],
        [t("vat"), data.vat_rate],
      ] as const;
      const invalidNumeric = numericFields.find(([, value]) => !Number.isFinite(Number(value)) || Number(value) < 0);
      if (invalidNumeric) throw new Error(t("err_number", { field: invalidNumeric[0] }));
      if (!Number.isInteger(Number(data.stock_quantity))) throw new Error(t("err_stock_int"));
      if (!isValidSku(data.sku)) throw new Error(tv("err_sku_invalid"));
      if (!isValidGtin(data.gtin)) throw new Error(tv("err_gtin_invalid"));
      if (!isValidInternalCode(data.internal_code)) throw new Error(tv("err_internal_invalid"));
      if (!isValidMpn(data.mpn)) throw new Error(tv("err_mpn_invalid"));
      const slugify = (s: string) =>
        s
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "");

      // Auto-generate slug from name when empty
      let desiredSlug = data.slug && data.slug.trim() ? slugify(data.slug) : slugify(data.name || "");

      if (desiredSlug) {
        // Ensure uniqueness: append -2, -3... if another product already uses it
        const base = desiredSlug;
        let attempt = base;
        let n = 2;
        // up to 50 tries
        while (n < 52) {
          const q = (supabase as any).from("products").select("id").eq("slug", attempt);
          const { data: existing, error: checkErr } = isNew ? await q : await q.neq("id", id);
          if (checkErr) throw checkErr;
          if (!existing || existing.length === 0) break;
          attempt = `${base}-${n}`;
          n++;
        }
        desiredSlug = attempt;
      }

      const payload: any = {
        ...data,
        id: normalizedId,
        name: normalizedName,
        category: data.category.trim(),
        price: Number(data.price),
        stock_quantity: Number(data.stock_quantity),
        sku: normalizeSku(data.sku),
        gtin: normalizeGtin(data.gtin),
        internal_code: normalizeInternalCode(data.internal_code),
        mpn: normalizeMpn(data.mpn),
        brand_id: data.brand_id || null,
        vendor_id: data.vendor_id || null,
        weight: Number(data.weight),
        shipping_class: String(data.shipping_class ?? "").trim().toLowerCase() || null,
        ...leadTimePayload(data.lead_time_min_days, data.lead_time_max_days),
        cost_price: Number(data.cost_price),
        vat_rate: Number(data.vat_rate),
        slug: desiredSlug || null,
        recommended_dtf_ids: sanitizeUuidArray(data.recommended_dtf_ids),
        recommended_dtf_id: (() => {
          const arr = sanitizeUuidArray(data.recommended_dtf_ids);
          return arr.length > 0 ? arr[0] : null;
        })(),
        recommended_category_ids: sanitizeUuidArray(data.recommended_category_ids),
      };

      // Promoção — normalizar campos antes de gravar
      delete payload.promo_has_deadline;
      payload.promo_active = !!data.promo_active;
      payload.promo_type = data.promo_type === "fixed" ? "fixed" : "percentage";
      payload.promo_value = Number(data.promo_value) || 0;
      payload.promo_label = data.promo_label?.trim() || null;
      payload.promo_show_countdown = data.promo_show_countdown !== false;
      if (data.promo_has_deadline) {
        payload.promo_starts_at = data.promo_starts_at ? new Date(data.promo_starts_at).toISOString() : null;
        payload.promo_ends_at = data.promo_ends_at ? new Date(data.promo_ends_at).toISOString() : null;
      } else {
        payload.promo_starts_at = null;
        payload.promo_ends_at = null;
      }

      if (isNew) {
        const { data: lastProduct, error: orderError } = await (supabase as any)
          .from("products")
          .select("display_order")
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (orderError) throw orderError;
        payload.display_order = Number(lastProduct?.display_order ?? -1) + 1;
        const { error } = await (supabase as any).from("products").insert([payload]);
        if (error) throw error;
        return payload;
      } else {
        const { error } = await (supabase as any).from("products").update(payload).eq("id", id);
        if (error) throw error;
        return payload;
      }
    },
    onSuccess: (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
      queryClient.invalidateQueries({ queryKey: ["adminProductDetail", id] });
      const saved = { ...formData, slug: payload?.slug ?? formData.slug };
      if (payload?.slug && payload.slug !== formData.slug) {
        setFormData(saved);
        if (formData.slug) toast.info(t("slug_adjusted", { slug: payload.slug }));
      }
      setSnapshot(JSON.stringify(saved));
      queryClient.invalidateQueries({ queryKey: ["admin-catalog-index"] });
      toast.success(isNew ? t("created") : t("updated"));
      if (isNew && formData.id) navigate(`/admin/produto/${formData.id}`);
    },
    onError: (err: any) => {
      const msg: string = err?.message || "";
      const code: string = err?.code || "";
      if (/internal_code_taken|products_internal_code_unique/.test(msg)) toast.error(tv("err_internal_taken"));
      else if (/sku_taken/.test(msg)) toast.error(tv("err_sku_taken"));
      else if (/sku_invalid/.test(msg)) toast.error(tv("err_sku_invalid"));
      else if (/gtin_invalid/.test(msg)) toast.error(tv("err_gtin_invalid"));
      else if (code === "23505" && /products_slug_unique|\(slug\)/i.test(msg)) toast.error(t("err_dup_slug"));
      else if (code === "23505" && /products_pkey|\(id\)/i.test(msg)) toast.error(t("err_dup_id"));
      else if (code) toast.error(t("err_save", { msg }));
      else toast.error(msg || t("err_save", { msg: code }));
    },
  });

  if (authLoading || roleLoading || productLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const savedProductId = isNew ? null : id;
  // Partes do produto (abas), por grupo (ProductSectionNav). "persisted" = só depois de gravar (gravam direto nas suas tabelas).
  const sections: ProductSection[] = [
    { value: "info", label: t("tab_info"), icon: Package, group: "basics" },
    { value: "images", label: t("tab_images"), icon: Image, group: "basics" },
    { value: "sizes", label: t("tab_sizes"), icon: Ruler, persisted: true, group: "options" },
    { value: "variations", label: t("tab_variations"), icon: Palette, persisted: true, group: "options" },
    ...(variantsOn ? [{ value: "variants", label: tv("tab"), icon: Boxes, persisted: true, group: "options" as const }] : []),
    ...(specsOn ? [{ value: "specs", label: t("tab_specs"), icon: ListChecks, persisted: true, group: "options" as const }] : []),
    { value: "pricing", label: t("tab_pricing"), icon: Layers, persisted: true, group: "selling" },
    { value: "promo", label: t("tab_promo"), icon: Percent, group: "selling" },
    ...(subscriptionsOn ? [{ value: "subscription", label: tsubs("plan_tab"), icon: Repeat, persisted: true, group: "selling" as const }] : []),
    ...(rentalsOn ? [{ value: "rental", label: trent("p_title"), icon: CalendarRange, persisted: true, group: "selling" as const }] : []),
    ...(preordersOn && !formData.customizable ? [{ value: "preorder", label: tpre("p_title"), icon: Hourglass, persisted: true, group: "selling" as const }] : []),
    ...(digitalOn ? [{ value: "digital", label: tdig("p_title"), icon: FileDown, persisted: true, group: "selling" as const }] : []),
    { value: "shipping", label: t("tab_shipping"), icon: Truck, group: "more" },
    { value: "faqs", label: t("tab_faqs"), icon: HelpCircle, persisted: true, group: "more" },
    ...(crossSellOn ? [{ value: "links", label: tc("tab"), icon: Link2, persisted: true, group: "more" as const }] : []),
    { value: "safety", label: t("tab_safety"), icon: ShieldCheck, persisted: true, group: "more" },
    ...(formData.customizable ? [{ value: "customization", label: t("tab_customization"), icon: Box, persisted: true, group: "more" as const }] : []),
  ];
  // Endereços antigos: ?tab=advanced (peso e medidas) passou a ser Envio.
  const tabParam = searchParams.get("tab") === "advanced" ? "shipping" : searchParams.get("tab");
  const requestedSection = sections.find((section) => section.value === tabParam);
  const activeSection = requestedSection && !(isNew && requestedSection.persisted) ? requestedSection.value : "info";

  const currencySymbol = (() => {
    try { return new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? fmt.currency; }
    catch { return fmt.currency; }
  })();
  const pct = (v: number) => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0 }).format(v);
  const basePrice = Number(formData.price) || 0;
  const promoDiscount = formData.promo_active && formData.promo_value > 0
    ? (formData.promo_type === "percentage" ? Math.min(basePrice, (basePrice * formData.promo_value) / 100) : Math.min(basePrice, formData.promo_value))
    : 0;
  const effectivePrice = Math.max(0, basePrice - promoDiscount);
  const cost = Number(formData.cost_price) || 0;
  const save = () => saveMutation.mutate(formData);
  const set = <K extends keyof typeof formData>(k: K, v: (typeof formData)[K]) => setFormData((f) => ({ ...f, [k]: v }));
  const needsSave = (msg: string) => (
    <div className="flex items-center gap-3 rounded-[14px] border bg-muted/40 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />{msg}
    </div>
  );
  const saveButton = (className?: string) => (
    <Button onClick={save} disabled={saveMutation.isPending} className={cn("font-semibold", className)}>
      {saveMutation.isPending
        ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("saving")}</>
        : <><Save className="h-4 w-4" aria-hidden="true" /> {t("save")}</>}
    </Button>
  );
  const panel = "rounded-[20px] border bg-card p-4 md:p-5";
  const panelTitle = "mb-4 flex items-center gap-2 text-base font-bold";

  return (
    // Dentro da moldura do painel (menu ao lado), como as outras páginas próprias do Admin.
    // Coluna principal = partes do produto (abas); ao lado, o resumo fixo com estado no site e o botão Gravar.
    <AdminShell active="products">
      <AdminPageHeader
        back={{ to: adminHref.section("products"), label: t("back") }}
        title={isNew ? t("new_title") : formData.name || t("edit_title")}
        subtitle={!isNew ? <span className="font-mono text-xs">#{id}</span> : t("new_hint")}
        actions={
          <>
            {!isNew && id && (
              <Button asChild variant="outline">
                <Link to={adminHref.productStats(id)}><BarChart3 className="h-4 w-4" aria-hidden="true" /> {t("stats")}</Link>
              </Button>
            )}
            {!isNew && formData.slug && (
              <Button asChild variant="outline">
                <a href={`/produto/${formData.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" /> {t("view_store")}</a>
              </Button>
            )}
            {saveButton("hidden sm:inline-flex")}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={activeSection} onValueChange={(tab) => setSearchParams((current) => { current.set("tab", tab); return current; }, { replace: true })} className="min-w-0 space-y-5">
          <ProductSectionNav sections={sections} active={activeSection} isNew={isNew}
            onChange={(tab) => setSearchParams((current) => { current.set("tab", tab); return current; }, { replace: true })} />

          {/* ── Dados ── */}
          <TabsContent value="info" className="mt-0 space-y-5">
            <section className={panel}>
              <h2 className={panelTitle}><Package className="h-4 w-4 text-primary" aria-hidden="true" />{t("basics")}<HelpTip label={tnav("help")} text={tnav("h_basics")} /></h2>
              <div className="space-y-4">
                {isNew && (
                  <Field label={`${t("id_label")} *`} htmlFor="id" hint={t("id_hint")}>
                    <Input id="id" value={formData.id} placeholder={t("id_placeholder")} className="font-mono"
                      onChange={(e) => set("id", e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
                  </Field>
                )}
                <Field label={`${t("name_label")} *`} htmlFor="name">
                  <Input id="name" value={formData.name} placeholder={t("name_placeholder")} className="text-base" onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label={t("slug_label")} htmlFor="slug" hint={t("slug_hint")}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">/produto/</span>
                    <Input id="slug" value={formData.slug} className="font-mono text-sm"
                      onChange={(e) => set("slug", e.target.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-"))} />
                  </div>
                </Field>
                <Field label={t("description")}>
                  <RichTextEditor value={formData.description} onChange={(html) => set("description", html)} placeholder={t("description_placeholder")} />
                </Field>
                <Field label={t("material")} htmlFor="material">
                  <Input id="material" value={formData.material} placeholder={t("material_placeholder")} onChange={(e) => set("material", e.target.value)} />
                  <MaterialTagsPicker selected={formData.materials} onChange={(next) => set("materials", next)} />
                </Field>
              </div>
            </section>

            <section className={panel}>
              <h2 className={panelTitle}><Banknote className="h-4 w-4 text-primary" aria-hidden="true" />{t("price_stock")}<HelpTip label={tnav("help")} text={tnav("h_price_stock")} /></h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t("price")} *`} htmlFor="price" hint={hasTiers ? t("price_tiers_hint") : t("price_hint")}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">{currencySymbol}</span>
                    <Input id="price" type={hasTiers ? "text" : "number"} step="0.01" min="0" inputMode="decimal"
                      value={hasTiers ? t("price_tiers") : formData.price}
                      onChange={(e) => set("price", parseFloat(e.target.value))}
                      className="pl-10 text-lg font-bold" disabled={hasTiers} readOnly={hasTiers} />
                  </div>
                </Field>
                <Field label={t("cost")} htmlFor="cost_price"
                  hint={cost > 0 && basePrice > 0
                    ? <span className={cn("font-medium", effectivePrice - cost < 0 ? "text-destructive" : "text-emerald-700")}>{t("margin", { value: fmt.money(effectivePrice - cost), pct: pct((effectivePrice - cost) / (effectivePrice || 1)) })}</span>
                    : t("cost_hint")}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">{currencySymbol}</span>
                    <Input id="cost_price" type="number" step="0.01" min="0" inputMode="decimal" value={formData.cost_price || ""} placeholder="0,00"
                      onChange={(e) => set("cost_price", parseFloat(e.target.value) || 0)} className="pl-10" />
                  </div>
                </Field>
                <Field label={`${t("category")} *`} hint={dbCategories.length ? undefined : t("category_none")}>
                  <Select value={formData.category || undefined} onValueChange={(v) => set("category", v)}>
                    <SelectTrigger><SelectValue placeholder={t("category")} /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([...(formData.category ? [formData.category] : []), ...dbCategories])].map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("stock")} htmlFor="stock" hint={t("stock_hint")}>
                  <Input id="stock" type="number" min="0" step="1" value={formData.stock_quantity} onChange={(e) => set("stock_quantity", parseInt(e.target.value))} />
                </Field>
                {/* Códigos do produto: quais o cliente vê e onde fica em Admin > Catálogo > Códigos do produto. */}
                <Field label={tv("p_sku")} htmlFor="sku" hint={tv("p_sku_hint")}>
                  <Input id="sku" value={formData.sku} maxLength={64} className="font-mono" onChange={(e) => set("sku", e.target.value)} />
                </Field>
                <Field label={tv("p_internal")} htmlFor="internal_code" hint={tv("p_internal_hint")}>
                  <Input id="internal_code" value={formData.internal_code} maxLength={64} className="font-mono" onChange={(e) => set("internal_code", e.target.value)} />
                </Field>
                <Field label={tv("p_mpn")} htmlFor="mpn" hint={tv("p_mpn_hint")}>
                  <Input id="mpn" value={formData.mpn} maxLength={70} className="font-mono" onChange={(e) => set("mpn", e.target.value)} />
                </Field>
                <Field label={tv("p_gtin")} htmlFor="gtin" hint={tv("p_gtin_hint")}>
                  <Input id="gtin" value={formData.gtin} inputMode="numeric" maxLength={18} className="font-mono" onChange={(e) => set("gtin", e.target.value)} />
                </Field>
                <p className="-mt-1 text-xs sm:col-span-2">
                  <Link to={adminHref.section("product-codes")} className="font-semibold text-brand-orange-text underline-offset-4 hover:underline">{tv("p_codes_where")}</Link>
                </p>
                {brandsOn && <BrandField value={formData.brand_id} onChange={(v) => set("brand_id", v)} />}
                {marketplaceOn && <VendorField value={formData.vendor_id} onChange={(v) => set("vendor_id", v)} />}
                <Field label={t("vat")} htmlFor="vat_rate" hint={t("vat_hint")}>
                  <Input id="vat_rate" type="number" min="0" max="100" step="0.1" value={formData.vat_rate} onChange={(e) => set("vat_rate", parseFloat(e.target.value) || 0)} className="max-w-[140px]" />
                </Field>
              </div>
            </section>

            <section className={panel}>
              <h2 className={panelTitle}><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />{t("disclaimer")}<HelpTip label={tnav("help")} text={tnav("h_disclaimer")} /></h2>
              <Textarea value={formData.disclaimer} rows={3} placeholder={t("disclaimer_placeholder")} onChange={(e) => set("disclaimer", e.target.value)} />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("disclaimer_hint")}</p>
            </section>
          </TabsContent>

          {/* ── Fotos e mídia ── */}
          <TabsContent value="images" className="mt-0 space-y-5">
            <section className={panel}>
              <h2 className={panelTitle}><Image className="h-4 w-4 text-primary" aria-hidden="true" />{t("main_photo")}<HelpTip label={tnav("help")} text={tnav("h_main_photo")} /></h2>
              <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("main_photo_hint")}</p>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ImageUploader category="product" currentImage={formData.image} onImageUploaded={(url) => set("image", url)} />
                {formData.image && (
                  <div className="aspect-square max-h-80 overflow-hidden rounded-[18px] border">
                    <img src={formData.image} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
            </section>
            <section className={panel}>
              <h2 className={panelTitle}><Images className="h-4 w-4 text-primary" aria-hidden="true" />{t("gallery")}<HelpTip label={tnav("help")} text={tnav("h_gallery")} /></h2>
              <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("gallery_hint")}</p>
              {savedProductId ? <ProductGalleryManager productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
            {savedProductId && (
              <section className={panel}>
                <h2 className={panelTitle}><Box className="h-4 w-4 text-primary" aria-hidden="true" />{t("media")}<HelpTip label={tnav("help")} text={tnav("h_media")} /></h2>
                <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("media_hint")}</p>
                <ProductMediaManager productId={savedProductId} />
              </section>
            )}
          </TabsContent>

          {/* ── Tamanhos, cores, preço por quantidade, perguntas e áreas: gravam direto nas suas tabelas ── */}
          <TabsContent value="sizes" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Ruler className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_sizes")}<HelpTip label={tnav("help")} text={tnav("d_sizes")} /></h2>
              {savedProductId ? <SizesTab productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="variations" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Palette className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_variations")}<HelpTip label={tnav("help")} text={tnav("d_variations")} /></h2>
              {savedProductId ? <VariationsTab productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="variants" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Boxes className="h-4 w-4 text-primary" aria-hidden="true" />{tv("tab")}<HelpTip label={tnav("help")} text={tnav("d_variants")} /></h2>
              {savedProductId ? <ProductVariantsEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="pricing" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Layers className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_pricing")}<HelpTip label={tnav("help")} text={tnav("d_pricing")} /></h2>
              {savedProductId ? <PricingTiersTab productId={savedProductId} unitType="unit" /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="faqs" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_faqs")}<HelpTip label={tnav("help")} text={tnav("d_faqs")} /></h2>
              {savedProductId ? <FaqsTab productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="links" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Link2 className="h-4 w-4 text-primary" aria-hidden="true" />{tc("tab")}<HelpTip label={tnav("help")} text={tnav("d_links")} /></h2>
              {savedProductId ? <ProductLinksEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="specs" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_specs")}<HelpTip label={tnav("help")} text={tnav("d_specs")} /></h2>
              {savedProductId ? <ProductSpecsEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="subscription" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Repeat className="h-4 w-4 text-primary" aria-hidden="true" />{tsubs("plans_title")}<HelpTip label={tnav("help")} text={tnav("d_subscription")} /></h2>
              {savedProductId ? <ProductSubscriptionPlans productId={savedProductId} basePrice={basePrice} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="rental" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />{trent("p_title")}<HelpTip label={tnav("help")} text={tnav("d_rental")} /></h2>
              {savedProductId ? <ProductRentalEditor productId={savedProductId} basePrice={basePrice} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="preorder" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Hourglass className="h-4 w-4 text-primary" aria-hidden="true" />{tpre("p_title")}<HelpTip label={tnav("help")} text={tnav("d_preorder")} /></h2>
              {savedProductId ? <ProductPreorderEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="digital" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><FileDown className="h-4 w-4 text-primary" aria-hidden="true" />{tdig("p_on")}<HelpTip label={tnav("help")} text={tnav("d_digital")} /></h2>
              {savedProductId ? <ProductDigitalEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="safety" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />{t("tab_safety")}<HelpTip label={tnav("help")} text={tnav("d_safety")} /></h2>
              {savedProductId ? <ProductSafetyEditor productId={savedProductId} /> : needsSave(t("save_first"))}
            </section>
          </TabsContent>
          <TabsContent value="customization" className="mt-0">
            {!formData.customizable ? needsSave(t("customization_off"))
              : savedProductId ? <ProductCustomizationManager productId={savedProductId} /> : needsSave(t("save_first"))}
          </TabsContent>

          {/* ── Promoção ── */}
          <TabsContent value="promo" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Percent className="h-4 w-4 text-primary" aria-hidden="true" />{t("promo_title")}<HelpTip label={tnav("help")} text={tnav("h_promo")} /></h2>
              <p className="-mt-2 mb-3 text-sm text-muted-foreground">{t("promo_intro")}</p>
              <Toggle label={t("promo_on")} hint={t("promo_on_hint")} checked={formData.promo_active} onChange={(v) => set("promo_active", v)} />
              {formData.promo_active && (
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t("promo_type")}>
                      <Select value={formData.promo_type} onValueChange={(v) => set("promo_type", v as "percentage" | "fixed")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">{t("promo_percent")}</SelectItem>
                          <SelectItem value="fixed">{t("promo_fixed", { currency: currencySymbol })}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={`${t("promo_value")} ${formData.promo_type === "percentage" ? "(%)" : `(${currencySymbol})`}`} htmlFor="promo_value">
                      <Input id="promo_value" type="number" step="0.01" min="0" value={formData.promo_value} onChange={(e) => set("promo_value", parseFloat(e.target.value) || 0)} />
                    </Field>
                  </div>
                  <Field label={t("promo_label")} htmlFor="promo_label">
                    <Input id="promo_label" value={formData.promo_label} maxLength={40} placeholder={t("promo_label_placeholder")} onChange={(e) => set("promo_label", e.target.value)} />
                  </Field>
                  <Toggle label={t("promo_deadline")} hint={t("promo_deadline_hint")} checked={formData.promo_has_deadline} onChange={(v) => set("promo_has_deadline", v)} />
                  {formData.promo_has_deadline && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={t("promo_start")}><Input type="datetime-local" value={formData.promo_starts_at || ""} onChange={(e) => set("promo_starts_at", e.target.value)} /></Field>
                      <Field label={t("promo_end")}><Input type="datetime-local" value={formData.promo_ends_at || ""} onChange={(e) => set("promo_ends_at", e.target.value)} /></Field>
                    </div>
                  )}
                  <Toggle label={t("promo_countdown")} hint={t("promo_countdown_hint")} checked={formData.promo_show_countdown} onChange={(v) => set("promo_show_countdown", v)} />
                  {basePrice > 0 && promoDiscount > 0 && (
                    <div className="space-y-1 rounded-[14px] border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary text-primary-foreground">-{pct(promoDiscount / basePrice)}</Badge>
                        {formData.promo_label && <span className="text-xs font-medium text-brand-orange-text">{formData.promo_label}</span>}
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm text-muted-foreground line-through">{fmt.money(basePrice)}</span>
                        <span className="text-2xl font-bold">{fmt.money(effectivePrice)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("promo_preview")}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── Envio: peso, medidas e classe de envio ── */}
          <TabsContent value="shipping" className="mt-0">
            <section className={panel}>
              <h2 className={panelTitle}><Truck className="h-4 w-4 text-primary" aria-hidden="true" />{t("shipping_title")}<HelpTip label={tnav("help")} text={tnav("h_shipping")} /></h2>
              <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("shipping_intro")}</p>
              <div className="space-y-5">
                <Field label={t("weight")} htmlFor="weight">
                  <Input id="weight" type="number" step="0.01" min="0" value={formData.weight} onChange={(e) => set("weight", parseFloat(e.target.value))} className="max-w-[160px]" />
                </Field>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">{t("box")}</p>
                  <div className="grid max-w-md grid-cols-3 gap-3">
                    {(["length", "width", "height"] as const).map((dim) => (
                      <div key={dim}>
                        <Label htmlFor={`dim-${dim}`} className="text-xs text-muted-foreground">{t(dim)}</Label>
                        <Input id={`dim-${dim}`} type="number" step="0.1" min="0" className="mt-1" value={(formData.dimensions as any)?.[dim] || 0}
                          onChange={(e) => set("dimensions", { ...((formData.dimensions as any) || {}), [dim]: parseFloat(e.target.value) || 0 })} />
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const d = formData.dimensions as any;
                    if (!(d?.length && d?.width && d?.height)) return null;
                    const kg = new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 3 }).format((d.length * d.width * d.height) / 6000);
                    return <p className="inline-flex rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-brand-orange-text">{t("volumetric", { kg })}</p>;
                  })()}
                </div>
                {/* Prazo de produção ou preparo (Admin > Prazos e entrega): vazio = padrão da loja. */}
                {deliveryDatesOn && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">{t("lead_title")}</p>
                    <div className="grid max-w-xs grid-cols-2 gap-3">
                      {(["lead_time_min_days", "lead_time_max_days"] as const).map((k) => (
                        <div key={k}>
                          <Label htmlFor={k} className="text-xs text-muted-foreground">{t(k === "lead_time_min_days" ? "lead_min" : "lead_max")}</Label>
                          <Input id={k} inputMode="numeric" className="mt-1" placeholder={String(k === "lead_time_min_days" ? deliveryRules.settings.default_min : deliveryRules.settings.default_max)}
                            value={formData[k]} onChange={(e) => set(k, e.target.value.replace(/\D/g, "").slice(0, 3))} />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("lead_hint", { min: deliveryRules.settings.default_min, max: deliveryRules.settings.default_max })}</p>
                  </div>
                )}
                {/* Classe de envio: Admin > Frete e entrega pode recusar classes em cada forma de envio. */}
                <Field label={t("shipping_class")} htmlFor="shipping_class" hint={t("shipping_class_hint")}>
                  <Input id="shipping_class" value={formData.shipping_class} placeholder={t("shipping_class_placeholder")} onChange={(e) => set("shipping_class", e.target.value)} className="max-w-xs" />
                </Field>
              </div>
            </section>
          </TabsContent>
        </Tabs>

        {/* ── Resumo ao lado: como o produto aparece, estado no site e Gravar ── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className={panel}>
            <h2 className="sr-only">{t("summary")}</h2>
            <div className="flex gap-3">
              {formData.image
                ? <img src={formData.image} alt="" className="h-20 w-20 shrink-0 rounded-[14px] border object-cover" />
                : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-[14px] bg-muted text-xs text-muted-foreground">{t("no_photo")}</span>}
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold">{formData.name || t("new_title")}</p>
                {formData.category && <p className="truncate text-xs text-muted-foreground">{formData.category}</p>}
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-bold">{fmt.money(effectivePrice)}</span>
                  {promoDiscount > 0 && <span className="text-xs text-muted-foreground line-through">{fmt.money(basePrice)}</span>}
                </p>
              </div>
            </div>
            <Separator className="my-3" />
            <div className="divide-y">
              <Toggle label={t("visible")} hint={t("visible_hint")} checked={formData.is_active} onChange={(v) => set("is_active", v)} />
              <Toggle label={t("featured")} hint={t("featured_hint")} checked={formData.is_featured} onChange={(v) => set("is_featured", v)} />
              <Toggle label={t("is_new")} hint={t("is_new_hint")} checked={formData.is_new} onChange={(v) => set("is_new", v)} />
              <Toggle label={t("customizable")} hint={t("customizable_hint")} checked={formData.customizable} onChange={(v) => set("customizable", v)} />
            </div>
            <Separator className="my-3" />
            {/* No celular, com alterações, quem grava é a barra fixa do fundo: aqui o botão some para não repetir. */}
            {saveButton(cn("w-full", dirty && "max-sm:hidden"))}
            {(dirty || !isNew) && <p className={cn("mt-2 flex items-center justify-center gap-1.5 text-xs", dirty ? "font-medium text-brand-orange-text" : "text-muted-foreground")} aria-live="polite">
              {dirty ? <><span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />{t("unsaved")}</> : <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t("all_saved")}</>}
            </p>}
          </section>
        </aside>
      </div>

      {/* No celular: barra de Gravar fixa no fundo enquanto houver alterações. Em portal no <body>: as animações
          da moldura prenderiam o "fixed" à página; por cima do cartão Primeiros passos até gravar. */}
      {dirty && (
        <>
          <div className="h-20 sm:hidden" aria-hidden="true" />
          {createPortal(
            <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 p-3 backdrop-blur sm:hidden">
              {saveButton("w-full")}
            </div>,
            document.body,
          )}
        </>
      )}
    </AdminShell>
  );
};

export default AdminProductEdit;

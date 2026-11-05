import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, CopyPlus, Loader2, Palette, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moneyInputValue, parseMoneyInput } from "@/lib/moneyInput";
import { useMessages } from "@/i18n";
import { adminProductAreasMessages } from "@/i18n/adminProductAreas";
import { useAdminFormat } from "@/hooks/useAdminList";

export type ProductVariationPresetSource = {
  id: string;
  name: string;
  color_hex: string | null;
  image_url: string | null;
  price_modifier?: number | null;
  display_order: number;
};

type PalettePreset = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
};

type PaletteColor = {
  id: string;
  preset_id: string;
  name: string;
  color_hex: string | null;
  image_url: string | null;
  price_modifier: number;
  display_order: number;
};

const normalizedName = (value: string) => value.trim().toLocaleLowerCase("pt-PT");

function PresetImageField({ color, onChange }: { color: PaletteColor; onChange: (url: string | null) => void }) {
  const { t } = useMessages(adminProductAreasMessages);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("err_image_type"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("err_image_size"));
      return;
    }
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `preset-colors/${color.preset_id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (error: any) {
      toast.error(error?.message || t("err_image_upload"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      {color.image_url ? <img src={color.image_url} alt="" className="h-9 w-9 shrink-0 rounded border object-cover" /> : <div className="h-9 w-9 shrink-0 rounded border bg-muted" aria-hidden="true" />}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) upload(file);
        event.target.value = "";
      }} />
      <Button type="button" variant="outline" size="sm" className="min-w-0 flex-1" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        <span className="truncate">{color.image_url ? t("change_image") : t("add_image")}</span>
      </Button>
      {color.image_url && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={t("remove_image_of", { name: color.name })}><X className="h-4 w-4" /></Button>}
    </div>
  );
}

export default function ColorPaletteManager({
  productId,
  existingVariations,
  onApplied,
}: {
  productId: string;
  existingVariations: ProductVariationPresetSource[];
  onApplied: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useMessages(adminProductAreasMessages);
  const { money } = useAdminFormat();
  const [selectedPreset, setSelectedPreset] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const { ask, confirmSlot } = useInlineConfirm();
  const [newPresetName, setNewPresetName] = useState("");
  const [productPresetName, setProductPresetName] = useState("");
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#000000");
  const [newColorPrice, setNewColorPrice] = useState("0.00");
  const [batchPrice, setBatchPrice] = useState("0.00");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: presets = [], isLoading: presetsLoading, error: presetsError } = useQuery({
    queryKey: ["color-palettes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("variation_presets")
        .select("id,name,description,display_order")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data || []) as PalettePreset[];
    },
  });

  const { data: colors = [], isLoading: colorsLoading, error: colorsError } = useQuery({
    queryKey: ["palette-colors", activeId],
    queryFn: async () => {
      if (!activeId) return [];
      const { data, error } = await (supabase as any)
        .from("variation_preset_items")
        .select("id,preset_id,name,color_hex,image_url,price_modifier,display_order")
        .eq("preset_id", activeId)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data || []) as PaletteColor[];
    },
    enabled: !!activeId,
  });

  const activePreset = useMemo(() => presets.find((preset) => preset.id === activeId) ?? null, [activeId, presets]);

  const refreshPresets = async () => {
    await queryClient.invalidateQueries({ queryKey: ["color-palettes"] });
  };
  const refreshColors = async () => {
    await queryClient.invalidateQueries({ queryKey: ["palette-colors", activeId] });
  };

  const createPreset = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    setBusy("create-preset");
    try {
      const { data, error } = await (supabase as any)
        .from("variation_presets")
        .insert({ name: trimmed, display_order: presets.length })
        .select("id")
        .single();
      if (error) throw error;
      setActiveId(data.id);
      setNewPresetName("");
      await refreshPresets();
      toast.success(t("color_preset_created"));
      return data.id as string;
    } catch (error: any) {
      toast.error(error?.message || t("err_create_preset"));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const createFromProduct = async () => {
    if (!existingVariations.length) {
      toast.error(t("err_no_colors_to_save"));
      return;
    }
    const name = productPresetName.trim();
    if (!name) {
      toast.error(t("err_preset_name"));
      return;
    }
    setBusy("from-product");
    let presetId: string | null = null;
    try {
      const { data, error } = await (supabase as any)
        .from("variation_presets")
        .insert({ name, display_order: presets.length })
        .select("id")
        .single();
      if (error) throw error;
      presetId = data.id;
      const ordered = [...existingVariations].sort((a, b) => a.display_order - b.display_order);
      const { error: itemsError } = await (supabase as any).from("variation_preset_items").insert(
        ordered.map((variation, index) => ({
          preset_id: presetId,
          name: variation.name,
          color_hex: variation.color_hex,
          image_url: variation.image_url,
          price_modifier: Number(variation.price_modifier || 0),
          display_order: index,
        })),
      );
      if (itemsError) throw itemsError;
      setActiveId(presetId);
      setProductPresetName("");
      await Promise.all([refreshPresets(), queryClient.invalidateQueries({ queryKey: ["palette-colors", presetId] })]);
      toast.success(t("color_preset_from_product"));
    } catch (error: any) {
      if (presetId) await (supabase as any).from("variation_presets").delete().eq("id", presetId);
      toast.error(error?.message || t("err_create_preset"));
    } finally {
      setBusy(null);
    }
  };

  const duplicatePreset = async (preset: PalettePreset) => {
    setBusy("duplicate");
    let newId: string | null = null;
    try {
      const { data: items, error: readError } = await (supabase as any).from("variation_preset_items").select("*").eq("preset_id", preset.id).order("display_order");
      if (readError) throw readError;
      const { data, error } = await (supabase as any).from("variation_presets").insert({ name: t("copy_name", { name: preset.name }), description: preset.description, display_order: presets.length }).select("id").single();
      if (error) throw error;
      newId = data.id;
      if (items?.length) {
        const { error: copyError } = await (supabase as any).from("variation_preset_items").insert(items.map((item: PaletteColor) => ({
          preset_id: newId, name: item.name, color_hex: item.color_hex, image_url: item.image_url,
          price_modifier: item.price_modifier ?? 0, display_order: item.display_order,
        })));
        if (copyError) throw copyError;
      }
      await refreshPresets();
      setActiveId(newId);
      toast.success(t("color_copy_created"));
    } catch (error: any) {
      if (newId) await (supabase as any).from("variation_presets").delete().eq("id", newId);
      toast.error(error?.message || t("err_duplicate"));
    } finally { setBusy(null); }
  };

  const importCurrentProduct = async () => {
    if (!activeId) return;
    const existing = new Set(colors.map((color) => normalizedName(color.name)));
    const missing = [...existingVariations]
      .sort((a, b) => a.display_order - b.display_order)
      .filter((variation) => !existing.has(normalizedName(variation.name)));
    if (!missing.length) {
      toast.info(t("colors_all_in_preset"));
      return;
    }
    setBusy("import-product");
    try {
      const { error } = await (supabase as any).from("variation_preset_items").insert(
        missing.map((variation, index) => ({
          preset_id: activeId,
          name: variation.name,
          color_hex: variation.color_hex,
          image_url: variation.image_url,
          price_modifier: Number(variation.price_modifier || 0),
          display_order: colors.length + index,
        })),
      );
      if (error) throw error;
      await refreshColors();
      toast.success(t(missing.length === 1 ? "colors_imported_one" : "colors_imported_other", { n: missing.length }));
    } catch (error: any) {
      toast.error(error?.message || t("err_import_colors"));
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = async () => {
    if (!selectedPreset) return;
    setBusy("apply");
    try {
      const { data, error } = await (supabase as any)
        .from("variation_preset_items")
        .select("name,color_hex,image_url,price_modifier,display_order")
        .eq("preset_id", selectedPreset)
        .order("display_order");
      if (error) throw error;
      const existing = new Set(existingVariations.map((variation) => normalizedName(variation.name)));
      const missing = (data || []).filter((item: any) => !existing.has(normalizedName(item.name)));
      if (!missing.length) {
        toast.info(t("colors_all_in_product"));
        return;
      }
      const { error: insertError } = await (supabase as any).from("product_variations").insert(
        missing.map((item: any, index: number) => ({
          product_id: productId,
          name: item.name,
          color_hex: item.color_hex || null,
          image_url: item.image_url || null,
          price_modifier: Number(item.price_modifier || 0),
          display_order: existingVariations.length + index,
          is_active: true,
        })),
      );
      if (insertError) throw insertError;
      setSelectedPreset("");
      onApplied();
      toast.success(t(missing.length === 1 ? "colors_added_one" : "colors_added_other", { n: missing.length }));
    } catch (error: any) {
      toast.error(error?.message || t("err_apply_preset"));
    } finally {
      setBusy(null);
    }
  };

  const updatePreset = async (id: string, fields: Partial<PalettePreset>) => {
    const { error } = await (supabase as any).from("variation_presets").update(fields).eq("id", id);
    if (error) toast.error(error.message); else await refreshPresets();
  };

  const reorderPresets = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= presets.length) return;
    const next = [...presets];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const results = await Promise.all(next.map((preset, order) => (supabase as any).from("variation_presets").update({ display_order: order }).eq("id", preset.id)));
    if (results.some((result: any) => result.error)) toast.error(t("err_reorder_presets"));
    await refreshPresets();
  };

  const updateColor = async (id: string, fields: Partial<PaletteColor>) => {
    const { error } = await (supabase as any).from("variation_preset_items").update(fields).eq("id", id);
    if (error) toast.error(error.message); else await refreshColors();
  };

  const reorderColors = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= colors.length) return;
    const next = [...colors];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const results = await Promise.all(next.map((color, order) => (supabase as any).from("variation_preset_items").update({ display_order: order }).eq("id", color.id)));
    if (results.some((result: any) => result.error)) toast.error(t("err_reorder_colors"));
    await refreshColors();
  };

  const addColor = async () => {
    const price = parseMoneyInput(newColorPrice);
    if (!activeId || !newColorName.trim() || price === null) {
      toast.error(t("err_add_color"));
      return;
    }
    const { error } = await (supabase as any).from("variation_preset_items").insert({
      preset_id: activeId,
      name: newColorName.trim(),
      color_hex: newColorHex || null,
      price_modifier: price,
      display_order: colors.length,
    });
    if (error) toast.error(error.message);
    else {
      setNewColorName("");
      setNewColorHex("#000000");
      setNewColorPrice("0.00");
      await refreshColors();
    }
  };

  const applyBatchPrice = async () => {
    const price = parseMoneyInput(batchPrice);
    if (!activeId || price === null) {
      toast.error(t("err_batch_price"));
      return;
    }
    if (!(await ask(t("batch_q", { n: colors.length, price: money(price) }), { tone: "warning", confirmLabel: t("replace") }))) return;
    setBusy("batch-price");
    const { error } = await (supabase as any).from("variation_preset_items").update({ price_modifier: price }).eq("preset_id", activeId);
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      await refreshColors();
      toast.success(t("batch_done"));
    }
  };

  return (
    <div className="space-y-4">
      {(presetsError || colorsError) && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{t("colors_load_error")}</p>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <div>
          <Label htmlFor="apply-color-preset" className="text-xs">{t("apply_color_preset")}</Label>
          <select
            id="apply-color-preset"
            value={selectedPreset}
            onChange={(event) => setSelectedPreset(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{presets.length ? t("select_a_preset") : t("no_presets_available")}</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </div>
        <Button onClick={applyPreset} disabled={!selectedPreset || busy === "apply"}>
          {busy === "apply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t("apply_to_product")}
        </Button>
        <Button variant="outline" onClick={() => setManageOpen((open) => !open)} aria-expanded={manageOpen}>
          <Palette className="mr-2 h-4 w-4" /> {t("manage_presets")}
        </Button>
      </div>

      <InlinePanel open={manageOpen} onClose={() => setManageOpen(false)} title={t("color_presets_title")} description={t("color_presets_desc")}>
        {confirmSlot}
        <div className="space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-sm font-semibold">{t("new_empty_preset")}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} placeholder={t("preset_name")} />
                <Button onClick={() => createPreset(newPresetName)} disabled={!newPresetName.trim() || busy === "create-preset"}><Plus className="mr-2 h-4 w-4" />{t("create_preset")}</Button>
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-semibold">{t("from_product_title")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("from_product_hint")}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input value={productPresetName} onChange={(event) => setProductPresetName(event.target.value)} placeholder={t("new_preset_name")} />
                <Button onClick={createFromProduct} disabled={!productPresetName.trim() || !existingVariations.length || busy === "from-product"}>
                  <CopyPlus className="mr-2 h-4 w-4" /> {t("save_product")}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-w-0 space-y-2" aria-label={t("color_presets_list")}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t("presets")}</p>
                <Badge variant="secondary">{presets.length}</Badge>
              </div>
              {presetsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : presets.map((preset, index) => (
                <div key={preset.id} className={cn("flex min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-background p-2", activeId === preset.id && "border-primary ring-1 ring-primary/20") }>
                  <button type="button" onClick={() => setActiveId(preset.id)} className="min-w-0 min-h-10 w-full sm:w-auto sm:flex-1 text-left text-sm font-medium truncate" aria-label={t("edit_name", { name: preset.name })}>{preset.name}</button>
                  <Button type="button" size="icon" variant="ghost" disabled={!!busy} onClick={() => duplicatePreset(preset)} aria-label={t("duplicate_name", { name: preset.name })}><CopyPlus className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => reorderPresets(index, -1)} aria-label={t("move_up_name", { name: preset.name })}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === presets.length - 1} onClick={() => reorderPresets(index, 1)} aria-label={t("move_down_name", { name: preset.name })}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={async () => {
                    if (!(await ask(t("delete_color_preset_q", { name: preset.name }), { confirmLabel: t("delete") }))) return;
                    const { error } = await (supabase as any).from("variation_presets").delete().eq("id", preset.id);
                    if (error) toast.error(error.message); else { if (activeId === preset.id) setActiveId(null); await refreshPresets(); }
                  }} aria-label={t("delete_name", { name: preset.name })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              ))}
            </aside>

            <section className="min-w-0 rounded-lg border bg-background p-3 sm:p-4" aria-label={t("preset_editor")}>
              {!activePreset ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("select_or_create")}</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <Label className="text-xs">{t("preset_name")}</Label>
                      <Input defaultValue={activePreset.name} key={activePreset.id} onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== activePreset.name) updatePreset(activePreset.id, { name });
                      }} />
                    </div>
                    <Button variant="outline" onClick={importCurrentProduct} disabled={!existingVariations.length || busy === "import-product"}>
                      <CopyPlus className="mr-2 h-4 w-4" /> {t("import_colors")}
                    </Button>
                  </div>

                  <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <Label className="text-xs">{t("batch_label")}</Label>
                      <Input value={batchPrice} onChange={(event) => setBatchPrice(event.target.value)} inputMode="decimal" aria-label={t("batch_aria")} />
                    </div>
                    <Button variant="secondary" onClick={applyBatchPrice} disabled={!colors.length || busy === "batch-price"}>{t("apply_batch")}</Button>
                  </div>

                  <div className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-[44px_minmax(0,1fr)_130px_auto] sm:items-end">
                    <input type="color" value={newColorHex} onChange={(event) => setNewColorHex(event.target.value.toUpperCase())} className="h-10 w-11 rounded border bg-background p-1" aria-label={t("new_color_swatch")} />
                    <div><Label className="text-xs">{t("new_color")}</Label><Input value={newColorName} onChange={(event) => setNewColorName(event.target.value)} placeholder={t("name")} /></div>
                    <div><Label className="text-xs">{t("default_price")}</Label><Input value={newColorPrice} onChange={(event) => setNewColorPrice(event.target.value)} inputMode="decimal" /></div>
                    <Button onClick={addColor} disabled={!newColorName.trim()}><Plus className="mr-2 h-4 w-4" /> {t("add")}</Button>
                  </div>

                  {colorsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : colors.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("no_colors_in_preset")}</p>
                  ) : (
                    <div className="space-y-2">
                      {colors.map((color, index) => (
                        <article key={color.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[40px_minmax(130px,1fr)_110px_minmax(150px,1fr)_auto] sm:items-center">
                          <input type="color" defaultValue={/^#[0-9a-f]{6}$/i.test(color.color_hex || "") ? color.color_hex! : "#000000"} onChange={(event) => updateColor(color.id, { color_hex: event.target.value.toUpperCase() })} className="h-9 w-10 rounded border p-1" aria-label={t("color_of", { name: color.name })} />
                          <Input defaultValue={color.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== color.name) updateColor(color.id, { name }); }} aria-label={t("color_name")} />
                          <Input defaultValue={moneyInputValue(color.price_modifier)} inputMode="decimal" onBlur={(event) => {
                            const price = parseMoneyInput(event.target.value);
                            if (price === null) { toast.error(t("err_invalid_price")); event.target.value = moneyInputValue(color.price_modifier); }
                            else if (price !== Number(color.price_modifier)) updateColor(color.id, { price_modifier: price });
                          }} aria-label={t("default_price_of", { name: color.name })} />
                          <PresetImageField color={color} onChange={(image_url) => updateColor(color.id, { image_url })} />
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => reorderColors(index, -1)} aria-label={t("move_up_name", { name: color.name })}><ArrowUp className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" disabled={index === colors.length - 1} onClick={() => reorderColors(index, 1)} aria-label={t("move_down_name", { name: color.name })}><ArrowDown className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={async () => {
                              if (!(await ask(t("remove_color_q", { name: color.name }), { confirmLabel: t("remove") }))) return;
                              const { error } = await (supabase as any).from("variation_preset_items").delete().eq("id", color.id);
                              if (error) toast.error(error.message); else refreshColors();
                            }} aria-label={t("remove_name", { name: color.name })}><X className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </InlinePanel>
      {!manageOpen && confirmSlot}
    </div>
  );
}

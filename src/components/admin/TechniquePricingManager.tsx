import { useMemo, useState } from "react";
import PriceInput from "./PriceInput";
import { reconcileMaterialIds } from "@/lib/materialReconciliation";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowUp, ArrowDown, Bookmark, Euro, Loader2, Pencil, Plus, Save, Settings2, Trash2 } from "lucide-react";

// Métodos = os de Admin > Produtos > Métodos (tabela print_methods, usePrintMethods), os mesmos das áreas.
export type Method = string;
type PricingMode = "flat" | "per_cm2";
export type MaterialDraft = {
  id?: string;
  name: string;
  price: number;
  pricingMode: "fixed" | "per_linear_meter";
  pricePerMeter: number;
  calculationDimension: "width" | "height" | "longest_side";
};
type Preset = {
  id: string;
  name: string;
  technique: Method;
  pricing_mode: PricingMode;
  base_price: number;
  price_per_cm2: number;
  min_price: number;
  display_order: number;
  is_active: boolean;
  materials: MaterialDraft[];
};
type Area = { id: string; label: string; allowed_techniques: string[] };
type AreaConfig = Omit<Preset, "name" | "materials"> & {
  print_area_id: string;
  source_preset_id: string | null;
  areaLabel: string;
  materials: MaterialDraft[];
};

const emptyPreset = (order = 0): Omit<Preset, "id"> => ({
  name: "",
  technique: "",
  pricing_mode: "flat",
  base_price: 0,
  price_per_cm2: 0,
  min_price: 0,
  display_order: order,
  is_active: true,
  materials: [],
});

const money = (value: number) => Number(value || 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
export const validMoney = (value: number) => Number.isFinite(value) && value >= 0;
const errorMessage = (error: unknown, fallback: string) =>
  typeof error === "object" && error !== null && "message" in error ? String(error.message) : fallback;

// Upsert the replacement before removing obsolete rows: failed writes retain the saved materials.
export async function saveMaterials(table: string, parentKey: string, parentId: string, materials: MaterialDraft[]) {
  const { data: existing, error: readError } = await db.from(table).select("id,name").eq(parentKey, parentId);
  if (readError) throw readError;
  const priceKey = table === "customization_technique_preset_materials" ? "default_price_adjustment" : "price_adjustment";
  const ids = reconcileMaterialIds(materials, existing ?? []);
  const rows = materials.map((material, display_order) => {
    return {
      id: ids[display_order], [parentKey]: parentId, name: material.name.trim(),
      [priceKey]: material.price, pricing_mode: material.pricingMode,
      price_per_meter: material.pricePerMeter, calculation_dimension: material.calculationDimension,
      display_order, is_active: true,
    };
  });
  if (rows.length) {
    const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  const kept = new Set(rows.map((row) => row.id));
  const obsolete = (existing ?? []).filter((row) => !kept.has(row.id)).map((row) => row.id);
  if (obsolete.length) {
    const { error } = await db.from(table).delete().eq(parentKey, parentId).in("id", obsolete);
    if (error) throw error;
  }
}

export default function TechniquePricingManager({ productId }: { productId: string }) {
  const { methods: printMethods, labels: methodLabels } = usePrintMethods();
  const methodLabel = (value: string) => methodLabels[value] ?? value;
  const queryClient = useQueryClient();
  const [presetDraft, setPresetDraft] = useState<Omit<Preset, "id"> & { id?: string }>(emptyPreset());
  const [areaId, setAreaId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [configDraft, setConfigDraft] = useState<AreaConfig | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { ask, confirmSlot } = useInlineConfirm();
  const [presetSearch, setPresetSearch] = useState("");

  const { data: presets = [], isLoading: loadingPresets, error: presetsError } = useQuery({
    queryKey: ["customization-technique-presets"],
    queryFn: async (): Promise<Preset[]> => {
      const [{ data, error }, materialsResult] = await Promise.all([
        db.from("customization_technique_presets").select("*").order("display_order"),
        db.from("customization_technique_preset_materials").select("*").order("display_order"),
      ]);
      if (error) throw error;
      if (materialsResult.error) throw materialsResult.error;
      return (data ?? []).map((preset) => ({
        ...preset,
        base_price: Number(preset.base_price),
        price_per_cm2: Number(preset.price_per_cm2),
        min_price: Number(preset.min_price),
        materials: (materialsResult.data ?? [])
          .filter((material) => material.preset_id === preset.id)
          .map((material) => ({
            id: material.id,
            name: material.name,
            price: Number(material.default_price_adjustment),
            pricingMode: (material.pricing_mode ?? "fixed") as MaterialDraft["pricingMode"],
            pricePerMeter: Number(material.price_per_meter ?? 0),
            calculationDimension: (material.calculation_dimension ?? "height") as MaterialDraft["calculationDimension"],
          })),
      }));
    },
  });

  const { data: areas = [], error: areasError, isLoading: loadingAreas } = useQuery({
    queryKey: ["admin-product-areas", productId, "technique-selector"],
    queryFn: async (): Promise<Area[]> => {
      const { data, error } = await db.from("product_print_areas").select("id,label,allowed_techniques").eq("product_id", productId).order("display_order");
      if (error) throw error;
      return (data ?? []) as Area[];
    },
    enabled: !!productId,
  });

  const { data: areaConfigs = [], isLoading: loadingConfigs, error: configsError } = useQuery({
    queryKey: ["product-area-technique-pricing", productId, areas.map((area) => area.id).join(",")],
    enabled: areas.length > 0,
    queryFn: async (): Promise<AreaConfig[]> => {
      const ids = areas.map((area) => area.id);
      const { data, error } = await db.from("product_print_area_techniques").select("*").in("print_area_id", ids).order("display_order");
      if (error) throw error;
      const configIds = (data ?? []).map((config) => config.id);
      const materialsResult = configIds.length
        ? await db.from("product_print_area_technique_materials").select("*").in("area_technique_id", configIds).order("display_order")
        : { data: [], error: null };
      if (materialsResult.error) throw materialsResult.error;
      return (data ?? []).map((config) => ({
        ...config,
        base_price: Number(config.base_price),
        price_per_cm2: Number(config.price_per_cm2),
        min_price: Number(config.min_price),
        areaLabel: areas.find((area) => area.id === config.print_area_id)?.label ?? "Área",
        materials: (materialsResult.data ?? [])
          .filter((material) => material.area_technique_id === config.id)
          .map((material) => ({
            id: material.id,
            name: material.name,
            price: Number(material.price_adjustment),
            pricingMode: (material.pricing_mode ?? "fixed") as MaterialDraft["pricingMode"],
            pricePerMeter: Number(material.price_per_meter ?? 0),
            calculationDimension: (material.calculation_dimension ?? "height") as MaterialDraft["calculationDimension"],
          })),
      }));
    },
  });

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === presetId), [presetId, presets]);
  const filteredPresets = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
    const terms = normalize(presetSearch).trim().split(/\s+/).filter(Boolean);
    return presets.filter((preset) => {
      const text = normalize([preset.name, methodLabel(preset.technique), ...preset.materials.map((material) => material.name)].join(" "));
      return terms.every((term) => text.includes(term));
    });
  }, [presets, presetSearch]);
  const loadError = presetsError || configsError || areasError;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customization-technique-presets"] }),
      queryClient.invalidateQueries({ queryKey: ["area-technique-prices"] }),
      queryClient.invalidateQueries({ queryKey: ["product-area-technique-pricing", productId] }),
      queryClient.invalidateQueries({ queryKey: ["print-area-techniques", productId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] }),
    ]);
  };

  const validate = (draft: typeof presetDraft | AreaConfig) => {
    if ("name" in draft && !draft.name.trim()) return "Indique um nome para o preset.";
    if (!draft.technique) return "Escolha o método.";
    if (![draft.base_price, draft.price_per_cm2, draft.min_price].every(validMoney)) return "Todos os valores devem ser números iguais ou superiores a zero.";
    if (draft.pricing_mode === "per_cm2" && draft.price_per_cm2 <= 0) return "O preço por cm² deve ser maior que zero.";
    const names = draft.materials.map((material) => material.name.trim().toLocaleLowerCase("pt-PT"));
    if (draft.materials.some((material) => !material.name.trim() || !validMoney(material.price) || !validMoney(material.pricePerMeter))) return "Preencha o nome e um valor válido para cada material.";
    if (draft.materials.some((material) => material.pricingMode === "per_linear_meter" && material.pricePerMeter <= 0)) return "O preço por metro deve ser maior que zero.";
    if (new Set(names).size !== names.length) return "Não repita o mesmo material no preset.";
    return null;
  };

  const savePreset = async () => {
    if (saving) return;
    const validation = validate(presetDraft);
    if (validation) return toast.error(validation);
    setSaving(true);
    try {
      const payload = {
        name: presetDraft.name.trim(), technique: presetDraft.technique, pricing_mode: presetDraft.pricing_mode,
        base_price: presetDraft.base_price, price_per_cm2: presetDraft.price_per_cm2,
        min_price: presetDraft.min_price, display_order: presetDraft.display_order, is_active: presetDraft.is_active,
      };
      const query = presetDraft.id
        ? db.from("customization_technique_presets").update(payload).eq("id", presetDraft.id).select("id").single()
        : db.from("customization_technique_presets").insert(payload).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      // Keep the new ID on failure so retry updates this preset instead of creating duplicates.
      setPresetDraft((current) => ({ ...current, id: data.id }));
      await saveMaterials("customization_technique_preset_materials", "preset_id", data.id, presetDraft.materials);
      toast.success(presetDraft.id ? "Preset atualizado." : "Preset criado.");
      setPresetDraft(emptyPreset(presets.length + 1));
      await invalidate();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível guardar o preset."));
    } finally { setSaving(false); }
  };

  const deletePreset = async (preset: Preset) => {
    if (saving || !(await ask(`Eliminar o preset "${preset.name}"?`, { description: "Os produtos que já o usaram mantêm os valores copiados.", confirmLabel: "Eliminar" }))) return;
    setSaving(true);
    try {
      const { error } = await db.from("customization_technique_presets").delete().eq("id", preset.id);
      if (error) throw error;
      if (presetDraft.id === preset.id) setPresetDraft(emptyPreset(presets.length));
      if (presetId === preset.id) setPresetId("");
      toast.success("Preset eliminado. Os produtos existentes não foram alterados.");
      await invalidate();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível eliminar o preset. Tente novamente."));
    } finally { setSaving(false); }
  };

  const applyPreset = async () => {
    if (saving || loadError || loadingConfigs || loadingAreas) return;
    if (!areaId || !selectedPreset) return toast.error("Escolha uma área e um preset.");
    const validation = validate(selectedPreset);
    if (validation) return toast.error(validation);
    if (areaConfigs.some((config) => config.print_area_id === areaId && config.technique === selectedPreset.technique)
      && !(await ask("Substituir os valores e materiais deste método pelos do preset?", { tone: "warning", confirmLabel: "Substituir" }))) return;
    setSaving(true);
    try {
      const payload = {
        print_area_id: areaId, technique: selectedPreset.technique, source_preset_id: selectedPreset.id,
        pricing_mode: selectedPreset.pricing_mode, base_price: selectedPreset.base_price,
        price_per_cm2: selectedPreset.price_per_cm2, min_price: selectedPreset.min_price,
        display_order: Math.max(0, printMethods.findIndex((method) => method.key === selectedPreset.technique)), is_active: true,
      };
      const { data, error } = await db.from("product_print_area_techniques")
        .upsert(payload, { onConflict: "print_area_id,technique" }).select("id").single();
      if (error) throw error;
      await saveMaterials("product_print_area_technique_materials", "area_technique_id", data.id, selectedPreset.materials);
      const area = areas.find((entry) => entry.id === areaId);
      if (area && !area.allowed_techniques.includes(selectedPreset.technique)) {
        const { error: areaError } = await db.from("product_print_areas").update({ allowed_techniques: [...area.allowed_techniques, selectedPreset.technique] }).eq("id", area.id);
        if (areaError) throw areaError;
      }
      toast.success(`${selectedPreset.name} aplicado. Foi criada uma cópia independente para o produto.`);
      await invalidate();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível aplicar o preset."));
    } finally { setSaving(false); }
  };

  const saveAreaConfig = async () => {
    if (saving || !configDraft) return;
    const validation = validate(configDraft);
    if (validation) return toast.error(validation);
    setSaving(true);
    try {
      const { error } = await db.from("product_print_area_techniques").update({
        pricing_mode: configDraft.pricing_mode, base_price: configDraft.base_price,
        price_per_cm2: configDraft.price_per_cm2, min_price: configDraft.min_price,
        is_active: configDraft.is_active,
      }).eq("id", configDraft.id);
      if (error) throw error;
      await saveMaterials("product_print_area_technique_materials", "area_technique_id", configDraft.id, configDraft.materials);
      toast.success("Preço do produto atualizado sem alterar o preset original.");
      setConfigDraft(null);
      await invalidate();
    } catch (error: unknown) { toast.error(errorMessage(error, "Não foi possível guardar o preço.")); }
    finally { setSaving(false); }
  };

  const pricingFields = (draft: typeof presetDraft | AreaConfig, update: (patch: Partial<typeof presetDraft>) => void) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5"><Label>Regra</Label><Select value={draft.pricing_mode} onValueChange={(value: PricingMode) => update({ pricing_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">Valor fixo</SelectItem><SelectItem value="per_cm2">Por cm²</SelectItem></SelectContent></Select></div>
      {draft.pricing_mode === "flat" ? <div className="space-y-1.5"><Label>Valor da técnica (€)</Label><PriceInput label="Valor da técnica (€)" value={draft.base_price} onChange={(base_price) => update({ base_price })} disabled={saving} /></div> : <>
        <div className="space-y-1.5"><Label>Valor por cm² (€)</Label><PriceInput label="Valor por cm² (€)" precision={4} value={draft.price_per_cm2} onChange={(price_per_cm2) => update({ price_per_cm2 })} disabled={saving} /></div>
        <div className="space-y-1.5"><Label>Valor mínimo (€)</Label><PriceInput label="Valor mínimo (€)" value={draft.min_price} onChange={(min_price) => update({ min_price })} disabled={saving} /></div>
      </>}
    </div>
  );

  const preparePresetFromArea = () => {
    if (!configDraft) return;
    const validation = validate(configDraft);
    if (validation) return toast.error(validation);
    setPresetDraft({
      name: configDraft.areaLabel + " — " + methodLabel(configDraft.technique),
      technique: configDraft.technique,
      pricing_mode: configDraft.pricing_mode,
      base_price: configDraft.base_price,
      price_per_cm2: configDraft.price_per_cm2,
      min_price: configDraft.min_price,
      display_order: presets.length,
      is_active: true,
      materials: configDraft.materials.map(({ id, ...material }) => ({ ...material })),
    });
    setLibraryOpen(true);
    toast.info("Reveja o nome e os valores na biblioteca e clique em Guardar preset.");
  };

  const materialFields = (materials: MaterialDraft[], update: (materials: MaterialDraft[]) => void) => (
    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Materiais e acabamentos</p><p className="text-xs text-muted-foreground">Cobre um valor fixo ou o consumo linear convertido de centímetros para metros.</p></div><Button type="button" variant="outline" size="sm" onClick={() => update([...materials, { name: "", price: 0, pricingMode: "fixed", pricePerMeter: 0, calculationDimension: "height" }])}><Plus className="mr-1 h-3.5 w-3.5" />Material</Button></div>
      {materials.length === 0 ? <p className="py-2 text-xs text-muted-foreground">Adicione os materiais que o cliente poderá escolher.</p> : materials.map((material, index) => <div key={material.id ?? index} className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start"><div className="min-w-0 w-full flex-1 space-y-1.5"><Label>Nome</Label><Input aria-label={`Nome do material ${index + 1}`} placeholder="Ex.: Linha poliéster ou vinil premium" value={material.name} onChange={(event) => update(materials.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></div><div className="flex shrink-0 sm:mt-6"><Button type="button" variant="ghost" size="icon" disabled={saving || index === 0} aria-label={`Subir material ${material.name || index + 1}`} onClick={() => { const reordered = [...materials]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; update(reordered); }}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={saving || index === materials.length - 1} aria-label={`Descer material ${material.name || index + 1}`} onClick={() => { const reordered = [...materials]; [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]]; update(reordered); }}><ArrowDown className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={saving} className="shrink-0 text-destructive" aria-label={`Remover material ${material.name || index + 1}`} onClick={() => update(materials.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Cobrança</Label><Select value={material.pricingMode} onValueChange={(pricingMode: MaterialDraft["pricingMode"]) => update(materials.map((item, itemIndex) => itemIndex === index ? { ...item, pricingMode } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Valor fixo</SelectItem><SelectItem value="per_linear_meter">Por metro linear</SelectItem></SelectContent></Select></div>
          {material.pricingMode === "fixed" ? <div className="space-y-1.5"><Label>Valor fixo (€)</Label><PriceInput label={"Valor fixo do material " + (index + 1)} value={material.price} onChange={(price) => update(materials.map((item, itemIndex) => itemIndex === index ? { ...item, price } : item))} disabled={saving} /></div> : <>
            <div className="space-y-1.5"><Label>Valor por metro (€)</Label><PriceInput label={"Valor por metro do material " + (index + 1)} precision={4} value={material.pricePerMeter} onChange={(pricePerMeter) => update(materials.map((item, itemIndex) => itemIndex === index ? { ...item, pricePerMeter } : item))} disabled={saving} /></div>
            <div className="space-y-1.5"><Label>Medida usada</Label><Select value={material.calculationDimension} onValueChange={(calculationDimension: MaterialDraft["calculationDimension"]) => update(materials.map((item, itemIndex) => itemIndex === index ? { ...item, calculationDimension } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="height">Altura da arte</SelectItem><SelectItem value="width">Largura da arte</SelectItem><SelectItem value="longest_side">Maior lado</SelectItem></SelectContent></Select></div>
          </>}
        </div>
      </div>)}
    </div>
  );

  return <Card className="rounded-2xl border shadow-sm">
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-lg">Materiais de estampagem</CardTitle><p className="mt-1 text-sm text-muted-foreground">Escolha um preset e aplique-o à área pretendida. Cada produto mantém os seus próprios valores.</p></div><Button variant="outline" onClick={() => setLibraryOpen(true)}>Gerir presets</Button></CardHeader>
    <CardContent className="space-y-6">

      {configDraft && <div className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Reutilizar os valores e materiais de <strong>{configDraft.areaLabel} · {methodLabel(configDraft.technique)}</strong></p>
        <Button type="button" variant="outline" disabled={saving} onClick={preparePresetFromArea}><Bookmark className="mr-2 h-4 w-4" />Criar preset desta área</Button>
      </div>}
      {loadError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><p>Não foi possível carregar os valores guardados: {errorMessage(loadError, "Verifique a ligação e as permissões.")}</p><Button variant="outline" disabled={saving} onClick={() => void invalidate()}>Tentar novamente</Button></div>}
      <InlinePanel open={libraryOpen} onClose={() => { if (!saving) setLibraryOpen(false); }} title="Presets de materiais" description="Edite um preset, duplique-o para criar uma alternativa ou comece do zero. Alterar um preset não muda os produtos existentes.">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="search" aria-label="Pesquisar presets de materiais" placeholder="Nome, método ou material" value={presetSearch} onChange={(event) => setPresetSearch(event.target.value)} className="min-w-0 flex-1" />
            {presetSearch && <Button variant="ghost" onClick={() => setPresetSearch("")}>Limpar pesquisa</Button>}
            <Button variant="outline" disabled={saving} onClick={() => setPresetDraft(emptyPreset(presets.length))}>Novo preset do zero</Button>
          </div>
          <p role="status" className="text-xs text-muted-foreground">{filteredPresets.length} de {presets.length} presets</p>
        <div className="space-y-4 border-t p-4">
          {loadingPresets ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar presets…</p> : presetsError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar a biblioteca. Feche esta janela e clique em Tentar novamente.</p> : filteredPresets.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{presets.length ? "Nenhum preset corresponde à pesquisa." : "Ainda não existem presets. Crie o primeiro abaixo."}</p> : <div className="grid gap-2 md:grid-cols-2">{filteredPresets.map((preset) => <div key={preset.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{preset.name}</p><Badge>{methodLabel(preset.technique)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{preset.pricing_mode === "flat" ? money(preset.base_price) : `${preset.price_per_cm2.toFixed(4)} €/cm² · mín. ${money(preset.min_price)}`}{preset.materials.length ? ` · ${preset.materials.length} material(is)` : ""}</p></div><div className="flex"><Button disabled={saving} variant="outline" size="sm" onClick={() => setPresetDraft({ ...preset, id: undefined, name: preset.name + " (cópia)", display_order: presets.length, materials: preset.materials.map(({ id, ...material }) => ({ ...material })) })}>Duplicar</Button><Button disabled={saving} variant="ghost" size="icon" aria-label={`Editar ${preset.name}`} onClick={() => setPresetDraft({ ...preset, materials: preset.materials.map((material) => ({ ...material })) })}><Pencil className="h-4 w-4" /></Button><Button disabled={saving} variant="ghost" size="icon" className="text-destructive" aria-label={`Eliminar ${preset.name}`} onClick={() => deletePreset(preset)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div>}
          <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-4 rounded-xl border-l-4 border-l-primary bg-card p-4">
            <div className="flex items-center justify-between"><p className="font-semibold">{presetDraft.id ? "Editar preset" : "Novo preset"}</p>{presetDraft.id && <Button variant="ghost" size="sm" onClick={() => setPresetDraft(emptyPreset(presets.length))}>Cancelar edição</Button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Nome *</Label><Input aria-label="Nome do preset de materiais" value={presetDraft.name} onChange={(event) => setPresetDraft({ ...presetDraft, name: event.target.value })} placeholder="Ex.: Bordado padrão" /></div><div className="space-y-1.5"><Label>Método</Label><Select value={presetDraft.technique} onValueChange={(value: Method) => setPresetDraft({ ...presetDraft, technique: value })}><SelectTrigger><SelectValue placeholder="Escolher método" /></SelectTrigger><SelectContent>{printMethods.filter((method) => method.is_active || method.key === presetDraft.technique).map((method) => <SelectItem key={method.key} value={method.key}>{method.label}</SelectItem>)}</SelectContent></Select></div></div>
            {pricingFields(presetDraft, (patch) => setPresetDraft({ ...presetDraft, ...patch }))}
            {materialFields(presetDraft.materials, (materials) => setPresetDraft({ ...presetDraft, materials }))}
            <div className="flex justify-end"><Button onClick={savePreset} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar preset</Button></div>
          </fieldset>
        </div>
        </div>
      </InlinePanel>
      {confirmSlot}

      <div className="space-y-3 rounded-xl border p-4">
        <div><p className="font-semibold">Aplicar preset ao produto</p><p className="text-xs text-muted-foreground">Escolha a área. Reaplicar substitui somente o preço desse método e nunca altera os outros métodos.</p></div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"><div className="space-y-1.5"><Label>Área</Label><Select value={areaId} onValueChange={setAreaId}><SelectTrigger><SelectValue placeholder="Selecionar área" /></SelectTrigger><SelectContent>{areas.map((area) => <SelectItem key={area.id} value={area.id}>{area.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Preset</Label><Select value={presetId} onValueChange={setPresetId}><SelectTrigger><SelectValue placeholder="Selecionar preset" /></SelectTrigger><SelectContent>{presets.filter((preset) => preset.is_active).map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name} · {methodLabel(preset.technique)}</SelectItem>)}</SelectContent></Select></div><Button className="min-h-10" disabled={saving || loadingAreas || loadingConfigs || !!loadError || !areaId || !selectedPreset} onClick={applyPreset}><Settings2 className="mr-2 h-4 w-4" />Aplicar</Button></div>
      </div>

      <div className="space-y-3"><div><p className="font-semibold">Valores ativos neste produto</p><p className="text-xs text-muted-foreground">Cada área pode cobrar valores diferentes por método.</p></div>{loadingConfigs ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar valores…</p> : areaConfigs.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aplique um preset a uma área para começar.</p> : <div className="grid gap-2 md:grid-cols-2">{areaConfigs.map((config) => <div key={config.id} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{config.areaLabel}</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant="outline">{methodLabel(config.technique)}</Badge><span className="text-xs tabular-nums text-muted-foreground">{config.pricing_mode === "flat" ? money(config.base_price) : `${config.price_per_cm2.toFixed(4)} €/cm² · mín. ${money(config.min_price)}`}</span></div>{config.materials.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{config.materials.map((material) => material.pricingMode === "fixed" ? `${material.name} (+${money(material.price)})` : `${material.name} (${money(material.pricePerMeter)}/m)`).join(" · ")}</p>}</div><Button variant="outline" size="sm" onClick={() => setConfigDraft({ ...config, materials: config.materials.map((material) => ({ ...material })) })}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button></div>)}</div>}</div>

      {configDraft && <div className="space-y-4 rounded-xl border-l-4 border-l-primary bg-muted/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{configDraft.areaLabel} · {methodLabel(configDraft.technique)}</p><p className="text-xs text-muted-foreground">Alteração exclusiva deste produto.</p></div><label className="flex items-center gap-2 text-sm"><Switch checked={configDraft.is_active} onCheckedChange={(is_active) => setConfigDraft({ ...configDraft, is_active })} />Disponível</label></div>{pricingFields(configDraft, (patch) => setConfigDraft({ ...configDraft, ...patch }))}{materialFields(configDraft.materials, (materials) => setConfigDraft({ ...configDraft, materials }))}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfigDraft(null)}>Cancelar</Button><Button onClick={saveAreaConfig} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar valor</Button></div></div>}
    </CardContent>
  </Card>;
}

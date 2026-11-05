import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Palette,
  Box,
  Plus,
  Trash2,
  Pencil,
  Copy,
  ArrowUp,
  ArrowDown,
  Loader2,
  Upload,
  Info,
  Euro,
  Ruler,
  Move3d,
  CheckCircle2,
  Circle,
  Search,
  WandSparkles,
  Image as ImageIcon,
  Save,
} from "lucide-react";
import AreaPlacementEditor from "./AreaPlacementEditor";
import StorageImageUploader from "./StorageImageUploader";
import TechniquePricingManager from "./TechniquePricingManager";
import Product3DPreview, { type ModelKind } from "@/components/customizer/Product3DPreview";
import { PRODUCT_3D_PREVIEW_ENABLED } from "@/lib/product3DFeature";

interface Props {
  productId: string;
}

const TECHNIQUE_OPTIONS = [
  { value: "dtf", label: "DTF" },
  { value: "dtf_uv", label: "DTF UV" },
  { value: "sublimacao", label: "Sublimação" },
  { value: "serigrafia", label: "Serigrafia" },
  { value: "bordado", label: "Bordado" },
  { value: "gravacao_laser", label: "Gravação a laser" },
  { value: "vinil", label: "Vinil termocolante" },
];

type Model3D = {
  product_id: string;
  model_kind: string;
  base_color: string;
  original_model_url: string | null;
  optimized_model_url: string | null;
  fallback_image_url: string | null;
  original_file_size: number | null;
  optimized_file_size: number | null;
  compression_ratio: number | null;
  optimization_status: string;
  optimization_error: string | null;
  enabled: boolean;
  camera_preset: any;
  spots_mapping: any;
  model_url: string | null;
};

type Color = {
  id?: string;
  product_id: string;
  name: string;
  hex: string;
  is_default: boolean;
  display_order: number;
};

type Area = {
  id?: string;
  product_id: string;
  key: string;
  label: string;
  description: string | null;
  preview_image_url: string | null;
  observation_required: boolean;
  preview_enabled: boolean;
  is_active: boolean;
  required: boolean;
  display_order: number;

  area_width_cm: number;
  area_height_cm: number;
  max_width_cm: number;
  max_height_cm: number;

  pricing_mode: "flat" | "per_cm2";
  base_price: number;
  price_per_cm2: number | null;
  min_price: number;

  allowed_techniques: string[];
  default_technique: string | null;

  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  visual_area_width: number;
  visual_area_height: number;
  scale: number;
  min_scale: number;
  max_scale: number;
  drag_min_x: number;
  drag_max_x: number;
  drag_min_y: number;
  drag_max_y: number;
  keep_aspect_ratio_default: boolean;

  preview_anchor: any;
};

type ReusableConfiguration = {
  id: string;
  name: string;
  category: string;
  model_kind: string | null;
  area_count: number;
};

type TechniquePriceDraft = {
  id?: string;
  technique: string;
  pricing_mode: "flat" | "per_cm2";
  base_price: number;
  price_per_cm2: number;
  min_price: number;
  is_active: boolean;
};
const EMPTY_TECHNIQUE_PRICES: TechniquePriceDraft[] = [];

const DEFAULT_AREA: Omit<Area, "product_id"> = {
  key: "",
  label: "",
  description: "",
  preview_image_url: null,
  observation_required: false,
  preview_enabled: true,
  is_active: true,
  required: false,
  display_order: 0,
  area_width_cm: 30,
  area_height_cm: 40,
  max_width_cm: 30,
  max_height_cm: 40,
  pricing_mode: "flat",
  base_price: 0,
  price_per_cm2: 0.02,
  min_price: 0,
  allowed_techniques: ["dtf"],
  default_technique: "dtf",
  position_x: 0,
  position_y: 0,
  position_z: 0,
  rotation_x: 0,
  rotation_y: 0,
  rotation_z: 0,
  visual_area_width: 0.4,
  visual_area_height: 0.5,
  scale: 1,
  min_scale: 0.2,
  max_scale: 1,
  drag_min_x: -1,
  drag_max_x: 1,
  drag_min_y: -1,
  drag_max_y: 1,
  keep_aspect_ratio_default: true,
  preview_anchor: {},
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const fmtBytes = (n?: number | null) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

function AreaTechniquePriceEditor({ areaId, techniques }: { areaId: string; techniques: string[] }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, TechniquePriceDraft>>({});
  const [saving, setSaving] = useState(false);

  const { data: storedPrices = EMPTY_TECHNIQUE_PRICES, isLoading, error } = useQuery({
    queryKey: ["area-technique-prices", areaId],
    queryFn: async (): Promise<TechniquePriceDraft[]> => {
      const { data, error: queryError } = await db
        .from("product_print_area_techniques")
        .select("id,technique,pricing_mode,base_price,price_per_cm2,min_price,is_active")
        .eq("print_area_id", areaId)
        .order("display_order");
      if (queryError) throw queryError;
      return (data ?? []).map((entry) => ({
        ...entry,
        base_price: Number(entry.base_price) || 0,
        price_per_cm2: Number(entry.price_per_cm2) || 0,
        min_price: Number(entry.min_price) || 0,
      })) as TechniquePriceDraft[];
    },
    enabled: !!areaId,
  });

  useEffect(() => {
    if (isLoading || error) return;
    setDrafts((current) => {
      const next = { ...current };
      techniques.forEach((technique) => {
      const stored = storedPrices.find((entry) => entry.technique === technique);
      next[technique] = current[technique] ?? stored ?? {
        technique,
        pricing_mode: "flat",
        base_price: 0,
        price_per_cm2: 0,
        min_price: 0,
        is_active: false,
      };
    });
      return next;
    });
  }, [storedPrices, techniques, isLoading, error]);

  const updateDraft = (technique: string, patch: Partial<TechniquePriceDraft>) => {
    setDrafts((current) => ({
      ...current,
      [technique]: { ...current[technique], ...patch },
    }));
  };

  const savePrices = async () => {
    const values = techniques.map((technique) => drafts[technique]).filter(Boolean);
    const invalid = values.some((entry) =>
      [entry.base_price, entry.price_per_cm2, entry.min_price].some(
        (value) => !Number.isFinite(Number(value)) || Number(value) < 0,
      ) || (entry.pricing_mode === "per_cm2" && Number(entry.price_per_cm2) <= 0),
    );
    if (invalid) {
      return toast.error("Preencha valores válidos. O preço por cm² deve ser maior que zero quando selecionado.");
    }

    setSaving(true);
    try {
      const payload = values.map((entry, index) => ({
        print_area_id: areaId,
        technique: entry.technique,
        pricing_mode: entry.pricing_mode,
        base_price: Number(entry.base_price) || 0,
        price_per_cm2: Number(entry.price_per_cm2) || 0,
        min_price: Number(entry.min_price) || 0,
        display_order: index,
        is_active: entry.is_active,
      }));
      if (payload.length) {
        const { error: upsertError } = await db
          .from("product_print_area_techniques")
          .upsert(payload, { onConflict: "print_area_id,technique" });
        if (upsertError) throw upsertError;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["area-technique-prices", areaId] }),
        queryClient.invalidateQueries({ queryKey: ["product-area-technique-pricing"] }),
        queryClient.invalidateQueries({ queryKey: ["print-area-techniques"] }),
      ]);
      toast.success("Preços por método guardados.");
    } catch (saveError: unknown) {
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível guardar os preços por método.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar preços por método…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        A tabela de preços por método ainda não está disponível. Execute a migration <strong>20260920183000_customization_technique_pricing.sql</strong> no Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
      <div>
        <p className="font-semibold">Preço por método de estampagem</p>
        <p className="text-xs text-muted-foreground">Quando configurado e ativo, substitui o preço geral da área para este método.</p>
      </div>
      <div className="space-y-3">
        {techniques.map((technique) => {
          const draft = drafts[technique];
          if (!draft) return null;
          const label = TECHNIQUE_OPTIONS.find((option) => option.value === technique)?.label ?? technique;
          return (
            <div key={technique} className="space-y-3 rounded-xl border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{label}</Badge>
                  <span className="text-xs text-muted-foreground">Valor exclusivo desta área</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={draft.is_active} onCheckedChange={(is_active) => updateDraft(technique, { is_active })} />
                  Disponível
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Regra</Label>
                  <Select value={draft.pricing_mode} onValueChange={(pricing_mode: "flat" | "per_cm2") => updateDraft(technique, { pricing_mode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Valor fixo</SelectItem>
                      <SelectItem value="per_cm2">Por cm²</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.pricing_mode === "flat" ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Valor do método (€)</Label>
                    <Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.base_price} onChange={(event) => updateDraft(technique, { base_price: Number(event.target.value) })} />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Valor por cm² (€)</Label>
                      <Input type="number" min="0" step="0.0001" inputMode="decimal" value={draft.price_per_cm2} onChange={(event) => updateDraft(technique, { price_per_cm2: Number(event.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor mínimo (€)</Label>
                      <Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.min_price} onChange={(event) => updateDraft(technique, { min_price: Number(event.target.value) })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button type="button" className="w-full sm:w-auto" onClick={savePrices} disabled={saving || techniques.length === 0}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Guardar preços por método
      </Button>
    </div>
  );
}

export default function ProductCustomizationManager({ productId }: Props) {
  const queryClient = useQueryClient();

  const copyAreaTechniquePricing = async (sourceAreaId: string, targetAreaId: string) => {
    const { data: sourceConfigs, error } = await db
      .from("product_print_area_techniques")
      .select("*")
      .eq("print_area_id", sourceAreaId)
      .order("display_order");
    if (error) {
      // A loja continua compatível enquanto a migration manual ainda não foi aplicada.
      if (error.code === "42P01" || error.code === "PGRST205") return;
      throw error;
    }
    const sourceIds = (sourceConfigs ?? []).map((entry) => entry.id);
    const materialsResult = sourceIds.length
      ? await db.from("product_print_area_technique_materials").select("*").in("area_technique_id", sourceIds).order("display_order")
      : { data: [], error: null };
    if (materialsResult.error) throw materialsResult.error;
    const { error: deleteError } = await db.from("product_print_area_techniques").delete().eq("print_area_id", targetAreaId);
    if (deleteError) throw deleteError;
    for (const sourceConfig of sourceConfigs ?? []) {
      const sourceConfigId = sourceConfig.id;
      const { data: inserted, error: insertError } = await db
        .from("product_print_area_techniques")
        .insert({
          print_area_id: targetAreaId,
          technique: sourceConfig.technique,
          source_preset_id: sourceConfig.source_preset_id,
          pricing_mode: sourceConfig.pricing_mode,
          base_price: sourceConfig.base_price,
          price_per_cm2: sourceConfig.price_per_cm2,
          min_price: sourceConfig.min_price,
          display_order: sourceConfig.display_order,
          is_active: sourceConfig.is_active,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      const materials = (materialsResult.data ?? []).filter((entry) => entry.area_technique_id === sourceConfigId);
      if (materials.length) {
        const { error: materialError } = await db.from("product_print_area_technique_materials").insert(
          materials.map((material) => ({
            area_technique_id: inserted.id,
            name: material.name,
            price_adjustment: material.price_adjustment,
            pricing_mode: material.pricing_mode,
            price_per_meter: material.price_per_meter,
            calculation_dimension: material.calculation_dimension,
            display_order: material.display_order,
            is_active: material.is_active,
          })),
        );
        if (materialError) throw materialError;
      }
    }
  };

  // ── Model 3D ─────────────────────────────────────────────────────────
  const { data: model, isLoading: loadingModel } = useQuery({
    queryKey: ["admin-product-3d-model", productId],
    queryFn: async () => {
      const { data, error } = await db
        .from("product_3d_models")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();
      if (error) throw error;
      return data as Model3D | null;
    },
    enabled: !!productId,
  });

  const [modelForm, setModelForm] = useState<Model3D | null>(null);
  useEffect(() => {
    if (model) {
      setModelForm(model);
    } else {
      setModelForm({
        product_id: productId,
        model_kind: "box",
        base_color: "#0F172A",
        original_model_url: null,
        optimized_model_url: null,
        fallback_image_url: null,
        original_file_size: null,
        optimized_file_size: null,
        compression_ratio: null,
        optimization_status: "pending",
        optimization_error: null,
        enabled: true,
        camera_preset: {},
        spots_mapping: {},
        model_url: null,
      });
    }
  }, [model, productId]);

  const { data: reusableConfigurations = [], isLoading: loadingConfigurations } = useQuery({
    queryKey: ["admin-reusable-3d-configurations", productId],
    enabled: !!productId,
    queryFn: async (): Promise<ReusableConfiguration[]> => {
      const [productsResult, modelsResult, areasResult] = await Promise.all([
        db
          .from("products")
          .select("id, name, category")
          .eq("customizable", true)
          .neq("id", productId)
          .order("name"),
        db.from("product_3d_models").select("product_id, model_kind"),
        db.from("product_print_areas").select("product_id"),
      ]);
      const error = productsResult.error || modelsResult.error || areasResult.error;
      if (error) throw error;

      const modelByProduct = new Map(
        (modelsResult.data ?? []).map((entry) => [entry.product_id, entry.model_kind]),
      );
      const areaCountByProduct = new Map<string, number>();
      (areasResult.data ?? []).forEach((entry) => {
        areaCountByProduct.set(entry.product_id, (areaCountByProduct.get(entry.product_id) ?? 0) + 1);
      });

      return (productsResult.data ?? [])
        .filter((entry) => modelByProduct.has(entry.id) || areaCountByProduct.has(entry.id))
        .map((entry) => ({
          ...entry,
          model_kind: modelByProduct.get(entry.id) ?? null,
          area_count: areaCountByProduct.get(entry.id) ?? 0,
        }));
    },
  });

  const [configurationSearch, setConfigurationSearch] = useState("");
  const [sourceProductId, setSourceProductId] = useState("");
  const [replaceConfiguration, setReplaceConfiguration] = useState(false);
  const [copyingConfiguration, setCopyingConfiguration] = useState(false);

  const filteredConfigurations = useMemo(() => {
    const term = configurationSearch.trim().toLocaleLowerCase("pt-PT");
    if (!term) return reusableConfigurations;
    return reusableConfigurations.filter((entry) =>
      [entry.name, entry.category, entry.model_kind]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-PT").includes(term)),
    );
  }, [configurationSearch, reusableConfigurations]);

  const saveModel = async () => {
    if (!modelForm) return;
    const payload: any = { ...modelForm, product_id: productId };
    const { error } = await db
      .from("product_3d_models")
      .upsert(payload, { onConflict: "product_id" });
    if (error) return toast.error("Erro a guardar modelo 3D: " + error.message);
    toast.success("Modelo 3D guardado");
    queryClient.invalidateQueries({ queryKey: ["admin-product-3d-model", productId] });
  };

  const copyConfiguration = async () => {
    if (!sourceProductId) {
      toast.error("Escolha o produto cuja configuração pretende copiar.");
      return;
    }
    const source = reusableConfigurations.find((entry) => entry.id === sourceProductId);
    if (!source) {
      toast.error("A configuração escolhida já não está disponível.");
      return;
    }
    if (
      replaceConfiguration &&
      !confirm(`Substituir a configuração atual pela configuração de “${source.name}”? As áreas que não existirem na origem serão removidas deste produto.`)
    ) return;

    setCopyingConfiguration(true);
    try {
      const [sourceModelResult, sourceAreasResult] = await Promise.all([
        db
          .from("product_3d_models")
          .select("*")
          .eq("product_id", sourceProductId)
          .maybeSingle(),
        db
          .from("product_print_areas")
          .select("*")
          .eq("product_id", sourceProductId)
          .order("display_order"),
      ]);
      if (sourceModelResult.error) throw sourceModelResult.error;
      if (sourceAreasResult.error) throw sourceAreasResult.error;

      const sourceModel = sourceModelResult.data as Model3D | null;
      const sourceAreas = (sourceAreasResult.data ?? []) as Area[];
      if (!sourceModel && sourceAreas.length === 0) {
        throw new Error("O produto escolhido não possui modelo nem áreas para copiar.");
      }

      if (sourceModel && (replaceConfiguration || !model)) {
        const modelPayload: Model3D = {
          product_id: productId,
          model_kind: sourceModel.model_kind,
          base_color: sourceModel.base_color,
          original_model_url: sourceModel.original_model_url,
          optimized_model_url: sourceModel.optimized_model_url,
          fallback_image_url: sourceModel.fallback_image_url,
          original_file_size: sourceModel.original_file_size,
          optimized_file_size: sourceModel.optimized_file_size,
          compression_ratio: sourceModel.compression_ratio,
          optimization_status: sourceModel.optimization_status,
          optimization_error: sourceModel.optimization_error,
          enabled: sourceModel.enabled,
          camera_preset: sourceModel.camera_preset ?? {},
          spots_mapping: sourceModel.spots_mapping ?? {},
          model_url: sourceModel.model_url,
        };
        const { error } = await db
          .from("product_3d_models")
          .upsert(modelPayload as any, { onConflict: "product_id" });
        if (error) throw error;
      }

      const existingKeys = new Set(areas.map((entry) => entry.key));
      const areasToCopy = replaceConfiguration
        ? sourceAreas
        : sourceAreas.filter((entry) => !existingKeys.has(entry.key));
      const areaPayloads = areasToCopy.map((entry) => {
        const payload = { ...entry } as Record<string, unknown>;
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        payload.product_id = productId;
        return payload;
      });

      if (areaPayloads.length > 0) {
        const query = replaceConfiguration
          ? db.from("product_print_areas").upsert(areaPayloads as any, { onConflict: "product_id,key" })
          : db.from("product_print_areas").insert(areaPayloads as any);
        const { error } = await query;
        if (error) throw error;
      }

      if (replaceConfiguration) {
        const sourceKeys = new Set(sourceAreas.map((entry) => entry.key));
        const obsoleteIds = areas
          .filter((entry) => entry.id && !sourceKeys.has(entry.key))
          .map((entry) => entry.id!);
        if (obsoleteIds.length > 0) {
          const { error } = await db.from("product_print_areas").delete().in("id", obsoleteIds);
          if (error) throw error;
        }
      }

      if (areasToCopy.length > 0) {
        const { data: targetAreas, error: targetAreasError } = await db
          .from("product_print_areas")
          .select("id,key")
          .eq("product_id", productId)
          .in("key", areasToCopy.map((entry) => entry.key));
        if (targetAreasError) throw targetAreasError;
        for (const sourceArea of areasToCopy) {
          const targetArea = (targetAreas ?? []).find((entry) => entry.key === sourceArea.key);
          if (sourceArea.id && targetArea?.id) await copyAreaTechniquePricing(sourceArea.id, targetArea.id);
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-product-3d-model", productId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] }),
        queryClient.invalidateQueries({ queryKey: ["product-3d", productId] }),
        queryClient.invalidateQueries({ queryKey: ["print-areas", productId] }),
      ]);
      toast.success(
        replaceConfiguration
          ? `Configuração copiada de “${source.name}”.`
          : `${areaPayloads.length} área(s) nova(s) copiada(s) de “${source.name}”.`,
      );
      setSourceProductId("");
    } catch (error: any) {
      toast.error("Não foi possível copiar a configuração: " + (error.message || error));
    } finally {
      setCopyingConfiguration(false);
    }
  };

  const [uploading, setUploading] = useState(false);

  const uploadModelFile = async (file: File) => {
    if (!modelForm) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      toast.error("Use um ficheiro GLB. GLTF e OBJ podem depender de ficheiros externos e não são aceites neste fluxo.");
      return;
    }
    if (file.size > 20 * 1024 * 1024 || file.size < 20) {
      toast.error("O ficheiro GLB deve ter até 20 MB.");
      return;
    }
    const header = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
    if (header !== "glTF") {
      toast.error("O ficheiro não é um GLB válido.");
      return;
    }
    setUploading(true);
    try {
      const path = `${productId}/${Date.now()}.glb`;
      const { error: upErr } = await supabase.storage
        .from("product-3d-models")
        .upload(path, file, { upsert: false, contentType: "model/gltf-binary" });
      if (upErr) throw upErr;
      const { data: publicFile } = supabase.storage.from("product-3d-models").getPublicUrl(path);
      setModelForm({
        ...modelForm,
        model_url: publicFile.publicUrl,
        original_model_url: publicFile.publicUrl,
        optimized_model_url: null,
        original_file_size: file.size,
        optimized_file_size: null,
        compression_ratio: null,
        optimization_status: "ready",
        optimization_error: null,
      });
      toast.success("GLB carregado. Guarde a configuração para o aplicar ao produto.");
    } catch (e: any) {
      toast.error("Erro no upload: " + (e.message || e));
    } finally {
      setUploading(false);
    }
  };

  // ── Colors ───────────────────────────────────────────────────────────
  const { data: colors = [] } = useQuery({
    queryKey: ["admin-product-colors", productId],
    queryFn: async () => {
      const { data, error } = await db
        .from("product_colors")
        .select("*")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return data as Color[];
    },
    enabled: !!productId,
  });

  const [colorDraft, setColorDraft] = useState<Partial<Color>>({ name: "", hex: "#000000", is_default: false });

  const addColor = async () => {
    if (!colorDraft.name?.trim() || !colorDraft.hex) {
      toast.error("Nome e hex são obrigatórios");
      return;
    }
    const { error } = await db.from("product_colors").insert({
      product_id: productId,
      name: colorDraft.name.trim(),
      hex: colorDraft.hex,
      is_default: !!colorDraft.is_default,
      display_order: colors.length,
    });
    if (error) return toast.error(error.message);
    setColorDraft({ name: "", hex: "#000000", is_default: false });
    queryClient.invalidateQueries({ queryKey: ["admin-product-colors", productId] });
  };

  const removeColor = async (id: string) => {
    const { error } = await db.from("product_colors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-product-colors", productId] });
  };

  const setDefaultColor = async (id: string) => {
    // Clear all defaults, set one
    await db.from("product_colors").update({ is_default: false }).eq("product_id", productId);
    const { error } = await db.from("product_colors").update({ is_default: true }).eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-product-colors", productId] });
  };

  // ── Areas ────────────────────────────────────────────────────────────
  const { data: areas = [], isLoading: loadingAreas } = useQuery({
    queryKey: ["admin-product-areas", productId],
    queryFn: async () => {
      const { data, error } = await db
        .from("product_print_areas")
        .select("*")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as Area[];
    },
    enabled: !!productId,
  });

  const [areaOpen, setAreaOpen] = useState(false);
  const [areaEditing, setAreaEditing] = useState<Area | null>(null);

  const openNewArea = () => {
    setAreaEditing({
      ...DEFAULT_AREA,
      product_id: productId,
      display_order: areas.length,
    });
    setAreaOpen(true);
  };

  const openEditArea = (a: Area) => {
    setAreaEditing({ ...a });
    setAreaOpen(true);
  };

  const duplicateArea = async (a: Area) => {
    const copy: any = { ...a };
    delete copy.id;
    copy.label = a.label + " (cópia)";
    copy.key = slugify(copy.label);
    copy.display_order = areas.length;
    const { data: duplicated, error } = await db.from("product_print_areas").insert(copy).select("id").single();
    if (error) return toast.error(error.message);
    if (a.id && duplicated?.id) {
      try {
        await copyAreaTechniquePricing(a.id, duplicated.id);
      } catch (copyError: unknown) {
        toast.error(`A área foi duplicada, mas os preços por técnica não: ${copyError instanceof Error ? copyError.message : "erro desconhecido"}`);
      }
    }
    toast.success("Área duplicada");
    queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] });
  };

  const removeArea = async (id: string) => {
    if (!confirm("Remover esta área de personalização?")) return;
    const { error } = await db.from("product_print_areas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] });
  };

  const toggleActive = async (a: Area) => {
    const { error } = await db
      .from("product_print_areas")
      .update({ is_active: !a.is_active })
      .eq("id", a.id!);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] });
  };

  const moveArea = async (a: Area, dir: -1 | 1) => {
    const idx = areas.findIndex((x) => x.id === a.id);
    const swap = areas[idx + dir];
    if (!swap) return;
    await db.from("product_print_areas").update({ display_order: swap.display_order }).eq("id", a.id!);
    await db.from("product_print_areas").update({ display_order: a.display_order }).eq("id", swap.id!);
    queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] });
  };

  const saveArea = async () => {
    if (!areaEditing) return;
    const numericValues = {
      area_width_cm: Number(areaEditing.area_width_cm),
      area_height_cm: Number(areaEditing.area_height_cm),
      max_width_cm: Number(areaEditing.max_width_cm),
      max_height_cm: Number(areaEditing.max_height_cm),
      base_price: Number(areaEditing.base_price ?? 0),
      price_per_cm2: Number(areaEditing.price_per_cm2 ?? 0),
      min_price: Number(areaEditing.min_price ?? 0),
    };
    // Validation
    if (!areaEditing.label.trim()) return toast.error("Nome é obrigatório");
    if (!Number.isFinite(numericValues.area_width_cm) || !Number.isFinite(numericValues.area_height_cm) || numericValues.area_width_cm <= 0 || numericValues.area_height_cm <= 0)
      return toast.error("Largura e altura da área devem ser maiores que 0");
    if (!Number.isFinite(numericValues.max_width_cm) || !Number.isFinite(numericValues.max_height_cm) || numericValues.max_width_cm <= 0 || numericValues.max_height_cm <= 0)
      return toast.error("Largura e altura máximas da arte devem ser maiores que 0");
    if (!areaEditing.allowed_techniques.length) return toast.error("Selecione ao menos uma técnica");
    if (![numericValues.base_price, numericValues.min_price, numericValues.price_per_cm2].every((value) => Number.isFinite(value) && value >= 0))
      return toast.error("Os valores adicionais devem ser números iguais ou superiores a zero.");
    if (areaEditing.pricing_mode === "per_cm2" && numericValues.price_per_cm2 <= 0)
      return toast.error("Preço por cm² deve ser maior que 0");

    const payload: any = {
      ...areaEditing,
      ...numericValues,
      key: areaEditing.key || slugify(areaEditing.label),
      description: areaEditing.description || null,
      preview_image_url: areaEditing.preview_image_url?.trim() || null,
      default_technique: areaEditing.default_technique || areaEditing.allowed_techniques[0],
    };
    if (payload.id) {
      const { id, ...rest } = payload;
      const { error } = await db.from("product_print_areas").update(rest).eq("id", id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await db.from("product_print_areas").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Área guardada");
    setAreaOpen(false);
    setAreaEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-product-areas", productId] });
  };

  const priceLabel = (a: Area) =>
    a.pricing_mode === "per_cm2"
      ? `${(Number(a.price_per_cm2) || 0).toFixed(3)} €/cm²${Number(a.min_price) ? ` (mín. ${(Number(a.min_price) || 0).toFixed(2)} €)` : ""}`
      : `${(Number(a.base_price) || 0).toFixed(2)} €`;

  const activeAreas = areas.filter((entry) => entry.is_active);
  const areasWithImages = activeAreas.filter((entry) => !!entry.preview_image_url);
  const areasWithPlacement = activeAreas.filter((entry) =>
    [entry.position_x, entry.position_y, entry.position_z, entry.rotation_x, entry.rotation_y, entry.rotation_z]
      .some((value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.0001),
  );
  const readinessChecks = [
    {
      ready: !!model,
      label: "Modelo guardado",
      detail: model ? `Tipo: ${model.model_kind}` : "Escolha o tipo e guarde a configuração.",
    },
    {
      ready: activeAreas.length > 0,
      label: "Áreas disponíveis",
      detail: `${activeAreas.length} área(s) ativa(s).`,
    },
    {
      ready: activeAreas.length > 0 && areasWithImages.length === activeAreas.length,
      label: "Imagens das áreas",
      detail: `${areasWithImages.length} de ${activeAreas.length} área(s) com fotografia.`,
    },
    {
      ready: activeAreas.length > 0 && areasWithPlacement.length === activeAreas.length,
      label: "Posições revistas",
      detail: `${areasWithPlacement.length} de ${activeAreas.length} área(s) posicionada(s) manualmente.`,
    },
  ];
  const visibleReadinessChecks = PRODUCT_3D_PREVIEW_ENABLED
    ? readinessChecks
    : readinessChecks.filter((entry) => entry.label !== "Modelo guardado" && entry.label !== "Posições revistas");
  const readyCount = visibleReadinessChecks.filter((entry) => entry.ready).length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-b bg-primary px-5 py-4 text-primary-foreground sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/75">Configuração rápida</p>
              <h2 className="mt-1 text-xl font-semibold">Preparar áreas de personalização</h2>
              <p className="mt-1 max-w-2xl text-sm text-primary-foreground/80">
                Reutilize um produto já configurado ou complete os passos abaixo. A cópia cria uma configuração independente para este produto.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit bg-white text-primary hover:bg-white">
              {readyCount}/{visibleReadinessChecks.length} passos prontos
            </Badge>
          </div>
        </div>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleReadinessChecks.map((entry) => (
              <div key={entry.label} className="flex gap-3 rounded-xl border bg-card p-3">
                {entry.ready
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{entry.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-3">
              <div>
                <Label htmlFor="configuration-search">Copiar de um produto configurado</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Áreas, imagens, preços e observações são copiados. Alterações posteriores ficam separadas. Configurações 3D antigas são preservadas, mas não são exibidas na loja.
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="configuration-search"
                  value={configurationSearch}
                  onChange={(event) => setConfigurationSearch(event.target.value)}
                  placeholder="Pesquisar por produto, categoria ou tipo"
                  className="pl-9"
                />
              </div>
              <Select value={sourceProductId} onValueChange={setSourceProductId} disabled={loadingConfigurations}>
                <SelectTrigger aria-label="Produto de origem da configuração">
                  <SelectValue placeholder={loadingConfigurations ? "A carregar configurações…" : "Selecionar produto configurado"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredConfigurations.length === 0 ? (
                    <div className="px-3 py-5 text-center text-sm text-muted-foreground">Nenhuma configuração encontrada.</div>
                  ) : filteredConfigurations.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name} · {entry.model_kind ?? "sem modelo"} · {entry.area_count} área(s)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                <Checkbox
                  checked={replaceConfiguration}
                  onCheckedChange={(value) => setReplaceConfiguration(!!value)}
                  aria-describedby="replace-configuration-help"
                />
                <span>
                  <span className="font-medium">Substituir configuração atual</span>
                  <span id="replace-configuration-help" className="mt-0.5 block text-xs text-muted-foreground">
                    Desligado: copia apenas áreas ausentes e mantém o modelo atual. Ligado: atualiza o modelo e remove áreas que não existam na origem, após confirmação.
                  </span>
                </span>
              </label>
            </div>
            <Button
              type="button"
              onClick={copyConfiguration}
              disabled={!sourceProductId || copyingConfiguration}
              className="min-h-11 w-full gap-2 lg:w-auto"
            >
              {copyingConfiguration
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <WandSparkles className="h-4 w-4" />}
              Copiar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bloco A — Modelo 3D */}
      {PRODUCT_3D_PREVIEW_ENABLED && <Card className="rounded-2xl border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Box className="h-5 w-5 text-primary" />
            Modelo 3D do produto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingModel ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar…
            </div>
          ) : modelForm ? (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div>
                  <p className="font-medium">Modelo 3D carregado ativo</p>
                  <p className="text-sm text-muted-foreground">Quando desligado, utiliza o modelo simples do tipo escolhido. A personalização continua controlada no produto.</p>
                </div>
                <Switch
                  checked={modelForm.enabled}
                  onCheckedChange={(v) => setModelForm({ ...modelForm, enabled: v })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de modelo</Label>
                  <Select
                    value={modelForm.model_kind}
                    onValueChange={(v) => setModelForm({ ...modelForm, model_kind: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tshirt">T-shirt</SelectItem>
                      <SelectItem value="mug">Caneca</SelectItem>
                      <SelectItem value="tote">Saco</SelectItem>
                      <SelectItem value="backpack">Mochila</SelectItem>
                      <SelectItem value="sticker">Autocolante</SelectItem>
                      <SelectItem value="box">Caixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cor base do modelo</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={modelForm.base_color}
                      onChange={(e) => setModelForm({ ...modelForm, base_color: e.target.value })}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={modelForm.base_color}
                      onChange={(e) => setModelForm({ ...modelForm, base_color: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Modelo próprio opcional (GLB, máx. 20 MB)
                </Label>
                <Input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadModelFile(f);
                  }}
                />
                {uploading && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> A carregar…
                  </div>
                )}
                {modelForm.model_url && (
                  <div className="text-sm p-3 rounded bg-muted/40 space-y-1">
                    <p>Modelo carregado: {fmtBytes(modelForm.original_file_size)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      O ficheiro GLB é publicado pelo Storage. Para uma abertura rápida, recomendamos menos de 2 MB.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setModelForm({ ...modelForm, model_url: null, original_model_url: null, optimized_model_url: null })}>
                      Usar modelo simples
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Imagem alternativa (fallback quando o 3D falha)</Label>
                <Input
                  placeholder="URL da imagem"
                  value={modelForm.fallback_image_url ?? ""}
                  onChange={(e) => setModelForm({ ...modelForm, fallback_image_url: e.target.value || null })}
                />
              </div>

              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                <div>
                  <p className="font-semibold">Pré-visualização do modelo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirme o tipo, a cor e o ficheiro antes de guardar. As áreas são posicionadas individualmente na secção abaixo.
                  </p>
                </div>
                <Product3DPreview
                  modelKind={modelForm.model_kind as ModelKind}
                  baseColor={modelForm.base_color}
                  modelUrl={modelForm.enabled ? (modelForm.model_url || modelForm.optimized_model_url || modelForm.original_model_url) : null}
                  fallbackImageUrl={modelForm.fallback_image_url}
                  className="mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-xl border bg-white"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={saveModel} className="gap-2">
                  Guardar configuração 3D
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>}

      {/* Bloco B — Cores */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-primary" />
            Cores disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card"
              >
                <span
                  className="w-6 h-6 rounded-full border shadow-sm"
                  style={{ background: c.hex }}
                />
                <div className="text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.hex}</p>
                </div>
                {c.is_default ? (
                  <Badge variant="secondary" className="text-xs">Padrão</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDefaultColor(c.id!)}
                  >
                    Definir padrão
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeColor(c.id!)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-[1fr,120px,auto,auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                placeholder="Preto"
                value={colorDraft.name ?? ""}
                onChange={(e) => setColorDraft({ ...colorDraft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hex</Label>
              <div className="flex gap-1">
                <Input
                  type="color"
                  value={colorDraft.hex ?? "#000000"}
                  onChange={(e) => setColorDraft({ ...colorDraft, hex: e.target.value })}
                  className="w-14 p-1"
                />
                <Input
                  value={colorDraft.hex ?? ""}
                  onChange={(e) => setColorDraft({ ...colorDraft, hex: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox
                checked={!!colorDraft.is_default}
                onCheckedChange={(v) => setColorDraft({ ...colorDraft, is_default: !!v })}
              />
              Padrão
            </label>
            <Button onClick={addColor} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bloco C — Áreas de personalização */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">1</span>
              Áreas de personalização
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Defina onde o cliente pode aplicar uma arte. Cada cartão reúne imagem, medidas, preço e estado.</p>
          </div>
          <Button onClick={openNewArea} className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Adicionar área
          </Button>
        </CardHeader>
        <CardContent>
          {loadingAreas ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : areas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Ainda não existem áreas configuradas. Clique em "Adicionar área" para começar.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {areas.map((a, idx) => (
                <div key={a.id} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                      {a.preview_image_url
                        ? <img src={a.preview_image_url} alt={`Pré-visualização: ${a.label}`} className="h-full w-full object-cover" loading="lazy" />
                        : <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold break-words">{a.label}</p>
                        <Badge variant={a.is_active ? "secondary" : "outline"}>{a.is_active ? "Ativa" : "Inativa"}</Badge>
                        {a.required && <Badge>Obrigatória</Badge>}
                      </div>
                      {a.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                      <p className="mt-2 text-sm font-semibold text-primary">Adicional: {priceLabel(a)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-y py-3 text-xs">
                    <div><span className="block text-muted-foreground">Área disponível</span><strong className="tabular-nums">{a.area_width_cm} × {a.area_height_cm} cm</strong></div>
                    <div><span className="block text-muted-foreground">Limite da arte</span><strong className="tabular-nums">{a.max_width_cm} × {a.max_height_cm} cm</strong></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {a.allowed_techniques.map((technique) => <Badge key={technique} variant="outline">{TECHNIQUE_OPTIONS.find((item) => item.value === technique)?.label ?? technique}</Badge>)}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} /> Disponível</label>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="icon" className="h-10 w-10" aria-label={`Subir ${a.label}`} disabled={idx === 0} onClick={() => moveArea(a, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-10 w-10" aria-label={`Descer ${a.label}`} disabled={idx === areas.length - 1} onClick={() => moveArea(a, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-10 w-10" aria-label={`Duplicar ${a.label}`} onClick={() => duplicateArea(a)}><Copy className="h-4 w-4" /></Button>
                      <Button variant="outline" className="h-10 gap-2" aria-label={`Editar ${a.label}`} onClick={() => openEditArea(a)}><Pencil className="h-4 w-4" />Editar</Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 text-destructive" aria-label={`Remover ${a.label}`} onClick={() => removeArea(a.id!)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">2</span>
          <div><p className="font-semibold">Métodos, materiais e valores</p><p className="text-xs text-muted-foreground">Associe as regras apenas depois de criar as áreas.</p></div>
        </div>
        <TechniquePricingManager productId={productId} />
      </div>

      {/* Area editor dialog */}
      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {areaEditing?.id ? "Editar área" : "Nova área de personalização"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Complete os três passos. A imagem e as medidas serão mostradas ao cliente na página do produto.</p>
          </DialogHeader>

          {areaEditing && (
            <Tabs defaultValue="data" className="w-full">
              <TabsList className={PRODUCT_3D_PREVIEW_ENABLED ? "grid h-auto w-full grid-cols-2 sm:grid-cols-4" : "grid h-auto w-full grid-cols-3"}>
                <TabsTrigger value="data">1. Área</TabsTrigger>
                <TabsTrigger value="dims"><Ruler className="h-3.5 w-3.5 mr-1" /> 2. Medidas</TabsTrigger>
                <TabsTrigger value="price"><Euro className="h-3.5 w-3.5 mr-1" /> 3. Preço</TabsTrigger>
                {PRODUCT_3D_PREVIEW_ENABLED && <TabsTrigger value="pos"><Move3d className="h-3.5 w-3.5 mr-1" /> Posição 3D</TabsTrigger>}
              </TabsList>

              <TabsContent value="data" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">O nome, a imagem e o valor desta área são exclusivos deste produto.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input
                      value={areaEditing.label}
                      onChange={(e) =>
                        setAreaEditing({
                          ...areaEditing,
                          label: e.target.value,
                          key: areaEditing.id ? areaEditing.key : slugify(e.target.value),
                        })
                      }
                      placeholder="Frente do peito"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Identificador (slug)</Label>
                    <Input
                      value={areaEditing.key}
                      onChange={(e) => setAreaEditing({ ...areaEditing, key: slugify(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Texto explicativo para o cliente</Label>
                  <Textarea
                    value={areaEditing.description ?? ""}
                    onChange={(e) => setAreaEditing({ ...areaEditing, description: e.target.value })}
                    placeholder="Área frontal superior da t-shirt"
                    rows={2}
                  />
                </div>
                <StorageImageUploader
                  value={areaEditing.preview_image_url ?? ""}
                  onChange={(url) => setAreaEditing((current) => current ? { ...current, preview_image_url: url } : current)}
                  bucket="product-images"
                  folder={`customization-areas/${productId}`}
                  label="Fotografia da área no personalizador"
                  previewAspect="aspect-video"
                  hint="Fotografia ou imagem da posição, mostrada quando o cliente seleciona a área. Também pode indicar um URL."
                  accept="image/png,image/jpeg,image/webp"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer">
                    <Switch
                      checked={areaEditing.is_active}
                      onCheckedChange={(v) => setAreaEditing({ ...areaEditing, is_active: v })}
                    />
                    <span className="text-sm">Ativa</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer">
                    <Switch
                      checked={areaEditing.required}
                      onCheckedChange={(v) => setAreaEditing({ ...areaEditing, required: v })}
                    />
                    <span className="text-sm">Obrigatória</span>
                  </label>
                  {PRODUCT_3D_PREVIEW_ENABLED && <label className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer">
                    <Switch
                      checked={areaEditing.preview_enabled}
                      onCheckedChange={(v) => setAreaEditing({ ...areaEditing, preview_enabled: v })}
                    />
                    <span className="text-sm">Mostrar no modelo 3D</span>
                  </label>}
                </div>
                {PRODUCT_3D_PREVIEW_ENABLED && !areaEditing.preview_enabled && (
                  <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                    O cliente poderá enviar a arte e as observações, mas esta área não aparecerá no modelo 3D. O ficheiro seguirá identificado na encomenda.
                  </p>
                )}
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <Switch checked={areaEditing.observation_required} onCheckedChange={(v) => setAreaEditing({ ...areaEditing, observation_required: v })} />
                  Exigir observação do cliente nesta área
                </label>
                <div className="space-y-2">
                  <Label>Ordem de exibição</Label>
                  <Input
                    type="number"
                    value={areaEditing.display_order}
                    onChange={(e) =>
                      setAreaEditing({ ...areaEditing, display_order: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="dims" className="space-y-4 pt-4">
                <div>
                  <Label className="text-sm font-semibold">Dimensões físicas da área (cm)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Tamanho da zona onde a personalização é permitida.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Largura (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={areaEditing.area_width_cm}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, area_width_cm: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Altura (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={areaEditing.area_height_cm}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, area_height_cm: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-semibold">Tamanho máximo permitido da arte (cm)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Limite superior que a arte do cliente pode ocupar.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Largura máx. (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={areaEditing.max_width_cm}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, max_width_cm: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Altura máx. (cm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={areaEditing.max_height_cm}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, max_height_cm: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={areaEditing.keep_aspect_ratio_default}
                    onCheckedChange={(v) =>
                      setAreaEditing({ ...areaEditing, keep_aspect_ratio_default: !!v })
                    }
                  />
                  Manter proporção por defeito ao redimensionar
                </label>
              </TabsContent>

              <TabsContent value="price" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Preço geral da área (fallback)</Label>
                  <Select
                    value={areaEditing.pricing_mode}
                    onValueChange={(v: "flat" | "per_cm2") =>
                      setAreaEditing({ ...areaEditing, pricing_mode: v })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Valor fixo pela área</SelectItem>
                      <SelectItem value="per_cm2">Por cm² ocupado</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {areaEditing.pricing_mode === "flat"
                      ? "Ex.: a frente custa 6,00 € independentemente do tamanho da arte."
                      : "Ex.: 0,020 €/cm² — o cliente paga em função da área ocupada pela arte, atualizada em tempo real."}
                    {" "}Este valor é usado quando o método escolhido não possuir um preço próprio.
                  </p>
                </div>
                {areaEditing.pricing_mode === "flat" ? (
                  <div className="space-y-2">
                    <Label>Preço fixo (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={areaEditing.base_price}
                      onChange={(e) =>
                        setAreaEditing({ ...areaEditing, base_price: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Preço por cm² (€)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={areaEditing.price_per_cm2 ?? 0}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, price_per_cm2: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preço mínimo (€)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={areaEditing.min_price}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, min_price: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                )}
                <Separator />
                <div className="space-y-2">
                  <Label>Técnicas permitidas *</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {TECHNIQUE_OPTIONS.map((t) => (
                      <label key={t.value} className="flex items-center gap-2 p-2 rounded border cursor-pointer">
                        <Checkbox
                          checked={areaEditing.allowed_techniques.includes(t.value)}
                          onCheckedChange={(v) => {
                            const set = new Set(areaEditing.allowed_techniques);
                            if (v) set.add(t.value);
                            else set.delete(t.value);
                            setAreaEditing({ ...areaEditing, allowed_techniques: Array.from(set) });
                          }}
                        />
                        <span className="text-sm">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Técnica padrão</Label>
                  <Select
                    value={areaEditing.default_technique ?? ""}
                    onValueChange={(v) => setAreaEditing({ ...areaEditing, default_technique: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {areaEditing.allowed_techniques.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TECHNIQUE_OPTIONS.find((x) => x.value === t)?.label ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                {areaEditing.id ? (
                  <AreaTechniquePriceEditor
                    key={areaEditing.id}
                    areaId={areaEditing.id}
                    techniques={areaEditing.allowed_techniques}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Guarde primeiro a nova área. Ao reabri-la, poderá definir um preço diferente para cada método de estampagem.
                  </div>
                )}
              </TabsContent>

              {PRODUCT_3D_PREVIEW_ENABLED && <TabsContent value="pos" className="space-y-4 pt-4">
                <AreaPlacementEditor
                  modelKind={(modelForm?.model_kind as ModelKind) ?? "box"}
                  areaKey={areaEditing.key}
                  modelUrl={modelForm?.enabled ? (modelForm.model_url || modelForm.optimized_model_url || modelForm.original_model_url) : null}
                  baseColor={modelForm?.base_color ?? "#0F172A"}
                  value={{
                    position_x: areaEditing.position_x,
                    position_y: areaEditing.position_y,
                    position_z: areaEditing.position_z,
                    rotation_x: areaEditing.rotation_x,
                    rotation_y: areaEditing.rotation_y,
                    rotation_z: areaEditing.rotation_z,
                    visual_area_width: areaEditing.visual_area_width,
                    visual_area_height: areaEditing.visual_area_height,
                  }}
                  onChange={(patch) => setAreaEditing({ ...areaEditing, ...patch })}
                />
                <div>
                  <Label className="text-sm font-semibold">Limites de escala do cliente</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <Label className="text-xs">Mín.</Label>
                      <Input
                        type="number"
                        step="0.05"
                        value={areaEditing.min_scale}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, min_scale: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Máx.</Label>
                      <Input
                        type="number"
                        step="0.05"
                      value={areaEditing.max_scale}
                        onChange={(e) =>
                          setAreaEditing({ ...areaEditing, max_scale: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>}
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaOpen(false)}>Cancelar</Button>
            <Button onClick={saveArea}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

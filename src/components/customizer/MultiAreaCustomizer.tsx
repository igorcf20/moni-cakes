import { usePrintMethods } from "@/hooks/usePrintMethods";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Check, AlertTriangle, Trash2, Ruler, Palette, Loader2, Sparkles, RotateCcw, Pause, Play, Undo2, Redo2, Eraser, FileImage, Minus, Plus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_3D_PREVIEW_ENABLED } from "@/lib/product3DFeature";
import { artworkQuality, artworkReviewComplete, fitArtwork, inspectArtwork, verifyArtworkOriginal, type ArtworkMetadata } from "@/lib/artworkSizing";
import ArtworkSizingReview from "./ArtworkSizingReview";
import Product3DPreview, { ModelKind, AreaDecal, CameraView, PreviewBox, defaultAreaAnchor } from "./Product3DPreview";
import { calculateCustomizationAddon, calculateMaterialAddon, type CustomizationPricingRule, type MaterialPricingRule } from "@/lib/customizationPricing";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCEPTED_MIME,
  validateFile,
  readFileWithProgress,
  qualityWarnings,
} from "./uploadUtils";

type PrintArea = {
  id: string;
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
  preview_anchor: Record<string, unknown> | null;
  keep_aspect_ratio_default: boolean;
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
};

type Model3D = {
  product_id: string;
  model_kind: ModelKind;
  base_color: string;
  camera_preset: Record<string, unknown> | null;
  model_url?: string | null;
  optimized_model_url?: string | null;
  original_model_url?: string | null;
  fallback_image_url?: string | null;
  enabled?: boolean;
};

type AreaState = {
  artwork?: ArtworkMetadata;
  acceptedSizing?: string;
  acceptedQuality?: string;
  quality?: ReturnType<typeof artworkQuality>;
  maxWidthCm?: number;
  maxHeightCm?: number;
  confirmedAt?: string;
  notes: string;
  fileDataUrl: string; // preview PNG in browser
  fileName: string;
  originalFileName?: string;
  fileType: string;
  widthCm: number;
  heightCm: number;
  technique: string;
  materialId?: string;
  materialName?: string;
  materialPriceAdjustment?: number;
  materialPricingMode?: "fixed" | "per_linear_meter";
  materialPricePerMeter?: number;
  materialCalculationDimension?: "width" | "height" | "longest_side";
  materialLengthCm?: number;
  // Placement adjustments on the 3D model (values in [-1,1] for offsets)
  offsetX: number;
  offsetY: number;
  scaleMul: number; // 0.5..1.5
  rotationDeg: number; // -45..45
  aspect: number;
};

type TechniqueMaterial = {
  id: string;
  area_technique_id: string;
  name: string;
  price_adjustment: number;
  pricing_mode: "fixed" | "per_linear_meter";
  price_per_meter: number;
  calculation_dimension: "width" | "height" | "longest_side";
  display_order: number;
  is_active: boolean;
};

type TechniqueConfig = CustomizationPricingRule & {
  id: string;
  print_area_id: string;
  technique: string;
  display_order: number;
  is_active: boolean;
  materials: TechniqueMaterial[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presentation?: "dialog" | "embedded";
  productId: string;
  productName: string;
  productBasePrice: number;
  productQuantity?: number;
  selectionBaseTotal?: number;
  selectedColorHex?: string | null;
  onConfirm: (payload: {
    areas: Record<string, AreaState & { areaLabel: string; areaId: string; addonPrice: number }>;
    totalAddon: number;
  }) => void | Promise<void>;
};

const TECHNIQUE_LABELS: Record<string, string> = {
  dtf: "DTF",
  dtf_uv: "DTF UV",
  sublimacao: "Sublimação",
  serigrafia: "Serigrafia",
  bordado: "Bordado",
  laser: "Gravação a laser",
  gravacao_laser: "Gravação a laser",
  uv: "DTF UV",
  vinil: "Vinil de corte",
};

type CustomizerFrameProps = {
  children: ReactNode;
  confirming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentation: "dialog" | "embedded";
  productName: string;
};

function CustomizerFrame({
  children,
  confirming,
  open,
  onOpenChange,
  presentation,
  productName,
}: CustomizerFrameProps) {
  if (presentation === "embedded") {
    return (
      <section
        id="product-customizer"
        aria-labelledby="product-customizer-title"
        aria-describedby="product-customizer-description"
        className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm"
      >
        {children}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!confirming) onOpenChange(next); }}>
      <DialogContent className="max-w-6xl w-[calc(100vw-1rem)] sm:w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden p-0 flex flex-col rounded-none sm:rounded-2xl">
        <DialogTitle className="sr-only">Personalizar {productName}</DialogTitle>
        <DialogDescription className="sr-only">
          Escolha cada área, envie a arte e indique observações específicas antes de confirmar.
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const MODEL_KINDS: ModelKind[] = ["tshirt", "mug", "tote", "backpack", "sticker", "box"];
const areaView = (key: string): CameraView => {
  const normalized = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/cost|back|verso/.test(normalized)) return "back";
  if (/manga|sleeve/.test(normalized)) {
    if (/left|esquerda|esq/.test(normalized)) return "right";
    if (/right|direita|dir/.test(normalized)) return "left";
    return "iso";
  }
  if (/topo|top|tampa/.test(normalized)) return "top";
  return "front";
};

const finiteOr = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fittedMaximum = (area: PrintArea, aspect: number) => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let width = Math.max(0.01, finiteOr(area.max_width_cm, 1));
  let height = Math.max(0.01, finiteOr(area.max_height_cm, 1));
  if (safeAspect > width / height) height = width / safeAspect;
  else width = height * safeAspect;
  return { width, height };
};

const sizeLimits = (area: PrintArea) => {
  if (!PRODUCT_3D_PREVIEW_ENABLED) return { minimum: 0.01, maximum: 1 };
  const maximum = Math.min(1, Math.max(0.05, finiteOr(area.max_scale, 1)));
  const minimum = Math.min(maximum, Math.max(0.05, finiteOr(area.min_scale, 0.2)));
  return { minimum, maximum };
};

const orderFileName = (area: PrintArea, state: AreaState) => {
  const safeLabel = area.label.trim().replace(/[\\/:*?"<>|]+/g, "-") || "Área";
  const extension = state.fileName.match(/\.[a-z0-9]{2,6}$/i)?.[0]
    ?? (state.fileType === "application/pdf" ? ".pdf" : ".png");
  const width = state.widthCm.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
  const height = state.heightCm.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
  return `${safeLabel} — ${width}×${height} cm${extension}`;
};

function readImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

type PlacementControlsProps = {
  area: PrintArea;
  value: AreaState;
  updateArea: (key: string, patch: Partial<AreaState>) => void;
  updateAreaSize: (area: PrintArea, ratio: number) => void;
  beginDrag: (id: string) => void;
  endDrag: () => void;
};

function PlacementControls({ area, value, updateArea, updateAreaSize, beginDrag, endDrag }: PlacementControlsProps) {
  const size = sizeLimits(area);
  const maximum = fittedMaximum(area, value.aspect);
  const ratio = Math.min(size.maximum, Math.max(size.minimum, finiteOr(value.scaleMul, 1)));
  const xMin = Math.max(-1, Math.min(1, finiteOr(area.drag_min_x, -1)));
  const xMax = Math.max(xMin, Math.min(1, finiteOr(area.drag_max_x, 1)));
  const yMin = Math.max(-1, Math.min(1, finiteOr(area.drag_min_y, -1)));
  const yMax = Math.max(yMin, Math.min(1, finiteOr(area.drag_max_y, 1)));
  const nudge = (axis: "offsetX" | "offsetY", amount: number) => {
    const min = axis === "offsetX" ? xMin : yMin;
    const max = axis === "offsetX" ? xMax : yMax;
    updateArea(area.key, { [axis]: Math.min(max, Math.max(min, value[axis] + amount)) });
  };

  return (
    <section className="mt-4 rounded-2xl border border-primary/20 bg-background p-3 shadow-sm sm:p-4" aria-labelledby={`placement-title-${area.id}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id={`placement-title-${area.id}`} className="text-sm font-semibold">Ajustar {area.label}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{PRODUCT_3D_PREVIEW_ENABLED ? "A linha azul é o limite máximo. A arte não pode sair desta área." : "Defina as dimensões mantendo a proporção da arte e os limites desta área."}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            updateArea(area.key, { offsetX: 0, offsetY: 0, rotationDeg: 0 });
            updateAreaSize(area, size.maximum);
          }}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border px-3 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Repor
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Tamanho da arte</span>
            <output className="font-semibold tabular-nums text-primary">
              {value.widthCm.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} × {value.heightCm.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} cm
            </output>
          </div>
          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
            <button type="button" onClick={() => updateAreaSize(area, ratio - 0.05)} className="flex h-11 w-11 items-center justify-center rounded-xl border hover:border-primary" aria-label="Diminuir arte">
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={size.minimum}
              max={size.maximum}
              step={0.01}
              value={ratio}
              onPointerDown={() => beginDrag(`${area.key}:size`)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onBlur={endDrag}
              onChange={(event) => updateAreaSize(area, Number(event.target.value))}
              className="h-11 w-full cursor-pointer accent-primary"
              aria-label="Tamanho da arte"
            />
            <button type="button" onClick={() => updateAreaSize(area, ratio + 0.05)} className="flex h-11 w-11 items-center justify-center rounded-xl border hover:border-primary" aria-label="Aumentar arte">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Largura (cm)
              <input type="number" min={1} max={maximum.width} step={0.5} value={value.widthCm} onChange={(event) => updateAreaSize(area, Number(event.target.value) / maximum.width)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Altura (cm)
              <input type="number" min={1} max={maximum.height} step={0.5} value={value.heightCm} onChange={(event) => updateAreaSize(area, Number(event.target.value) / maximum.height)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground" />
            </label>
          </div>
        </div>

        {PRODUCT_3D_PREVIEW_ENABLED && <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div>
            <p className="mb-2 text-xs font-medium">Posição</p>
            <div className="grid w-fit grid-cols-3 gap-1" role="group" aria-label="Mover a arte dentro da área">
              <span />
              <button type="button" onClick={() => nudge("offsetY", 0.1)} className="flex h-11 w-11 items-center justify-center rounded-lg border hover:border-primary" aria-label="Mover para cima"><ArrowUp className="h-4 w-4" /></button>
              <span />
              <button type="button" onClick={() => nudge("offsetX", -0.1)} className="flex h-11 w-11 items-center justify-center rounded-lg border hover:border-primary" aria-label="Mover para a esquerda"><ArrowLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => updateArea(area.key, { offsetX: 0, offsetY: 0 })} className="flex h-11 w-11 items-center justify-center rounded-lg border text-[10px] font-semibold hover:border-primary" aria-label="Centrar arte">Centro</button>
              <button type="button" onClick={() => nudge("offsetX", 0.1)} className="flex h-11 w-11 items-center justify-center rounded-lg border hover:border-primary" aria-label="Mover para a direita"><ArrowRight className="h-4 w-4" /></button>
              <span />
              <button type="button" onClick={() => nudge("offsetY", -0.1)} className="flex h-11 w-11 items-center justify-center rounded-lg border hover:border-primary" aria-label="Mover para baixo"><ArrowDown className="h-4 w-4" /></button>
              <span />
            </div>
          </div>
          <div className="space-y-3">
            {([
              { label: "Horizontal", key: "offsetX" as const, min: xMin, max: xMax, value: value.offsetX },
              { label: "Vertical", key: "offsetY" as const, min: yMin, max: yMax, value: value.offsetY },
              { label: "Rotação", key: "rotationDeg" as const, min: -45, max: 45, value: value.rotationDeg },
            ]).map((control) => (
              <label key={control.key} className="block text-[11px] text-muted-foreground">
                <span className="flex justify-between gap-2"><span>{control.label}</span><output className="font-semibold text-foreground">{control.key === "rotationDeg" ? `${control.value}°` : `${Math.round(control.value * 100)}%`}</output></span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.key === "rotationDeg" ? 1 : 0.02}
                  value={control.value}
                  onPointerDown={() => beginDrag(`${area.key}:${control.key}`)}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onBlur={endDrag}
                  onChange={(event) => updateArea(area.key, { [control.key]: Number(event.target.value) })}
                  className="h-9 w-full cursor-pointer accent-primary"
                />
              </label>
            ))}
          </div>
        </div>}
      </div>
    </section>
  );
}

export default function MultiAreaCustomizer({
  open,
  onOpenChange,
  presentation = "dialog",
  productId,
  productName,
  productBasePrice,
  productQuantity = 1,
  selectionBaseTotal,
  selectedColorHex,
  onConfirm,
}: Props) {
  const { labels: techniqueLabels } = usePrintMethods();
  const [state, setStateRaw] = useState<Record<string, AreaState>>({});
  const historyRef = useRef<{ past: Record<string, AreaState>[]; future: Record<string, AreaState>[] }>({
    past: [],
    future: [],
  });
  const [historyTick, setHistoryTick] = useState(0);
  const skipHistoryRef = useRef(false);

  const commitState = useCallback(
    (updater: (prev: Record<string, AreaState>) => Record<string, AreaState>) => {
      setStateRaw((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        if (!skipHistoryRef.current) {
          historyRef.current.past.push(prev);
          if (historyRef.current.past.length > 50) historyRef.current.past.shift();
          historyRef.current.future = [];
          setHistoryTick((t) => t + 1);
        }
        skipHistoryRef.current = false;
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    setStateRaw((cur) => {
      const prev = h.past.pop()!;
      h.future.push(cur);
      return prev;
    });
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    setStateRaw((cur) => {
      const next = h.future.pop()!;
      h.past.push(cur);
      return next;
    });
    setHistoryTick((t) => t + 1);
  }, []);

  const resetAll = useCallback(() => {
    setStateRaw((cur) => {
      if (!Object.keys(cur).length) return cur;
      historyRef.current.past.push(cur);
      historyRef.current.future = [];
      setHistoryTick((t) => t + 1);
      return {};
    });
    toast.success("Personalização reposta");
  }, []);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  void historyTick; // re-render trigger

  // Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, undo, redo]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<CameraView>("front");
  const [spinning, setSpinning] = useState(false);
  const [mobileTab, setMobileTab] = useState<"design" | "preview">("design");
  const inputRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadWarnings, setUploadWarnings] = useState<Record<string, string[]>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  // Reset history whenever the dialog is (re)opened so state stays coherent.
  useEffect(() => {
    if (open) {
      historyRef.current = { past: [], future: [] };
      setHistoryTick(0);
      setUploadProgress({});
      setUploadWarnings({});
      setUploadError({});
    }
  }, [open]);

  const { data: areas = [], isLoading: areasLoading } = useQuery({
    queryKey: ["print-areas", productId],
    enabled: open,
    queryFn: async (): Promise<PrintArea[]> => {
      const { data, error } = await db
        .from("product_print_areas")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as PrintArea[];
    },
  });

  const { data: model } = useQuery({
    queryKey: ["product-3d", productId],
    enabled: open && PRODUCT_3D_PREVIEW_ENABLED,
    queryFn: async (): Promise<Model3D | null> => {
      const { data } = await db
        .from("product_3d_models")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();
      return (data as unknown as Model3D | null) ?? null;
    },
  });

  const { data: techniqueConfigs = [] } = useQuery({
    queryKey: ["print-area-techniques", productId, areas.map((area) => area.id).join(",")],
    enabled: open && areas.length > 0,
    queryFn: async (): Promise<TechniqueConfig[]> => {
      const areaIds = areas.map((area) => area.id);
      const { data, error } = await db.from("product_print_area_techniques").select("*").in("print_area_id", areaIds).eq("is_active", true).order("display_order");
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }
      const configIds = (data ?? []).map((config) => config.id);
      const materialsResult = configIds.length
        ? await db.from("product_print_area_technique_materials").select("*").in("area_technique_id", configIds).eq("is_active", true).order("display_order")
        : { data: [], error: null };
      if (materialsResult.error) throw materialsResult.error;
      return (data ?? []).map((config) => ({
        ...config,
        base_price: Number(config.base_price),
        price_per_cm2: Number(config.price_per_cm2),
        min_price: Number(config.min_price),
        materials: (materialsResult.data ?? [])
          .filter((material) => material.area_technique_id === config.id)
          .map((material) => ({
            ...material,
            price_adjustment: Number(material.price_adjustment),
            price_per_meter: Number(material.price_per_meter),
            pricing_mode: material.pricing_mode as TechniqueMaterial["pricing_mode"],
            calculation_dimension: material.calculation_dimension as TechniqueMaterial["calculation_dimension"],
          })),
      }));
    },
  });

  useEffect(() => {
    if (!techniqueConfigs.length) return;
    setStateRaw((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const [areaKey, value] of Object.entries(previous)) {
        if (value.materialId) continue;
        const area = areas.find((entry) => entry.key === areaKey);
        const material = techniqueConfigs.find((config) => config.print_area_id === area?.id && config.technique === value.technique)?.materials[0];
        if (!material) continue;
        next[areaKey] = {
          ...value,
          materialId: material.id,
          materialName: material.name,
          materialPriceAdjustment: material.price_adjustment,
          materialPricingMode: material.pricing_mode,
          materialPricePerMeter: material.price_per_meter,
          materialCalculationDimension: material.calculation_dimension,
        };
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [areas, techniqueConfigs]);

  const modelKind: ModelKind = model && MODEL_KINDS.includes(model.model_kind) ? model.model_kind : "box";
  const modelUrl = model?.enabled === false ? null : (model?.model_url || model?.optimized_model_url || model?.original_model_url || null);

  const activeArea = useMemo(
    () => areas.find((a) => a.key === activeKey) ?? areas[0] ?? null,
    [areas, activeKey],
  );
  const activeAreaState = activeArea ? state[activeArea.key] : undefined;
  const activeAreaHas3D = PRODUCT_3D_PREVIEW_ENABLED && activeArea?.preview_enabled !== false;

  const placementFor = useCallback((area: PrintArea) => {
    const fallback = defaultAreaAnchor(modelKind, area.key);
    const hasDbAnchor = [area.position_x, area.position_y, area.position_z, area.rotation_x, area.rotation_y, area.rotation_z]
      .some((value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.0001);
    const visualScale = Math.max(0.05, finiteOr(area.scale, 1));
    const physicalAspect = Math.max(0.1, finiteOr(area.max_width_cm, 1) / Math.max(0.1, finiteOr(area.max_height_cm, 1)));
    const fallbackBounds = physicalAspect > 1
      ? { width: fallback.size, height: fallback.size / physicalAspect }
      : { width: fallback.size * physicalAspect, height: fallback.size };
    return {
      position: hasDbAnchor
        ? [finiteOr(area.position_x, fallback.pos[0]), finiteOr(area.position_y, fallback.pos[1]), finiteOr(area.position_z, fallback.pos[2])] as [number, number, number]
        : fallback.pos,
      rotation: hasDbAnchor
        ? [finiteOr(area.rotation_x, fallback.rotation[0]), finiteOr(area.rotation_y, fallback.rotation[1]), finiteOr(area.rotation_z, fallback.rotation[2])] as [number, number, number]
        : fallback.rotation,
      boundsWidth: hasDbAnchor
        ? Math.max(0.04, finiteOr(area.visual_area_width, fallbackBounds.width) * visualScale)
        : Math.max(0.04, fallbackBounds.width),
      boundsHeight: hasDbAnchor
        ? Math.max(0.04, finiteOr(area.visual_area_height, fallbackBounds.height) * visualScale)
        : Math.max(0.04, fallbackBounds.height),
    };
  }, [modelKind]);

  const techniqueConfigFor = useCallback(
    (areaId: string, technique?: string) => techniqueConfigs.find((config) => config.print_area_id === areaId && config.technique === technique),
    [techniqueConfigs],
  );

  const materialRuleFor = (stateValue?: AreaState): MaterialPricingRule | undefined => stateValue?.materialId ? {
    pricing_mode: stateValue.materialPricingMode ?? "fixed",
    fixed_price: stateValue.materialPriceAdjustment ?? 0,
    price_per_meter: stateValue.materialPricePerMeter ?? 0,
    calculation_dimension: stateValue.materialCalculationDimension ?? "height",
  } : undefined;

  const materialLengthFor = (stateValue: AreaState) => stateValue.materialCalculationDimension === "width"
    ? stateValue.widthCm
    : stateValue.materialCalculationDimension === "longest_side"
      ? Math.max(stateValue.widthCm, stateValue.heightCm)
      : stateValue.heightCm;

  const priceFor = useCallback(
    (a: PrintArea, s?: AreaState) => {
      if (!s) return 0;
      const rule = techniqueConfigFor(a.id, s.technique) ?? a;
      return calculateCustomizationAddon(rule, s.widthCm, s.heightCm, materialRuleFor(s));
    },
    [techniqueConfigFor],
  );

  const totalAddon = useMemo(
    () => areas.reduce((sum, a) => sum + priceFor(a, state[a.key]), 0),
    [areas, state, priceFor],
  );

  const decals: AreaDecal[] = useMemo(
    () => {
      if (!activeArea || !activeAreaHas3D || !activeAreaState) return [];
      return areas
        .filter((area) => area.key === activeArea.key)
        .map((a) => {
          const s = state[a.key];
          const placement = placementFor(a);
          return {
            key: a.key,
            imageUrl: s.fileDataUrl,
            anchor: {
              x: placement.position[0],
              y: placement.position[1],
              z: placement.position[2],
              rotX: placement.rotation[0],
              rotY: placement.rotation[1],
              rotZ: placement.rotation[2],
              boundsWidth: placement.boundsWidth,
              boundsHeight: placement.boundsHeight,
              offsetX: s.offsetX,
              offsetY: s.offsetY,
              scaleMul: s.scaleMul,
              rotAdd: (s.rotationDeg * Math.PI) / 180,
              aspect: s.aspect,
            },
          };
        });
    },
    [activeArea, activeAreaHas3D, activeAreaState, areas, placementFor, state],
  );

  const activePreviewBox = useMemo<PreviewBox | null>(() => {
    if (!activeArea || !activeAreaHas3D) return null;
    const placement = placementFor(activeArea);
    return {
      position: placement.position,
      rotationEuler: placement.rotation,
      width: placement.boundsWidth,
      height: placement.boundsHeight,
      color: "#0067C5",
    };
  }, [activeArea, activeAreaHas3D, placementFor]);

  const requiredMissing = areas.filter((a) => a.required && !state[a.key]);
  const missingObservations = areas.filter((a) => a.observation_required && state[a.key] && !state[a.key].notes.trim());
  const reviewPending = areas.filter(a => state[a.key] && !artworkReviewComplete(state[a.key]));
  const canConfirm = !confirming && !uploading && requiredMissing.length === 0 && missingObservations.length === 0 && reviewPending.length === 0 && Object.keys(state).length > 0;

  const handleFile = async (area: PrintArea, file: File) => {
    setUploadError((e) => ({ ...e, [area.key]: "" }));
    const v = validateFile(file);
    if (!v.ok) {
      setUploadError((e) => ({ ...e, [area.key]: v.errors.join(" ") }));
      toast.error(v.errors[0]);
      return;
    }
    setUploading(area.key);
    setUploadProgress((p) => ({ ...p, [area.key]: 0 }));
    try {
      const res = await readFileWithProgress(file, (pct) =>
        setUploadProgress((p) => ({ ...p, [area.key]: pct })),
      );
      const artwork = await inspectArtwork(file, res.widthPx, res.heightPx);
      const aspect = artwork.sourceWidthCm && artwork.sourceHeightCm ? artwork.sourceWidthCm / artwork.sourceHeightCm : res.aspect;
      const maximum = fittedMaximum(area, aspect);
      const fit = fitArtwork(artwork.sourceWidthCm ?? maximum.width, artwork.sourceHeightCm ?? maximum.height, maximum.width * sizeLimits(area).maximum, maximum.height * sizeLimits(area).maximum);
      const initialRatio = fit.widthCm / maximum.width;
      const widthCm = fit.widthCm;
      const heightCm = fit.heightCm;
      const warns = [...v.warnings, ...qualityWarnings(res, file).filter(w => w.includes("transparência"))];
      setUploadWarnings((w) => ({ ...w, [area.key]: warns }));
      const technique = area.default_technique || area.allowed_techniques[0] || "dtf";
      const defaultMaterial = techniqueConfigFor(area.id, technique)?.materials[0];
      commitState((prev) => ({
        ...prev,
        [area.key]: {
          notes: prev[area.key]?.notes ?? "",
          fileDataUrl: res.dataUrl,
          fileName: file.name,
          fileType: file.type,
          artwork,
          widthCm,
          heightCm,
          technique,
          materialId: defaultMaterial?.id,
          materialName: defaultMaterial?.name,
          materialPriceAdjustment: defaultMaterial?.price_adjustment ?? 0,
          materialPricingMode: defaultMaterial?.pricing_mode ?? "fixed",
          materialPricePerMeter: defaultMaterial?.price_per_meter ?? 0,
          materialCalculationDimension: defaultMaterial?.calculation_dimension ?? "height",
          offsetX: 0,
          offsetY: 0,
          scaleMul: initialRatio,
          rotationDeg: 0,
          aspect,
        },
      }));
      setActiveKey(area.key);
      setView(areaView(area.key));
      setMobileTab(PRODUCT_3D_PREVIEW_ENABLED && area.preview_enabled !== false ? "preview" : "design");
      toast.success(`Design carregado em "${area.label}".`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível ler o ficheiro.";
      setUploadError((e) => ({ ...e, [area.key]: msg }));
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  };


  // Envio directo: aplica o mesmo ficheiro a todas as áreas activas (ou às
  // obrigatórias, se houver) com defaults. O cliente não precisa de ajustar
  // dimensões, posição ou técnica — segue directo para confirmar.
  const handleQuickUpload = async (file: File) => {
    if (!areas.length) {
      toast.error("Produto sem áreas configuradas.");
      return;
    }
    const required = areas.filter((a) => a.required);
    const targets = required.length ? required : [areas[0]];
    for (const a of targets) {
      await handleFile(a, file);
    }
    toast.success("Ficheiro aplicado. Pode confirmar ou ajustar antes de encomendar.");
  };

  // Slider drags produce many updates — coalesce them into a single history entry
  // per interaction by only pushing the first change of a "drag session".
  const dragSessionRef = useRef<string | null>(null);
  const beginDrag = (id: string) => {
    dragSessionRef.current = id;
  };
  const endDrag = () => {
    dragSessionRef.current = null;
  };

  const updateArea = (key: string, patch: Partial<AreaState>) => {
    if (dragSessionRef.current) skipHistoryRef.current = true;
    commitState((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };

  const updateAreaSize = (area: PrintArea, ratio: number) => {
    const current = state[area.key];
    if (!current || !Number.isFinite(ratio)) return;
    const limits = sizeLimits(area);
    const safeRatio = Math.min(limits.maximum, Math.max(limits.minimum, ratio));
    const maximum = fittedMaximum(area, current.aspect);
    updateArea(area.key, {
      widthCm: maximum.width * safeRatio,
      heightCm: maximum.height * safeRatio,
      scaleMul: safeRatio,
      acceptedSizing: undefined,
      acceptedQuality: undefined,
    });
  };

  const removeArea = (key: string) =>
    commitState((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const confirm = async () => {
    if (!canConfirm) {
      toast.error(
        requiredMissing.length
          ? `Faltam áreas obrigatórias: ${requiredMissing.map((a) => a.label).join(", ")}`
          : missingObservations.length
            ? `Preencha as observações de: ${missingObservations.map((a) => a.label).join(", ")}`
          : reviewPending.length
            ? `Reveja e confirme medidas e qualidade de: ${reviewPending.map(a => a.label).join(", ")}`
          : "Adicione pelo menos uma personalização.",
      );
      return;
    }
    const payload: Record<string, AreaState & { areaLabel: string; areaId: string; addonPrice: number }> = {};
    for (const a of areas) {
      const s = state[a.key];
      if (!s) continue;
      payload[a.key] = {
        ...s,
        originalFileName: s.originalFileName ?? s.fileName,
        fileName: orderFileName(a, s),
        areaLabel: a.label,
        areaId: a.id,
        addonPrice: priceFor(a, s),
        materialPriceAdjustment: calculateMaterialAddon(materialRuleFor(s), s.widthCm, s.heightCm),
        materialLengthCm: s.materialId ? materialLengthFor(s) : undefined,
        quality: s.artwork ? artworkQuality(s.artwork, s.widthCm, s.heightCm) : undefined,
        maxWidthCm: a.max_width_cm,
        maxHeightCm: a.max_height_cm,
        confirmedAt: new Date().toISOString(),
      };
    }
    setConfirming(true);
    try {
      await Promise.all(Object.values(payload).map(s => verifyArtworkOriginal(s.fileDataUrl, s.artwork!)));
      await onConfirm({ areas: payload, totalAddon });
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível guardar a personalização. A arte e os dados permanecem aqui; tente novamente.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <CustomizerFrame
      confirming={confirming}
      open={open}
      onOpenChange={onOpenChange}
      presentation={presentation}
      productName={productName}
    >
        <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="product-customizer-title" className="font-heading text-lg sm:text-2xl flex items-center gap-2 pr-8">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">Personalizar · {productName}</span>
              </h2>
              <p id="product-customizer-description" className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Escolha cada área, envie a arte e indique observações específicas antes de confirmar.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <input
                ref={quickInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleQuickUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => quickInputRef.current?.click()}
                className="h-9 sm:h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shadow-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Envio rápido</span>
                <span className="sm:hidden">Enviar arte</span>
              </button>
              <div className="hidden sm:flex items-center gap-1">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Anular (Ctrl/Cmd+Z)"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Refazer (Ctrl/Cmd+Shift+Z)"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  onClick={resetAll}
                  disabled={Object.keys(state).length === 0}
                  title="Repor tudo"
                  className="h-8 px-2 inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eraser className="h-3.5 w-3.5" /> Repor
                </button>
              </div>
            </div>
          </div>
        </header>

        {areasLoading ? (
          <div className="p-16 text-center text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" /> A carregar áreas…
          </div>
        ) : areas.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-sm">
            Este produto ainda não tem áreas de personalização configuradas.
          </div>
        ) : (
          <div className={cn("flex-1 min-h-0 flex flex-col lg:grid lg:gap-0 overflow-hidden", PRODUCT_3D_PREVIEW_ENABLED ? "lg:grid-cols-[260px_1fr_320px]" : "lg:grid-cols-[260px_minmax(0,1fr)]")}>
            {/* Mobile: horizontal area chips */}
            <div className="lg:hidden border-b border-border/50 bg-muted/20 overflow-x-auto">
              <div className="flex gap-2 p-3 min-w-max">
                {areas.map((a) => {
                  const filled = !!state[a.key];
                  const isActive = a.key === (activeKey ?? areas[0]?.key);
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        setActiveKey(a.key);
                        setView(areaView(a.key));
                      }}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all",
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : filled
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border/60 bg-background text-foreground",
                      )}
                    >
                      {filled && <Check className="h-3 w-3" />}
                      {a.preview_image_url && <img src={a.preview_image_url} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />}
                      {a.label}
                      {a.required && !filled && <span className="text-[9px] opacity-70">·obrig.</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile: tab switcher */}
            {PRODUCT_3D_PREVIEW_ENABLED && <div className="lg:hidden border-b border-border/50 bg-background sticky top-0 z-10">
              <div className="grid grid-cols-2">
                <button
                  onClick={() => setMobileTab("design")}
                  className={cn(
                    "h-11 text-xs font-semibold uppercase tracking-wider transition-colors",
                    mobileTab === "design"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground border-b-2 border-transparent",
                  )}
                >
                  Design
                </button>
                <button
                  onClick={() => setMobileTab("preview")}
                  className={cn(
                    "h-11 text-xs font-semibold uppercase tracking-wider transition-colors",
                    mobileTab === "preview"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground border-b-2 border-transparent",
                  )}
                >
                  {activeAreaHas3D ? "Pré-visualização 3D" : "Ficheiro da área"}
                </button>
              </div>
            </div>}

            {/* Desktop: areas list sidebar */}
            <aside className="hidden lg:block border-r border-border/50 overflow-y-auto p-4 space-y-2 bg-muted/20">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground px-1 mb-2">
                Áreas de personalização
              </p>
              {areas.map((a) => {
                const filled = !!state[a.key];
                const isActive = a.key === (activeKey ?? areas[0]?.key);
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setActiveKey(a.key);
                      setView(areaView(a.key));
                    }}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-all",
                      isActive
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/50 bg-background hover:border-primary/40",
                    )}
                  >
                    {a.preview_image_url && <img src={a.preview_image_url} alt="" className="mb-2 h-24 w-full rounded-lg bg-white object-cover" loading="lazy" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{a.label}</span>
                      {filled ? (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      ) : a.required ? (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                          Obrigatório
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          Opcional
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Ruler className="h-3 w-3" /> máx. {a.max_width_cm}×{a.max_height_cm} cm
                    </p>
                    {filled && (
                      <p className="text-[11px] text-primary font-semibold mt-1">
                        + {priceFor(a, state[a.key]).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                      </p>
                    )}
                  </button>
                );
              })}
            </aside>

            {/* 3D preview — visible on desktop always, on mobile only when tab=preview */}
            {PRODUCT_3D_PREVIEW_ENABLED && <div
              className={cn(
                "p-4 sm:p-6 overflow-y-auto",
                "lg:block",
                mobileTab === "preview" ? "block" : "hidden lg:block",
              )}
            >
              {activeAreaHas3D && <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5" aria-label="Vistas do produto">
                {(["front", "back", "left", "right", "iso"] as CameraView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={cn(
                      "px-2.5 h-8 rounded-full text-[10px] sm:text-[11px] uppercase tracking-wider border transition-all",
                      view === v ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border/60 bg-background hover:border-primary/40",
                    )}
                  >
                    {v === "front" ? "Frente" : v === "back" ? "Costas" : v === "left" ? "Esq." : v === "right" ? "Dir." : "3/4"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSpinning((s) => !s)}
                  aria-pressed={spinning}
                  className={cn(
                    "px-2.5 h-8 rounded-full text-[10px] sm:text-[11px] uppercase tracking-wider border inline-flex items-center gap-1 transition-all",
                    spinning ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 bg-background hover:border-primary/40",
                  )}
                >
                  {spinning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {spinning ? "Parar" : "Rodar"}
                </button>
              </div>}
              {activeAreaHas3D ? (
                <>
                  <Product3DPreview
                    modelKind={modelKind}
                    baseColor={selectedColorHex ?? model?.base_color ?? "#0F172A"}
                    modelUrl={modelUrl}
                    fallbackImageUrl={model?.fallback_image_url}
                    decals={decals}
                    view={view}
                    autoRotate={spinning}
                    previewBox={activePreviewBox}
                    className="w-full aspect-square max-w-md mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-brand-navy/10 via-primary/5 to-transparent border border-border/40 shadow-inner"
                  />
                  {activeArea && activeAreaState && (
                    <PlacementControls
                      area={activeArea}
                      value={activeAreaState}
                      updateArea={updateArea}
                      updateAreaSize={updateAreaSize}
                      beginDrag={beginDrag}
                      endDrag={endDrag}
                    />
                  )}
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground text-center mb-2">
                      Cor da variação escolhida
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span className="h-6 w-6 rounded-full border border-border shadow-sm" style={{ backgroundColor: selectedColorHex ?? model?.base_color ?? "#0F172A" }} aria-hidden="true" />
                      <span>Para alterar, selecione outra variação na página do produto.</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center mt-3 hidden sm:block">
                    A pré-visualização é aproximada. O resultado final depende da técnica e material.
                  </p>
                </>
              ) : (
                <section className="mx-auto max-w-md rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center" aria-labelledby="upload-only-area-title">
                  <FileImage className="mx-auto h-9 w-9 text-primary" />
                  <h3 id="upload-only-area-title" className="mt-3 font-heading text-lg">Área apenas para envio</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Esta posição não é representada no modelo 3D. A arte, o tamanho e as observações seguirão identificados para o painel administrativo e para a encomenda.
                  </p>
                  {activeArea && activeAreaState && (
                    <div className="mt-4 rounded-xl border bg-background p-3 text-left">
                      <p className="truncate text-sm font-semibold">{orderFileName(activeArea, activeAreaState)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ficheiro original: {activeAreaState.fileName}</p>
                    </div>
                  )}
                </section>
              )}
            </div>}




            {/* Area editor — visible on desktop always, on mobile only when tab=design */}
            <aside
              className={cn(
                "lg:border-l border-border/50 overflow-y-auto p-4 sm:p-5 space-y-4 bg-background",
                "lg:block",
                !PRODUCT_3D_PREVIEW_ENABLED || mobileTab === "design" ? "block flex-1 min-h-0" : "hidden lg:block",
              )}
            >
              {activeArea && (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
                      Área activa
                    </p>
                    <h3 className="font-heading text-xl">{activeArea.label}</h3>
                    {activeArea.description && <p className="mt-1 text-xs text-muted-foreground">{activeArea.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Tamanho máximo: {activeArea.max_width_cm} × {activeArea.max_height_cm} cm
                    </p>
                  </div>
                  {activeArea.preview_image_url && (
                    <img src={activeArea.preview_image_url} alt={`Posição de ${activeArea.label} no produto`} className="aspect-video w-full rounded-xl border bg-white object-contain" />
                  )}

                  {!state[activeArea.key] ? (
                    <div>
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(activeArea, f);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading === activeArea.key}
                        className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
                      >
                        {uploading === activeArea.key ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Carregar design
                      </Button>
                      {uploading === activeArea.key && uploadProgress[activeArea.key] != null && (
                        <div className="mt-2">
                          <Progress value={uploadProgress[activeArea.key]} className="h-1.5" />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            A processar… {uploadProgress[activeArea.key]}%
                          </p>
                        </div>
                      )}
                      {uploadError[activeArea.key] && (
                        <p className="mt-2 text-xs text-destructive inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {uploadError[activeArea.key]}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                        PNG, JPG, WEBP ou PDF · máx. 20 MB · fundo transparente recomendado · resolução ≥ 1500px.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                        <div className="aspect-video bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2210%22 height=%2210%22 fill=%22%23eee%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23eee%22/></svg>')] flex items-center justify-center">
                          {state[activeArea.key].fileType === "application/pdf" ? (
                            <object
                              data={`${state[activeArea.key].fileDataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              type="application/pdf"
                              className="w-full h-full"
                              aria-label="Pré-visualização do PDF"
                            >
                              <div className="flex flex-col items-center justify-center text-muted-foreground text-xs h-full">
                                <Upload className="h-6 w-6 mb-1" />
                                {state[activeArea.key].fileName}
                              </div>
                            </object>
                          ) : (
                            <img
                              src={state[activeArea.key].fileDataUrl}
                              alt="Pré-visualização do design"
                              className="max-h-full max-w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="px-3 py-2 flex items-center justify-between border-t border-border/40 text-xs">
                          <span className="truncate">{state[activeArea.key].fileName}</span>
                          <button
                            onClick={() => removeArea(activeArea.key)}
                            className="text-destructive inline-flex items-center gap-1 hover:underline"
                          >
                            <Trash2 className="h-3 w-3" /> Remover
                          </button>
                        </div>
                      </div>
                      {uploadWarnings[activeArea.key]?.length > 0 && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 space-y-1">
                          {uploadWarnings[activeArea.key].map((w, i) => (
                            <p key={i} className="flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{w}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {!PRODUCT_3D_PREVIEW_ENABLED && (
                        <PlacementControls
                          area={activeArea}
                          value={state[activeArea.key]}
                          updateArea={updateArea}
                          updateAreaSize={updateAreaSize}
                          beginDrag={beginDrag}
                          endDrag={endDrag}
                        />
                      )}

                      <ArtworkSizingReview
                        key={`${activeArea.id}:${state[activeArea.key].artwork?.sha256}`}
                        label={activeArea.label}
                        value={state[activeArea.key]}
                        maxWidth={activeArea.max_width_cm * sizeLimits(activeArea).maximum}
                        maxHeight={activeArea.max_height_cm * sizeLimits(activeArea).maximum}
                        onChange={patch => updateArea(activeArea.key, patch)}
                      />

                      <div className="space-y-1.5">
                        <label htmlFor={`area-notes-${activeArea.id}`} className="text-xs font-medium">
                          Observações para {activeArea.label} {activeArea.observation_required ? "(obrigatório)" : "(opcional)"}
                        </label>
                        <Textarea
                          id={`area-notes-${activeArea.id}`}
                          value={state[activeArea.key].notes}
                          onChange={(event) => updateArea(activeArea.key, { notes: event.target.value })}
                          placeholder="Ex.: localização exata, instruções ou texto a aplicar"
                          maxLength={1000}
                          rows={3}
                          aria-required={activeArea.observation_required}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Esta observação acompanha apenas esta área no carrinho e na encomenda.
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Palette className="h-3 w-3" /> Técnica de aplicação
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {activeArea.allowed_techniques.map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                const defaultMaterial = techniqueConfigFor(activeArea.id, t)?.materials[0];
                                updateArea(activeArea.key, {
                                  technique: t,
                                  materialId: defaultMaterial?.id,
                                  materialName: defaultMaterial?.name,
                                  materialPriceAdjustment: defaultMaterial?.price_adjustment ?? 0,
                                  materialPricingMode: defaultMaterial?.pricing_mode ?? "fixed",
                                  materialPricePerMeter: defaultMaterial?.price_per_meter ?? 0,
                                  materialCalculationDimension: defaultMaterial?.calculation_dimension ?? "height",
                                });
                              }}
                              className={cn(
                                "h-9 rounded-lg border text-xs font-medium transition-all",
                                state[activeArea.key].technique === t
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/50 hover:border-primary/50",
                              )}
                            >
                              {techniqueLabels[t] ?? t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(() => {
                        const materials = techniqueConfigFor(activeArea.id, state[activeArea.key].technique)?.materials ?? [];
                        if (!materials.length) return null;
                        return <div className="space-y-1.5">
                          <p className="text-xs font-medium">Material ou acabamento</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {materials.map((material) => <button
                              key={material.id}
                              type="button"
                              onClick={() => updateArea(activeArea.key, {
                                materialId: material.id,
                                materialName: material.name,
                                materialPriceAdjustment: material.price_adjustment,
                                materialPricingMode: material.pricing_mode,
                                materialPricePerMeter: material.price_per_meter,
                                materialCalculationDimension: material.calculation_dimension,
                              })}
                              className={cn(
                                "flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left text-xs transition-colors",
                                state[activeArea.key].materialId === material.id
                                  ? "border-primary bg-primary/5 text-foreground"
                                  : "border-border/60 hover:border-primary/50",
                              )}
                            >
                              <span className="font-medium">{material.name}</span>
                              <span className="tabular-nums text-muted-foreground">{material.pricing_mode === "fixed"
                                ? `+ ${material.price_adjustment.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}`
                                : `${material.price_per_meter.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}/m`}</span>
                            </button>)}
                          </div>
                          {state[activeArea.key].materialPricingMode === "per_linear_meter" && <p className="text-[11px] text-muted-foreground">Consumo calculado: {materialLengthFor(state[activeArea.key]).toFixed(1)} cm = {(materialLengthFor(state[activeArea.key]) / 100).toFixed(3)} m.</p>}
                        </div>;
                      })()}

                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-xs">Preço desta área</span>
                          <span className="font-heading font-bold text-primary">
                            {priceFor(activeArea, state[activeArea.key]).toLocaleString("pt-PT", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {techniqueLabels[state[activeArea.key].technique] ?? state[activeArea.key].technique}
                          {state[activeArea.key].materialName ? ` · ${state[activeArea.key].materialName}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        )}

        <div className="border-t border-border/50 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/10">
          <div className="flex items-baseline justify-between sm:block gap-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</p>
            <p className="font-heading text-xl sm:text-2xl">
              {((selectionBaseTotal ?? productBasePrice * productQuantity) + totalAddon * productQuantity).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
              <span className="text-[11px] text-muted-foreground font-body ml-1 hidden sm:inline">
                ({productQuantity} unidades · base {(selectionBaseTotal ?? productBasePrice * productQuantity).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })} + adicional{" "}
                {(totalAddon * productQuantity).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })})
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={confirming} onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Cancelar
            </Button>
            <Button
              onClick={confirm}
              disabled={!canConfirm}
              className="flex-1 sm:flex-none bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {confirming ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A guardar…</> : <><span className="sm:hidden">Adicionar ao carrinho</span><span className="hidden sm:inline">Confirmar e adicionar ao carrinho</span></>}
            </Button>
          </div>
        </div>
    </CustomizerFrame>
  );
}

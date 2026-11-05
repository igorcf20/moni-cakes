import { useMemo, useState } from "react";
import Product3DPreview, { CameraView, ModelKind, defaultAreaAnchor } from "@/components/customizer/Product3DPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MousePointerClick, RotateCcw } from "lucide-react";

export type AreaPlacementValue = {
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  visual_area_width: number;
  visual_area_height: number;
};

type Preset = {
  key: string;
  label: string;
  view: CameraView;
  value: Omit<AreaPlacementValue, "visual_area_width" | "visual_area_height">;
};

const TSHIRT_PRESETS: Preset[] = ([
  ["front", "Frente", "front"],
  ["back", "Costas", "back"],
  ["left_sleeve", "Manga esq.", "front"],
  ["right_sleeve", "Manga dir.", "front"],
] as const).map(([key, label, view]) => {
  const anchor = defaultAreaAnchor("tshirt", key);
  return { key, label, view, value: {
    position_x: anchor.pos[0], position_y: anchor.pos[1], position_z: anchor.pos[2],
    rotation_x: anchor.rotation[0], rotation_y: anchor.rotation[1], rotation_z: anchor.rotation[2],
  } };
});

type Props = {
  modelKind: ModelKind;
  areaKey: string;
  modelUrl?: string | null;
  baseColor?: string;
  value: AreaPlacementValue;
  onChange: (patch: Partial<AreaPlacementValue>) => void;
};

export default function AreaPlacementEditor({ modelKind, areaKey, modelUrl, baseColor = "#0F172A", value, onChange }: Props) {
  const [view, setView] = useState<CameraView>("front");
  const [pickMode, setPickMode] = useState(false);

  const previewBox = useMemo(
    () => {
      const fallback = defaultAreaAnchor(modelKind, areaKey);
      const unset = [value.position_x, value.position_y, value.position_z, value.rotation_x, value.rotation_y, value.rotation_z]
        .every((part) => Math.abs(Number(part) || 0) < 0.0001);
      return {
        position: unset ? fallback.pos : [value.position_x, value.position_y, value.position_z] as [number, number, number],
        rotationEuler: unset ? fallback.rotation : [value.rotation_x, value.rotation_y, value.rotation_z] as [number, number, number],
        width: value.visual_area_width,
        height: value.visual_area_height,
        color: "#0057B8",
      };
    },
    [value, modelKind, areaKey],
  );

  const handlePick = (info: { point: [number, number, number]; normalEuler: [number, number, number] }) => {
    if (!pickMode) return;
    onChange({
      position_x: Number(info.point[0].toFixed(3)),
      position_y: Number(info.point[1].toFixed(3)),
      position_z: Number(info.point[2].toFixed(3)),
      rotation_x: Number(info.normalEuler[0].toFixed(3)),
      rotation_y: Number(info.normalEuler[1].toFixed(3)),
      rotation_z: Number(info.normalEuler[2].toFixed(3)),
    });
    setPickMode(false);
  };

  const applyPreset = (p: Preset) => {
    onChange({ ...p.value });
    setView(p.view);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs flex items-start gap-2">
        <MousePointerClick className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-foreground">Editor visual</p>
          <p className="text-muted-foreground mt-0.5">
            Escolha um preset ou active o modo de clique e toque no modelo 3D para posicionar a zona. Depois
            ajuste largura e altura da caixa.
          </p>
        </div>
      </div>

      {/* Presets */}
      {modelKind === "tshirt" && (
        <div>
          <Label className="text-xs uppercase tracking-wider">Presets</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {TSHIRT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                className="h-9 rounded-lg border border-border/60 bg-background text-xs font-medium hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={pickMode ? "default" : "outline"}
          onClick={() => setPickMode((v) => !v)}
          className="h-8"
        >
          <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />
          {pickMode ? "A aguardar clique…" : "Clicar no modelo"}
        </Button>
        <div className="flex items-center gap-1">
          {(["front", "back", "left", "right", "iso"] as CameraView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-2 h-8 rounded-md text-[11px] uppercase tracking-wider border transition-all",
                view === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background hover:border-primary/40",
              )}
            >
              {v === "front" ? "Fr." : v === "back" ? "Co." : v === "left" ? "Esq." : v === "right" ? "Dir." : "3/4"}
            </button>
          ))}
        </div>
      </div>

      {/* 3D canvas */}
      <div className={cn("relative", pickMode && "ring-2 ring-primary rounded-2xl")}>
        <Product3DPreview
          modelKind={modelKind}
          modelUrl={modelUrl}
          baseColor={baseColor}
          decals={[]}
          view={view}
          onPickPoint={handlePick}
          previewBox={previewBox}
          className="w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-brand-navy/10 via-primary/5 to-transparent border border-border/40"
        />
        {pickMode && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] uppercase tracking-wider shadow">
              Clique num ponto da malha
            </span>
          </div>
        )}
      </div>

      {/* Size sliders */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <Label>Largura da caixa</Label>
            <span className="font-mono">{value.visual_area_width.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.9}
            step={0.01}
            value={value.visual_area_width}
            onChange={(e) => onChange({ visual_area_width: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <Label>Altura da caixa</Label>
            <span className="font-mono">{value.visual_area_height.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.9}
            step={0.01}
            value={value.visual_area_height}
            onChange={(e) => onChange({ visual_area_height: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Rotation nudges */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs uppercase tracking-wider">Rotação fina</Label>
          <button
            type="button"
            onClick={() =>
              onChange({
                rotation_x: 0,
                rotation_y: 0,
                rotation_z: 0,
              })
            }
            className="text-[10px] text-primary inline-flex items-center gap-1 hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Zerar
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          {(["rotation_x", "rotation_y", "rotation_z"] as const).map((k) => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground uppercase">{k.split("_")[1]}</span>
                <span className="font-mono">
                  {((value[k] * 180) / Math.PI).toFixed(0)}°
                </span>
              </div>
              <input
                type="range"
                min={-Math.PI}
                max={Math.PI}
                step={0.05}
                value={value[k]}
                onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<AreaPlacementValue>)}
                className="w-full accent-primary"
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        A caixa azul mostra a zona permitida onde o design do cliente pode ser posicionado. Presets
        aplicam posições típicas do produto; use o clique para afinações rápidas.
      </p>
    </div>
  );
}

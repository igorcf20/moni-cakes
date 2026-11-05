import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Lightbulb } from "lucide-react";

type DesignLike = {
  id: string;
  name: string;
  widthPx: number;
  dpi: number | null;
};
type ItemLike = {
  designId: string;
  widthCm: number;
};

export type PrintQualityCopy = {
  low_dpi_threshold?: number;
  warning_dpi_threshold?: number;
  low_dpi_title?: string;
  low_dpi_body?: string;
  low_dpi_checkbox?: string;
  upscale_title?: string;
  upscale_body?: string;
  upscale_checkbox?: string;
  plano_low_dpi_title?: string;
  plano_low_dpi_body?: string;
  plano_low_dpi_checkbox?: string;
};

const DEFAULTS: Required<PrintQualityCopy> = {
  low_dpi_threshold: 300,
  warning_dpi_threshold: 200,
  low_dpi_title: "Imagem com resolução inferior ao recomendado",
  low_dpi_body:
    "A arte carregada tem uma resolução inferior ao recomendado para impressão.\n\nSe continuar, a impressão poderá apresentar perda de nitidez, píxeis visíveis, contornos menos definidos ou qualidade inferior ao esperado.\n\nPode continuar por sua responsabilidade ou cancelar e carregar uma nova versão da arte com melhor qualidade.",
  low_dpi_checkbox:
    "Confirmo que compreendo que esta arte tem resolução inferior ao recomendado e aceito continuar com possível perda de qualidade na impressão.",
  upscale_title: "A arte foi ampliada além do recomendado",
  upscale_body:
    "Ampliou a arte a um tamanho em que o DPI efetivo fica abaixo do mínimo recomendado. A impressão pode perder detalhe e nitidez.\n\nPode continuar por sua responsabilidade ou cancelar e ajustar a dimensão da arte.",
  upscale_checkbox:
    "Confirmo que compreendo o risco e aceito ampliar esta arte além do limite recomendado.",
  plano_low_dpi_title: "O plano final será impresso abaixo do DPI recomendado",
  plano_low_dpi_body:
    "Este plano é grande o suficiente para que o ficheiro final de impressão fique abaixo do DPI recomendado, mesmo quando as artes individuais têm boa resolução.\n\nA impressão pode perder detalhe, especialmente em texto pequeno e linhas finas.\n\nPode continuar por sua responsabilidade ou reduzir o tamanho do plano.",
  plano_low_dpi_checkbox:
    "Confirmo que compreendo que o plano será impresso abaixo do DPI recomendado devido ao seu tamanho e aceito continuar por minha responsabilidade.",
};

/**
 * Watches the active configurator state and prompts the customer with an
 * admin-editable acceptance term whenever:
 *  - A design is added with declared DPI below the minimum (low_dpi case)
 *  - A placed item is scaled up so the effective DPI drops below the
 *    upscale warning threshold (upscale case)
 *
 * The customer must tick the acceptance checkbox to continue. Acceptance
 * is remembered per design id so the dialog doesn't re-open after each
 * small adjustment. No state outside this component is mutated — when the
 * user cancels, we simply re-open the dialog on the next change.
 */
type PlanoLike = {
  id: string;
  name: string;
  effDpi: number;
};

const PrintQualityGuard = ({
  designs, items, planos, copy, onAccept, onCancel, onPendingChange,
}: {
  designs: DesignLike[];
  items: ItemLike[];
  planos?: PlanoLike[];
  copy?: PrintQualityCopy;
  onAccept?: (acceptance: {
    designId: string;
    designName: string;
    kind: "low" | "upscale" | "plano";
    effDpi: number;
    threshold: number;
    acceptedAt: string;
  }) => void;
  onCancel?: (info: { designId: string; kind: "low" | "upscale" | "plano" }) => void;
  onPendingChange?: (pending: boolean) => void;
}) => {
  const cfg: Required<PrintQualityCopy> = { ...DEFAULTS, ...(copy || {}) };
  const [accepted, setAccepted] = useState<Record<string, "low" | "upscale" | "both">>({});
  // Separate acceptance memory for planos, keyed by plano id.
  const [planoAccepted, setPlanoAccepted] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<{
    designId: string;
    designName?: string;
    kind: "low" | "upscale" | "plano";
    effDpi: number;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  const closeIntentRef = useRef<"accept" | "cancel" | null>(null);

  const cancelPending = () => {
    if (!pending) return;
    closeIntentRef.current = "cancel";
    onCancel?.({ designId: pending.designId, kind: pending.kind });
    setPending(null);
    setChecked(false);
  };

  const trigger = useMemo(() => {
    for (const d of designs) {
      // Case A — DPI not declared in the file. Treat like low so the customer
      // explicitly assumes responsibility for the final print quality.
      if (d.dpi == null && accepted[d.id] !== "low" && accepted[d.id] !== "both") {
        const placed = items.find((i) => i.designId === d.id);
        const effDpi = placed && placed.widthCm > 0
          ? Math.round((d.widthPx / placed.widthCm) * 2.54)
          : 0;
        // Skip when the effective DPI at the placed size is already at or
        // above the minimum — the file may lack a declared DPI but prints fine.
        if (effDpi === 0 || effDpi + 1 < cfg.low_dpi_threshold) {
          return { designId: d.id, kind: "low" as const, effDpi };
        }
        continue;
      }
      // Case B — declared DPI clearly below minimum (tolerate 1 dpi rounding
      // so files exported as 299.x/300 do not trigger a false positive).
      if (d.dpi != null && d.dpi + 1 < cfg.low_dpi_threshold && accepted[d.id] !== "low" && accepted[d.id] !== "both") {
        const placed = items.find((i) => i.designId === d.id);
        const effDpi = placed && placed.widthCm > 0
          ? Math.round((d.widthPx / placed.widthCm) * 2.54)
          : d.dpi;
        return { designId: d.id, kind: "low" as const, effDpi };
      }
    }
    for (const it of items) {
      const d = designs.find((x) => x.id === it.designId);
      if (!d || !d.widthPx || !it.widthCm) continue;
      const effDpi = Math.round((d.widthPx / it.widthCm) * 2.54);
      const declared = d.dpi ?? 0;
      const isGoodSource = declared >= cfg.low_dpi_threshold;
      if (isGoodSource && effDpi < cfg.warning_dpi_threshold) {
        if (accepted[d.id] === "upscale" || accepted[d.id] === "both") continue;
        return { designId: d.id, kind: "upscale" as const, effDpi };
      }
    }
    // Case C — the plano itself will render at less than the minimum DPI
    // because its physical dimensions exceed the canvas budget. This can
    // happen even when every individual art declares ≥ 300 dpi.
    for (const p of planos || []) {
      if (planoAccepted[p.id]) continue;
      // Tolerate up to 10 dpi rounding — the tiled PNG renderer entregas
      // ~290 dpi in edge cases even when the true target is 300, and we
      // don't want a false alarm for a visually indistinguishable delta.
      if (p.effDpi > 0 && p.effDpi + 10 < cfg.low_dpi_threshold) {
        return { designId: p.id, designName: p.name, kind: "plano" as const, effDpi: p.effDpi };
      }
    }
    return null;
  }, [designs, items, planos, cfg, accepted, planoAccepted]);

  useEffect(() => {
    if (trigger && !pending) {
      setPending(trigger);
      setChecked(false);
    }
  }, [trigger, pending]);

  useEffect(() => { onPendingChange?.(!!pending); }, [pending, onPendingChange]);

  if (!pending) return null;
  const isPlano = pending.kind === "plano";
  const isLow = pending.kind === "low";
  const title = isPlano ? cfg.plano_low_dpi_title : isLow ? cfg.low_dpi_title : cfg.upscale_title;
  const body = isPlano ? cfg.plano_low_dpi_body : isLow ? cfg.low_dpi_body : cfg.upscale_body;
  const cbLabel = isPlano ? cfg.plano_low_dpi_checkbox : isLow ? cfg.low_dpi_checkbox : cfg.upscale_checkbox;

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => {
      if (!o && pending) {
        const intent = closeIntentRef.current;
        closeIntentRef.current = null;
        if (intent === "accept") return;
        if (intent !== "cancel") {
          onCancel?.({ designId: pending.designId, kind: pending.kind });
        }
        setPending(null);
        setChecked(false);
      }
    }}>
      <AlertDialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <AlertDialogTitle className="text-left text-base sm:text-lg">{title}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line text-left mt-1 text-xs sm:text-sm">
                {body}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">DPI detetado</p>
            <p className="font-mono font-semibold text-amber-700 dark:text-amber-300">{pending.effDpi} dpi</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">DPI recomendado</p>
            <p className="font-mono font-semibold">≥ {cfg.low_dpi_threshold} dpi</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed">
          <p className="font-semibold flex items-center gap-1.5 mb-2 text-sm">
            <Lightbulb className="h-4 w-4 text-primary" /> Como melhorar a qualidade da arte
          </p>
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            <li>Exporte novamente a arte com 300 dpi ou superior.</li>
            <li>Use o tamanho final correto em centímetros antes de exportar.</li>
            <li>Evite ampliar uma imagem pequena, pois não melhora a qualidade real.</li>
            <li>Em Canva, Photoshop, Illustrator ou CorelDRAW, confirme as definições de exportação.</li>
            <li>Prefira ficheiros PNG com fundo transparente, quando aplicável.</li>
            <li>Evite capturas de ecrã, imagens de redes sociais ou ficheiros muito comprimidos.</li>
            <li>Se a arte tiver texto pequeno, confirme se está nítida no tamanho real de impressão.</li>
          </ul>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer select-none rounded-lg border border-border/60 p-3 bg-background hover:bg-muted/30 transition-colors">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(Boolean(v))} className="mt-0.5" />
          <span>{cbLabel}</span>
        </label>
        <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
          <AlertDialogCancel
            className="w-full sm:w-auto mt-0"
            onClick={() => {
              cancelPending();
            }}
          >Cancelar e carregar outra arte</AlertDialogCancel>
          <AlertDialogAction
            disabled={!checked}
            className="w-full sm:w-auto"
            onClick={() => {
              closeIntentRef.current = "accept";
              const d = designs.find((x) => x.id === pending.designId);
              const displayName = pending.designName || d?.name || pending.designId;
              onAccept?.({
                designId: pending.designId,
                designName: displayName,
                kind: pending.kind,
                effDpi: pending.effDpi,
                threshold: cfg.low_dpi_threshold,
                acceptedAt: new Date().toISOString(),
              });
              if (pending.kind === "plano") {
                setPlanoAccepted((prev) => ({ ...prev, [pending.designId]: true }));
              } else {
                setAccepted((prev) => {
                  const cur = prev[pending.designId];
                  const next: "low" | "upscale" | "both" =
                    cur && cur !== (pending.kind as "low" | "upscale") ? "both" : (pending.kind as "low" | "upscale");
                  return { ...prev, [pending.designId]: next };
                });
              }
              setPending(null);
              setChecked(false);
            }}
          >
            Aceitar e continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PrintQualityGuard;
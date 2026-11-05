import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, AlertTriangle, Check, X, CheckSquare, Square } from "lucide-react";

export type RollVerificationPlano = {
  id: string;
  name: string;
  designNames: string[];
  copies: number;
};

export type RollVerificationDecision = {
  planoId: string;
  planoName: string;
  verify: boolean;
  fee: number;        // per-roll fee at decision time (× copies)
  feeBase: number;    // per-roll-copy base fee
  copies: number;
  declinedAt?: string;
  warningSnapshot?: string;
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

const RollVerificationDialog = ({
  open,
  planos,
  pricePerRoll,
  description,
  declineWarning,
  onCancel,
  onConfirm,
  initialChoices,
  confirmLabel,
}: {
  open: boolean;
  planos: RollVerificationPlano[];
  pricePerRoll: number;
  description: string;
  declineWarning: string;
  onCancel: () => void;
  onConfirm: (decisions: RollVerificationDecision[]) => void;
  /** Pre-fill per-plano choices (used when re-opening from the cart). */
  initialChoices?: Record<string, boolean>;
  /** Overrides the primary confirm button label (defaults to "Adicionar ao carrinho"). */
  confirmLabel?: string;
}) => {
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState(false);
  const prevOpenRef = useRef(false);

  // Only reset state when the modal transitions from closed → open. This
  // prevents parent re-renders (which recreate the `planos` array reference)
  // from wiping the customer's current selections while the modal is visible.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;
    const next: Record<string, boolean> = {};
    for (const p of planos) {
      // Default all planos to UNCHECKED so the customer must make an explicit
      // decision after reading the terms. When re-opening from the cart with
      // an explicit prior decision, preserve it.
      next[p.id] = initialChoices ? initialChoices[p.id] === true : false;
    }
    setChoices(next);
    setAccepted(false);
  }, [open, planos, initialChoices]);

  // When the visible list of planos changes while the modal is open (rare —
  // e.g. a plano gets a new copy count), keep every known choice but add
  // any missing plano with the default (verify = true).
  useEffect(() => {
    if (!open) return;
    setChoices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of planos) {
        if (!(p.id in next)) {
          next[p.id] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, planos]);

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    for (const p of planos) next[p.id] = true;
    setChoices(next);
  };
  const clearAll = () => {
    const next: Record<string, boolean> = {};
    for (const p of planos) next[p.id] = false;
    setChoices(next);
  };

  const decisions: RollVerificationDecision[] = useMemo(() => {
    return planos.map((p) => {
      const verify = choices[p.id] !== false;
      const copies = Math.max(1, p.copies || 1);
      const feeBase = Number(pricePerRoll || 0);
      return {
        planoId: p.id,
        planoName: p.name,
        verify,
        feeBase,
        copies,
        fee: verify ? +(feeBase * copies).toFixed(2) : 0,
      };
    });
  }, [planos, choices, pricePerRoll]);

  const totalFee = useMemo(
    () => +decisions.reduce((s, d) => s + d.fee, 0).toFixed(2),
    [decisions],
  );
  const someDeclined = decisions.some((d) => !d.verify);
  const canContinue = !someDeclined || accepted;
  const verifyingCount = decisions.filter((d) => d.verify).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <span>Verificação opcional dos ficheiros</span>
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line text-left">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1.5">Incluído na taxa</p>
            <ul className="space-y-1 text-xs text-foreground/90">
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" /> Análise técnica do ficheiro (resolução, transparência, contornos, legibilidade)</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" /> Aviso prévio se detetarmos qualidade insuficiente — antes de imprimir</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" /> Possibilidade de enviares um novo ficheiro sem custo extra de impressão</li>
            </ul>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-1.5">Não incluído</p>
            <ul className="space-y-1 text-xs text-foreground/90">
              <li className="flex items-start gap-1.5"><X className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" /> Correção, redesenho ou edição da arte</li>
              <li className="flex items-start gap-1.5"><X className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" /> Substituição automática por imagem de melhor qualidade</li>
              <li className="flex items-start gap-1.5"><X className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" /> Reembolso após a impressão por problemas do ficheiro original</li>
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          Valor por rolo: <span className="font-semibold text-foreground">{fmtEUR(pricePerRoll)}</span> — valor sem IVA. O IVA é acrescido no carrinho. Para rolos com mais de 1 cópia, o valor é multiplicado pelo número de cópias.
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{verifyingCount}</span> de {planos.length} rolo(s) com verificação
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              onClick={selectAll}
            >
              <CheckSquare className="h-3 w-3" /> Marcar todos
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              onClick={clearAll}
            >
              <Square className="h-3 w-3" /> Remover todos
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {planos.map((p) => {
            const verify = choices[p.id] !== false;
            const copies = Math.max(1, p.copies || 1);
            const lineFee = verify ? +(Number(pricePerRoll || 0) * copies).toFixed(2) : 0;
            return (
              <label
                key={p.id}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <Checkbox
                  checked={verify}
                  onCheckedChange={(v) =>
                    setChoices((prev) => ({ ...prev, [p.id]: Boolean(v) }))
                  }
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className={`text-xs font-mono ${verify ? "text-primary" : "text-muted-foreground line-through"}`}>
                      +{fmtEUR(lineFee)}
                    </p>
                  </div>
                  {p.designNames.length > 0 && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {p.designNames.join(" · ")}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {copies > 1 ? `${copies} cópias` : "1 cópia"} ·{" "}
                    {verify ? "Verificação contratada" : "Sem verificação"}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {someDeclined && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs whitespace-pre-line text-amber-900 dark:text-amber-200">
                {declineWarning}
              </p>
            </div>
            <label className="flex items-start gap-2 text-xs cursor-pointer select-none rounded-md p-2 bg-background border border-border/60">
              <Checkbox
                checked={accepted}
                onCheckedChange={(v) => setAccepted(Boolean(v))}
                className="mt-0.5"
              />
              <span>
                Confirmo que assumo total responsabilidade pela qualidade, legibilidade e adequação à impressão dos ficheiros entregues nos rolos sem verificação.
              </span>
            </label>
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total da verificação (sem IVA — IVA acrescido no carrinho)</span>
          <span className="font-semibold">{fmtEUR(totalFee)}</span>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">Voltar</Button>
          <Button
            disabled={!canContinue}
            className="w-full sm:w-auto"
            onClick={() => {
              const stamp = new Date().toISOString();
              const out = decisions.map((d) =>
                d.verify ? d : { ...d, declinedAt: stamp, warningSnapshot: declineWarning },
              );
              onConfirm(out);
            }}
          >
            {confirmLabel || "Adicionar ao carrinho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RollVerificationDialog;
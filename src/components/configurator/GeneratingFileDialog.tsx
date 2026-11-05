import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, XCircle } from "lucide-react";

type Props = {
  open: boolean;
  progress: number;
  stepLabel: string;
  planoCurrent?: number;
  planoTotal?: number;
  error?: string | null;
  onClose?: () => void;
  /** Milliseconds since generation started. */
  elapsedMs?: number;
  /** Milliseconds estimated to finish. Hidden while unknown. */
  etaMs?: number | null;
};

const fmtDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function GeneratingFileDialog({
  open,
  progress,
  stepLabel,
  planoCurrent,
  planoTotal,
  error,
  onClose,
  elapsedMs,
  etaMs,
}: Props) {
  const blocked = !error;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !blocked && onClose) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => {
          if (blocked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (blocked) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (blocked) e.preventDefault();
        }}
      >
        {error ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <div>
                <h2 className="font-heading text-lg">Erro a gerar o ficheiro</h2>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Loader2 className="h-6 w-6 text-primary animate-spin shrink-0 mt-0.5" />
              <div>
                <h2 className="font-heading text-lg leading-tight">
                  A gerar ficheiro de impressão
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {stepLabel}
                  {planoTotal && planoTotal > 0 && planoCurrent
                    ? ` — plano ${planoCurrent} de ${planoTotal}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Progress value={progress} className="h-2.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  {typeof elapsedMs === "number" ? `Decorrido ${fmtDuration(elapsedMs)}` : ""}
                  {typeof etaMs === "number" && etaMs > 0
                    ? ` · ~${fmtDuration(etaMs)} restantes`
                    : ""}
                </span>
                <span>{Math.min(100, Math.max(0, Math.round(progress)))}%</span>
              </div>
            </div>

            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-[13px] leading-relaxed text-amber-900 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold">
                    Porque é que pode demorar?
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      O ficheiro de impressão é gerado <strong>no seu
                      dispositivo</strong> em alta resolução (300 DPI), o que
                      exige processamento das imagens uma a uma.
                    </li>
                    <li>
                      Artes grandes, com muitas cópias ou vários planos
                      aumentam significativamente o tempo de geração.
                    </li>
                    <li>
                      Telemóveis e computadores mais antigos, ou com pouca
                      memória disponível, demoram mais que um computador
                      recente.
                    </li>
                    <li>
                      No fim, os ficheiros são <strong>enviados para o nosso
                      servidor</strong> — a velocidade e estabilidade da sua
                      ligação à internet (Wi-Fi/dados móveis) influenciam
                      diretamente esta fase.
                    </li>
                    <li>
                      O navegador pode ficar momentaneamente lento ou parecer
                      travado — é normal, está a trabalhar.
                    </li>
                  </ul>
                  <p className="font-semibold pt-1">
                    Não feche, não recarregue, nem mude de separador até
                    concluir. Se possível, mantenha o ecrã ligado.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
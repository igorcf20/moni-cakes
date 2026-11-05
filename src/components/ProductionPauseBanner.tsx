import { useEffect, useState } from "react";
import { CalendarOff, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import {
  isProductionPauseActive,
  formatPauseRange,
  formatReturnDate,
  resolveText,
  pauseSessionKey,
  type ProductionPauseConfig,
} from "@/lib/productionPause";
import { useMessages } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";

const ProductionPauseBanner = () => {
  const { data: settings } = useVisualSettings();
  const { t, locale } = useMessages(paymentsMessages);
  const cfg = (settings?.plugins as any)?.production_pause as ProductionPauseConfig | undefined;
  const active = isProductionPauseActive(cfg);

  const [modalOpen, setModalOpen] = useState(false);
  const [barDismissed, setBarDismissed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const seen = sessionStorage.getItem(pauseSessionKey(cfg));
    if (!seen) setModalOpen(true);
  }, [active, cfg?.start_date, cfg?.end_date]);

  if (!active || !cfg) return null;

  const title = cfg.title || t("pauseTitle");
  const range = formatPauseRange(cfg, locale);
  const back = formatReturnDate(cfg, locale);
  const message = resolveText(cfg.message, cfg, locale) || t("pauseMessage", { range, date: back });

  const handleClose = () => {
    sessionStorage.setItem(pauseSessionKey(cfg), "1");
    setModalOpen(false);
  };

  return (
    <>
      {!barDismissed && (
        <div className="w-full bg-amber-500/95 text-black text-xs sm:text-sm">
          <div className="container mx-auto px-4 py-2 flex items-center gap-3">
            <CalendarOff className="h-4 w-4 shrink-0" />
            <p className="flex-1 leading-snug">
              <strong>{cfg.reason || t("pauseReason")}:</strong>{" "}
              {t("pauseBar", { range, date: back })}
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="hidden sm:inline text-xs font-semibold underline hover:no-underline"
            >
              {t("pauseMore")}
            </button>
            <button
              type="button"
              aria-label={t("pauseClose")}
              onClick={() => setBarDismissed(true)}
              className="p-1 rounded hover:bg-black/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-2">
              <CalendarOff className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">{title}</DialogTitle>
            <DialogDescription className="text-center whitespace-pre-line">
              {message}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-center space-y-1">
            <p className="text-muted-foreground">{t("pausePeriod")}</p>
            <p className="font-semibold">{range}</p>
            <p className="text-xs text-muted-foreground pt-1">{t("pauseBack")} <strong>{back}</strong></p>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={handleClose}>{t("pauseOk")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductionPauseBanner;
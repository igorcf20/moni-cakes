// Peças pequenas do Admin > Avaliações: estrelas (mostrar e escolher), confirmação na própria página (sem janela)
// e nome da origem de uma avaliação.
import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewSource } from "@/hooks/useAdminReviews";
import type { AdminReviewsKey } from "@/i18n/adminReviews";

type T = (key: AdminReviewsKey, vars?: Record<string, string | number>) => string;

export const sourceLabel = (t: T, source: ReviewSource | string) => t(`src_${source}` as AdminReviewsKey);

export function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= value ? "fill-primary text-primary" : "text-border")} strokeWidth={1.7} aria-hidden="true" />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange, label, t }: { value: number; onChange: (n: number) => void; label: string; t: T }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("rating_value", { n })}
          onClick={() => onChange(n)}
          className="grid h-10 w-10 place-items-center rounded-xl transition-colors duration-150 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={cn("h-6 w-6", n <= value ? "fill-primary text-primary" : "text-muted-foreground/40")} strokeWidth={1.7} />
        </button>
      ))}
      <span className="ml-2 text-sm tabular-nums text-muted-foreground">{t("rating_value", { n: value })}</span>
    </div>
  );
}

/** Botão Apagar que pede confirmação na própria página (faixa vermelha), nunca numa janela. */
export function DeleteWithConfirm({ t, busy, onConfirm }: { t: T; busy: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setAsking(true)}>
        <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("delete")}
      </Button>
    );
  }
  return (
    <div role="alert" className="flex w-full flex-col gap-3 rounded-[14px] border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-destructive">{t("delete_confirm")}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setAsking(false)} disabled={busy}>{t("cancel")}</Button>
        <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>{t("delete_yes")}</Button>
      </div>
    </div>
  );
}

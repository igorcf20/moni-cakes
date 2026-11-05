// Pré-venda (recurso preorders): bloco da página do produto, selo dos cartões e selo das linhas (carrinho, checkout,
// pedidos). O servidor decide se a linha é de pré-venda; aqui só se mostra.
import { CalendarClock } from "lucide-react";
import { useMessages } from "@/i18n";
import { preordersMessages } from "@/i18n/preorders";
import { formatReleaseDate, preorderNote, type PublicPreorder } from "@/lib/preorders";
import { cn } from "@/lib/utils";

export function PreorderPanel({ preorder }: { preorder: PublicPreorder }) {
  const { t, locale } = useMessages(preordersMessages);
  const note = preorderNote(preorder.note_i18n, locale);
  const left = preorder.remaining;
  return (
    <div role="note" className="flex items-start gap-3 rounded-[16px] border border-primary/25 bg-accent/60 p-4">
      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
          <span className="rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">{t("badge")}</span>
          {preorder.release_date ? t("ships_from", { date: formatReleaseDate(preorder.release_date, locale) }) : t("ships_soon")}
        </p>
        <p className="text-[14px] text-muted-foreground">{note || t("text")}</p>
        {left != null && (
          <p className="text-[13px] font-semibold text-brand-orange-text">
            {left === 0 ? t("sold_out") : left === 1 ? t("remaining_one") : t("remaining_other", { count: left })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Selo pequeno: cartão do produto (sem data) ou linha do carrinho e do pedido (com data, se houver). */
export function PreorderChip({ releaseDate, withDate = true, className }: { releaseDate?: string | null; withDate?: boolean; className?: string }) {
  const { t, locale } = useMessages(preordersMessages);
  const label = withDate && releaseDate ? t("chip_date", { date: formatReleaseDate(releaseDate, locale, true) }) : t("chip");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg bg-brand-orange-soft px-2 py-1 text-[12px] font-semibold leading-none text-brand-orange-text", className)}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />{label}
    </span>
  );
}

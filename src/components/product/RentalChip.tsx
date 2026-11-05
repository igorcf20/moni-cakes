// Selo do aluguel (design_data.rental): datas e períodos, no carrinho, na conta e no pedido do Admin.
import { CalendarRange } from "lucide-react";
import { useMessages } from "@/i18n";
import { periodsText, rentalRangeText, rentalsMessages } from "@/i18n/rentals";
import { cn } from "@/lib/utils";

export function RentalChip({ rental, className }: { rental: { start?: string; end?: string; unit?: string; periods?: number }; className: string }) {
  const { t, locale } = useMessages(rentalsMessages);
  return (
    <li className={cn(className, "items-start bg-brand-orange-soft text-brand-orange-text")}>
      <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="leading-snug">
        <span className="font-semibold">{rentalRangeText(t, locale, rental)}</span>
        {Number(rental.periods) > 0 && <> · {periodsText(t, String(rental.unit), Number(rental.periods))}</>}
      </span>
    </li>
  );
}

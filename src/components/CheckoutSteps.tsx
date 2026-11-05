import { Check } from "lucide-react";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { cn } from "@/lib/utils";

const STEPS = ["stepCart", "stepDelivery", "stepPayment"] as const;

// Etapas discretas da compra (Carrinho > Entrega > Pagamento), usadas no carrinho e no checkout.
const CheckoutSteps = ({ current, className }: { current: 1 | 2 | 3; className?: string }) => {
  const { t } = useMessages(cartMessages);
  return (
    <nav aria-label={t("stepsLabel")} className={className}>
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((key, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={key} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums transition-colors duration-200",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !active && "border border-border bg-white text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : n}
              </span>
              {/* no celular só o passo atual mostra o nome (os outros ficam para leitores de tela), para caber em 320px */}
              <span className={cn("text-[13px]", active ? "font-semibold text-foreground" : "text-muted-foreground max-sm:sr-only")}>
                {t(key)}
                {done && <span className="sr-only"> ({t("stepDone")})</span>}
              </span>
              {n < STEPS.length && (
                <span className={cn("h-px w-5 sm:w-10", done ? "bg-primary/60" : "bg-border")} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default CheckoutSteps;

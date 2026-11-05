// Campo de vale-presente do checkout (recurso gift_cards em Admin > Recursos da loja). O código é validado no
// servidor (check_gift_card, com sessão e limite de tentativas) e o desconto é recalculado no create-order; aqui
// só o visual. Textos em src/i18n/giftCards.ts.
import { useId, useState } from "react";
import { CheckCircle2, Gift, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { useAppliedGiftCard } from "@/hooks/useGiftCards";
import { giftCodeTail } from "@/lib/giftCards";
import { useMessages } from "@/i18n";
import { giftCardsMessages } from "@/i18n/giftCards";

export default function GiftCardInput({ applied: amount, money }: { applied: number; money: (v: number) => string }) {
  const { t } = useMessages(giftCardsMessages);
  const on = useFeature("gift_cards");
  const { user } = useAuth();
  const id = useId();
  const { applied, apply, isChecking, remove } = useAppliedGiftCard();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!on || !user) return null;

  const submit = async () => {
    if (!code.trim() || isChecking) return;
    setError(null);
    try {
      await apply(code);
      setCode("");
    } catch (e) {
      const k = e instanceof Error ? e.message : "error";
      setError(t(`e_${k}` as "e_error"));
    }
  };

  if (applied) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 py-1.5 pl-3.5 pr-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-700" strokeWidth={1.9} aria-hidden="true" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[14px] font-semibold text-emerald-800" aria-live="polite">{t("applied", { tail: giftCodeTail(applied.code) })}</p>
            <p className="text-[13px] tabular-nums text-emerald-700">{t("using", { amount: money(amount), balance: money(applied.balance) })}</p>
          </div>
        </div>
        <button type="button" onClick={remove} aria-label={t("remove")} title={t("remove")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-brand-orange-text underline-offset-4 hover:underline">
        <Gift className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("have")}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[14px] font-semibold text-foreground">{t("label")}</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Gift className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
          <Input
            id={id} value={code} placeholder={t("placeholder")} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
            aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
            className="h-12 rounded-[14px] border-border bg-white pl-10 text-[15px] uppercase placeholder:normal-case"
          />
        </div>
        <button
          type="button" onClick={() => void submit()} disabled={isChecking || !code.trim()}
          className="inline-flex h-12 min-w-[96px] shrink-0 items-center justify-center rounded-[14px] border border-border bg-white px-4 text-[15px] font-semibold text-foreground transition-[border-color,color,transform] duration-150 hover:border-primary hover:text-brand-orange-text active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t("apply")}
        </button>
      </div>
      {error && <p id={`${id}-err`} className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// Avise-me quando chegar: aparece na página do produto esgotado (recurso stock_alerts em Admin > Recursos da loja).
// O cliente deixa o e-mail (com sessão, já vem preenchido); o pedido vai para public.request_stock_alert, que valida
// e limita. A loja vê a procura em Admin > Avisos de estoque. Textos em src/i18n/stockAlerts.ts.
import { useEffect, useId, useState } from "react";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { useRequestStockAlert } from "@/hooks/useStockAlerts";
import { useCountry } from "@/lib/countries";
import { isAlertEmail, type StockAlertResult } from "@/lib/stockAlerts";
import { useMessages } from "@/i18n";
import { stockAlertsMessages } from "@/i18n/stockAlerts";
import { cn } from "@/lib/utils";

export default function StockAlertForm({ productId }: { productId: string }) {
  const { t, locale } = useMessages(stockAlertsMessages);
  const on = useFeature("stock_alerts");
  const { user } = useAuth();
  const country = useCountry();
  const request = useRequestStockAlert();
  const id = useId();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<StockAlertResult | "error" | null>(null);
  useEffect(() => { if (user?.email) setEmail((e) => e || user.email!); }, [user?.email]);
  useEffect(() => { setResult(null); }, [productId]);

  if (!on) return null;
  const done = result === "ok" || result === "already";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAlertEmail(email)) { setResult("invalid_email"); return; }
    try {
      setResult(await request.mutateAsync({ productId, email: email.trim(), locale, country: country.code }));
    } catch {
      setResult("error");
    }
  };

  if (done) {
    return (
      <p className="flex items-start gap-2.5 rounded-[14px] border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
        {t(result === "ok" ? "r_ok" : "r_already", { email: email.trim() })}
      </p>
    );
  }

  const errorText = result ? t(`r_${result}`) : null;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-[18px] border border-brand-card-border bg-white p-4" noValidate>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <BellRing className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t("title")}
      </p>
      <p className="text-sm text-brand-ink-soft">{t("text")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">{t("email")}</label>
        <input
          id={`${id}-email`} type="email" inputMode="email" autoComplete="email" required maxLength={254}
          value={email} onChange={(e) => { setEmail(e.target.value); if (result) setResult(null); }}
          placeholder={t("placeholder")} aria-invalid={!!errorText} aria-describedby={errorText ? `${id}-err` : undefined}
          className={cn("min-h-12 w-full flex-1 rounded-[14px] border bg-white px-4 text-[15px] outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30", errorText ? "border-destructive" : "border-border")}
        />
        <button type="submit" disabled={request.isPending} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] bg-brand-ink px-5 text-[15px] font-semibold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60">
          {request.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("submit")}
        </button>
      </div>
      {errorText && <p id={`${id}-err`} className="text-sm font-medium text-destructive" role="alert">{errorText}</p>}
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
    </form>
  );
}

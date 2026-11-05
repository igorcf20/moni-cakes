import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Lock, ShieldCheck, CreditCard, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { checkoutMessages } from "@/i18n/checkout";
import { formatPrice } from "@/utils/currency";

interface Props {
  orderId: string;
  total: number;
  onPaid: () => void;
  onCancel?: () => void;
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Viva Smart Checkout: card data never enters this application. A Viva cobra em euros. */
const VivaCardEmbed = ({ orderId, total, onPaid, onCancel }: Props) => {
  const { t } = useMessages(checkoutMessages);
  const [loading, setLoading] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [error, setError] = useState("");

  const preparePayment = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("viva-create-order", {
        body: { orderId },
      });
      if (invokeError) {
        // Non-2xx replies carry a customer-facing `message` (e.g. price check, too many attempts).
        const body = await (invokeError as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.message || invokeError.message);
      }
      if (data?.status === "paid") {
        onPaid();
        return;
      }
      if (!data?.checkoutUrl) throw new Error(data?.error || t("vcNoUrl"));
      setCheckoutUrl(String(data.checkoutUrl));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t("vcError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void preparePayment();
    // orderId identifies the immutable checkout session to prepare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const goToViva = () => {
    if (checkoutUrl) window.location.assign(checkoutUrl);
  };

  return (
    <div className="space-y-5 rounded-[20px] border border-brand-card-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <CreditCard className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-[18px] font-bold leading-tight tracking-[-0.02em]">{t("vcTitle")}</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">{t("vcSub")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("vcPreparing")}
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-[16px] border border-destructive/30 bg-destructive/5 p-4 text-[14px]" role="alert">
          <p className="font-semibold text-destructive">{t("vcErrorTitle")}</p>
          <p className="text-brand-ink-soft">{error}</p>
          <button
            type="button"
            onClick={() => void preparePayment()}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-border bg-white px-4 text-[14px] font-semibold transition-colors duration-150 hover:border-primary hover:text-brand-orange-text ${focusRing}`}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" /> {t("vcRetry")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-[16px] bg-brand-alt px-4 py-3.5">
            <span className="text-[14px] text-brand-ink-soft">{t("vcTotal")}</span>
            <strong className="text-[22px] font-[780] tracking-[-0.02em] tabular-nums">{formatPrice(total, "EUR")}</strong>
          </div>
          <button
            type="button"
            onClick={goToViva}
            className={`group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[16px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] ${focusRing}`}
          >
            <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> {t("vcContinue")} <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
          {onCancel ? (
            <button type="button" className={`mx-auto block min-h-[44px] rounded-lg px-2 text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground ${focusRing}`} onClick={onCancel}>
              {t("vcCancel")}
            </button>
          ) : null}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.8} aria-hidden="true" />
          <span>{t("vcSafety")}</span>
        </p>
        <ul className="flex flex-wrap items-center gap-2" aria-label={t("vcMethods")}>
          {["Visa", "Mastercard", "MB WAY", "Multibanco"].map((method) => (
            <li key={method} className="rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-ink-soft">{method}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default VivaCardEmbed;

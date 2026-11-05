import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Copy, QrCode, ShoppingBag, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PaymentProofUploader from "@/components/PaymentProofUploader";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { formatPrice } from "@/utils/currency";
import { iconBtn } from "./ui";
import { isOnlineGateway, paymentIconOf } from "@/lib/paymentMethods";

type Props = {
  orderId: string;
  paymentMethod: string;
  total: number;
  guestEmail?: string | null;
  paymentProofUrl?: string | null;
  /** "always": mostra sempre o envio do comprovante; "when-required": só se o meio de pagamento o pedir no Admin. */
  proof?: "always" | "when-required";
};

type Row = { label: string; value: string; mono?: boolean; copyable?: boolean };

/** Como pagar um pedido pendente (dados configurados em Admin, Pagamentos; nunca valores de exemplo). */
export const OrderPaymentDetails = ({ orderId, paymentMethod, total, guestEmail, paymentProofUrl, proof = "always" }: Props) => {
  const { t } = useMessages(accountMessages);
  const { currentCurrency, convert } = useCurrency();
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: methods } = await supabase.rpc("get_active_payment_methods" as any);
      const found = (methods as any[] | null)?.find((m) => m.type === paymentMethod) ?? null;
      if (!cancel) setConfig(found);
    })();
    return () => {
      cancel = true;
    };
  }, [paymentMethod]);

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s).then(() => toast.success(t("copied")), () => {});
  };

  const d = config?.details || {};
  const amount = formatPrice(convert(Number(total) || 0), currentCurrency);
  const showProof = proof === "always" || !!d.requires_proof;

  if (paymentMethod === "on_delivery") {
    return (
      <div className="space-y-2 rounded-[16px] border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
          <ShoppingBag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("pay_on_delivery")}
        </p>
        {(d.accepts_cash || d.accepts_card) && (
          <div className="flex flex-wrap gap-2">
            {d.accepts_cash && <span className="rounded-lg bg-white px-2 py-0.5 text-[12px] font-medium text-amber-900">{t("payCash")}</span>}
            {d.accepts_card && <span className="rounded-lg bg-white px-2 py-0.5 text-[12px] font-medium text-amber-900">{t("payCard")}</span>}
          </div>
        )}
        <p className="text-[14px] text-amber-900/80">{d.instrucoes || t("payOnDeliveryText")}</p>
      </div>
    );
  }

  // Pagamento online (Mercado Pago, Stripe, PayPal): paga-se na página de confirmação do pedido, que abre o provedor.
  if (isOnlineGateway(paymentMethod)) {
    const Icon = paymentIconOf(paymentMethod);
    const name = t(paymentMethod === "mercado_pago" ? "pay_mercado_pago" : paymentMethod === "stripe" ? "pay_stripe" : "pay_paypal");
    return (
      <div className="flex flex-col gap-3 rounded-[16px] border border-primary/20 bg-accent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-primary"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <p className="text-[15px] font-semibold leading-tight">{name} <span className="tabular-nums">· {amount}</span></p>
            <p className="text-[13px] text-brand-ink-soft">{t("payOnlineText", { name: paymentMethod === "stripe" ? "Stripe" : name })}</p>
          </div>
        </div>
        <Link to={`/pedido/${orderId}/sucesso`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {t("payOnlineBtn")}<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  let meta: { title: string; icon: ReactNode; rows: Row[]; hint?: string } | null = null;
  if (paymentMethod === "bizum") {
    meta = {
      title: t("pay_bizum"),
      icon: <Smartphone className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />,
      rows: [{ label: t("payPhone"), value: d.telefone, mono: true, copyable: true }, { label: t("payHolder"), value: d.nome_titular }, { label: t("payAmount"), value: amount, mono: true }],
      hint: d.instrucoes || t("payBizumHint"),
    };
  } else if (paymentMethod === "mbway") {
    meta = {
      title: t("pay_mbway"),
      icon: <Smartphone className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />,
      rows: [{ label: t("payPhone"), value: d.telemovel, mono: true, copyable: true }, { label: t("payAmount"), value: amount, mono: true }],
      hint: d.instrucoes || t("payMbwayHint"),
    };
  } else if (paymentMethod === "transfer") {
    meta = {
      title: t("pay_transfer"),
      icon: <Building2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />,
      rows: [
        { label: t("payBank"), value: d.banco },
        { label: "IBAN", value: d.iban, mono: true, copyable: true },
        { label: "BIC/SWIFT", value: d.bic, mono: true, copyable: true },
        { label: t("payHolder"), value: d.nome_titular },
        { label: t("payAmount"), value: amount, mono: true },
      ],
      hint: d.instrucoes,
    };
  } else if (paymentMethod === "multibanco" || paymentMethod === "reference") {
    meta = {
      title: t("pay_multibanco"),
      icon: <Building2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />,
      rows: [
        { label: t("payEntity"), value: d.entidade, mono: true, copyable: true },
        { label: t("payReference"), value: d.referencia_modelo, mono: true, copyable: true },
        { label: t("payAmount"), value: amount, mono: true },
      ],
      hint: d.instrucoes,
    };
  } else if (paymentMethod === "pix") {
    meta = {
      title: t("pay_pix"),
      icon: <QrCode className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />,
      rows: [
        { label: d.tipo_chave ? t("payPixKey", { type: String(d.tipo_chave).toUpperCase() }) : t("payPixKeyGeneric"), value: d.chave_pix, mono: true, copyable: true },
        { label: t("payAmount"), value: amount, mono: true },
      ],
      hint: d.instrucoes,
    };
  }

  if (!meta) return null;
  const rows = meta.rows.filter((r) => r.value && String(r.value).trim());
  // Só o valor (sem dados configurados): o cliente recebe as instruções por e-mail.
  const onlyAmount = rows.every((r) => r.label === t("payAmount"));

  return (
    <div className="overflow-hidden rounded-[16px] border border-primary/20 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-brand-card-border bg-accent px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-primary">{meta.icon}</span>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-orange-text">{t("payHow")}</p>
            <p className="text-[15px] font-semibold leading-tight">{meta.title}</p>
          </div>
        </div>
        <p className="text-[16px] font-bold tabular-nums">{amount}</p>
      </div>
      <div className="space-y-3 p-4">
        {onlyAmount ? (
          <p className="text-[14px] text-brand-ink-soft">{t("payDetailsByEmail")}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 rounded-[12px] border border-brand-card-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <dt className="text-[12px] text-muted-foreground">{r.label}</dt>
                  <dd className={`truncate text-[14px] font-semibold ${r.mono ? "font-mono" : ""}`}>{r.value}</dd>
                </div>
                {r.copyable && (
                  <button type="button" className={iconBtn} onClick={() => copy(String(r.value))} aria-label={t("payCopyLabel", { label: r.label })}>
                    <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </dl>
        )}
        {meta.hint && <p className="text-[13px] text-muted-foreground">{meta.hint}</p>}
        {showProof && <PaymentProofUploader orderId={orderId} guestEmail={guestEmail || null} alreadySubmitted={!!paymentProofUrl} />}
      </div>
    </div>
  );
};

export default OrderPaymentDetails;

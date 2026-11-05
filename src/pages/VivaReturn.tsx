// Retorno do Smart Checkout da Viva (/pagamento/viva/retorno?t=...&s=...): confirma o pagamento no servidor
// (viva-verify-payment) e segue para a confirmação do pedido. Lógica igual à anterior; só textos e visual.
import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { motion, MotionConfig } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages } from "@/i18n";
import { checkoutMessages, type CheckoutKey } from "@/i18n/checkout";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const VivaReturn = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useMessages(checkoutMessages);
  const { data: storeInfo } = useStoreInfo();
  const [messageKey, setMessageKey] = useState<CheckoutKey>("vrChecking");
  const [detail, setDetail] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const transactionId = params.get("t");
    const orderCode = params.get("s");

    const verify = async () => {
      if (!orderCode) {
        setFailed(true);
        setMessageKey("vrNoRef");
        return;
      }
      const { data, error } = await supabase.functions.invoke("viva-verify-payment", {
        body: { transactionId, orderCode },
      });
      if (cancelled) return;
      if (error || !data?.orderId) {
        setFailed(true);
        setMessageKey("vrNotFound");
        // Mensagem do servidor pensada para o cliente, quando existir.
        setDetail(typeof data?.error === "string" ? data.error : "");
        return;
      }
      navigate(`/pedido/${data.orderId}/sucesso${location.search}`, { replace: true });
    };
    void verify();
    return () => { cancelled = true; };
  }, [location.search, navigate]);

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{`${t("vrTitle")} | ${storeInfo?.name || STORE_DEFAULTS.name}`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <div className="shell py-14 md:py-24">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              aria-live="polite"
              className="mx-auto max-w-xl rounded-[24px] border border-brand-card-border bg-white p-8 text-center shadow-[var(--shadow-card)] md:p-12"
            >
              <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${failed ? "bg-destructive/10 text-destructive" : "bg-accent text-primary"}`}>
                {failed
                  ? <AlertCircle className="h-7 w-7" strokeWidth={1.7} aria-hidden="true" />
                  : <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.9} aria-hidden="true" />}
              </span>
              <h1 className="mt-5 text-[30px] font-extrabold leading-tight tracking-[-0.035em] md:text-[36px]">{t("vrTitle")}</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">{t(messageKey)}</p>
              {detail && <p className="mt-2 text-[14px] text-muted-foreground">{detail}</p>}
              {failed && (
                <>
                  <p className="mt-2 text-[14px] text-muted-foreground">{t("vrHelp")}</p>
                  <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link
                      to="/dashboard?tab=pedidos"
                      replace
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] ${focusRing}`}
                    >
                      {t("vrMyOrders")}
                    </Link>
                    <Link
                      to="/"
                      className={`inline-flex min-h-12 items-center justify-center rounded-[14px] border border-border bg-white px-6 text-[15px] font-semibold transition-colors duration-150 hover:border-primary hover:text-brand-orange-text ${focusRing}`}
                    >
                      {t("vrHome")}
                    </Link>
                  </div>
                </>
              )}
            </motion.section>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
};

export default VivaReturn;

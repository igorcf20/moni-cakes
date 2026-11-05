import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";
import { formatPrice } from "@/utils/currency";

interface Coupon {
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase?: number | null;
  /** Teto do desconto (moeda base da loja); vazio = sem teto. */
  max_discount?: number | null;
}

const STORAGE_KEY = "applied_coupon";
const EVENT = "applied_coupon_changed";

const readStored = (): Coupon | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Coupon) : null;
  } catch {
    return null;
  }
};

const writeStored = (c: Coupon | null) => {
  try {
    if (c) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
};

/** Erros conhecidos do servidor (check_coupon) que têm texto próprio no i18n. */
const serverErrorKey = (message: string | undefined) => {
  const m = String(message ?? "");
  if (/demasiadas tentativas|too many/i.test(m)) return "couponTooMany" as const;
  if (/inicie sess[aã]o|sign in|not authenticated/i.test(m)) return "couponLogin" as const;
  return "couponError" as const;
};

export const useCoupon = () => {
  const { t } = useMessages(paymentsMessages);
  const currentCurrency = useCurrency((s) => s.currentCurrency);
  const convert = useCurrency((s) => s.convert);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(() => readStored());
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const sync = () => setAppliedCoupon(readStored());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const validateCoupon = useCallback(async (code: string, totalAmount: number) => {
    setIsValidating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error(t("couponLogin"));
        return null;
      }
      // check_coupon exige sessão e limita tentativas; validate_coupon é o caminho antigo, até a migration correr.
      let { data, error } = await (supabase as any).rpc("check_coupon", { _code: code });
      if (error && (error.code === "PGRST202" || error.code === "42883")) {
        ({ data, error } = await (supabase as any).rpc("validate_coupon", { _code: code }));
      }
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        toast.error(t("couponInvalid"));
        return null;
      }
      const min = Number(row.min_purchase || 0);
      if (min > 0 && totalAmount < min) {
        // min_purchase está na moeda base da loja; o cliente vê o valor na moeda mostrada.
        toast.error(t("couponMinPurchase", { amount: formatPrice(convert(min), currentCurrency) }));
        return null;
      }
      const coupon: Coupon = {
        code: row.code,
        discount_type: row.discount_type,
        discount_value: Number(row.discount_value),
        min_purchase: min,
        max_discount: row.max_discount != null ? Number(row.max_discount) : null,
      };
      writeStored(coupon);
      setAppliedCoupon(coupon);
      toast.success(t("couponApplied", { code: coupon.code }));
      return coupon;
    } catch (e: any) {
      console.error(e);
      toast.error(t(serverErrorKey(e?.message)));
      return null;
    } finally {
      setIsValidating(false);
    }
  }, [t, convert, currentCurrency]);

  const removeCoupon = useCallback((silent: boolean = false) => {
    writeStored(null);
    setAppliedCoupon(null);
    if (!silent) toast.success(t("couponRemoved"));
  }, [t]);

  const calculateDiscount = useCallback(
    (totalAmount: number) => {
      if (!appliedCoupon) return 0;
      const raw =
        appliedCoupon.discount_type === "percentage"
          ? (totalAmount * appliedCoupon.discount_value) / 100
          : appliedCoupon.discount_value;
      // Igual ao servidor (coupon_quote): teto do cupom e nunca acima do subtotal.
      const cap = appliedCoupon.max_discount != null && appliedCoupon.max_discount > 0 ? appliedCoupon.max_discount : Infinity;
      return Math.min(Math.max(0, raw), cap, totalAmount);
    },
    [appliedCoupon]
  );

  return {
    appliedCoupon,
    isValidating,
    validateCoupon,
    removeCoupon,
    calculateDiscount,
  };
};

// Captura do link de afiliado (recurso affiliates): em qualquer página com ?ref=<código>, conta a visita no servidor
// (affiliate_visit) e, se o código valer, guarda-o para o pedido (src/lib/affiliateTracking.ts). Tira o ?ref= do
// endereço para o link não ser partilhado de novo com o código. Não desenha nada.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { useAffiliateSettings } from "@/hooks/useAffiliates";
import { AFFILIATE_PARAM, cleanAffiliateCode } from "@/lib/affiliates";
import { rememberAffiliate } from "@/lib/affiliateTracking";

const seen = new Set<string>();

export default function AffiliateCapture() {
  const on = useFeature("affiliates");
  const { data: settings } = useAffiliateSettings();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!on || !settings) return;
    const params = new URLSearchParams(location.search);
    const raw = params.get(AFFILIATE_PARAM);
    if (raw === null) return;
    const code = cleanAffiliateCode(raw);
    params.delete(AFFILIATE_PARAM);
    const qs = params.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "", hash: location.hash }, { replace: true });
    if (!code || seen.has(code)) return;
    seen.add(code);
    void (supabase as any).rpc("affiliate_visit", { _code: code }).then(({ data }: { data: boolean | null }) => {
      if (data) rememberAffiliate(code, settings.cookie_days);
    });
  }, [on, settings, location.search, location.pathname, location.hash, navigate]);

  return null;
}

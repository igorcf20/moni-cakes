// =====================================================================================
// Botões Entrar com Google / Facebook na entrada da loja (recurso social_login). Só aparecem os provedores
// ligados no serviço de contas (chaves no env do servidor, ver Admin > Segurança da conta). Volta para /auth,
// que leva o cliente para onde ia. Textos em src/i18n/adminSecurity.ts (social_*).
// =====================================================================================
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { useAuthProviders } from "@/hooks/useAdminSecurity";
import { socialProvidersOn, type SocialProvider } from "@/lib/adminSecurity";
import { useMessages } from "@/i18n";
import { adminSecurityMessages } from "@/i18n/adminSecurity";
import { cn } from "@/lib/utils";

const NAME: Record<SocialProvider, string> = { google: "Google", facebook: "Facebook" };

export default function SocialLoginButtons({ redirectTo, className }: { redirectTo: string; className?: string }) {
  const { t } = useMessages(adminSecurityMessages);
  const on = useFeature("social_login");
  const { data: external } = useAuthProviders();
  const providers = socialProvidersOn(external, on);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  if (!providers.length) return null;

  const go = async (p: SocialProvider) => {
    setBusy(p);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p,
      options: { redirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectTo)}` },
    });
    if (error) { setBusy(null); toast.error(t("social_error", { name: NAME[p] })); }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />{t("social_or")}<span className="h-px flex-1 bg-border" />
      </div>
      {providers.map((p) => (
        <button key={p} type="button" onClick={() => go(p)} disabled={!!busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border bg-card px-4 text-[15px] font-semibold transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {busy === p && <Loader2 className="h-4 w-4 animate-spin" />}{t("social_continue", { name: NAME[p] })}
        </button>
      ))}
    </div>
  );
}

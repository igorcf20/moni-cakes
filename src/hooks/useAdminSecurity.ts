// =============================================================================================
// Segurança da conta do Admin. Regras puras em src/lib/adminSecurity.ts.
//   useAdminAccess            admin_access_state (ok, falta o código, falta ativar, não é admin)
//   useMfaFactors             fatores do próprio admin (serviço de contas)
//   useEnrollTotp / useVerifyTotp / useUnenrollFactor   ativar, confirmar e tirar o app autenticador
//   useSecuritySettings / useSaveSecuritySettings       store_settings.security (exigir 2FA de todos)
//   useSecurityOverview / useResetAdminMfa              administradores com 2FA; tirar o 2FA de outro admin
//   useAuthProviders          o que o serviço de contas tem ligado (Google, Facebook)
// Depois de mudar o nível da sessão, tudo é recarregado (as regras do servidor dependem dele).
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { accessState, normalizeSecuritySettings, type AdminAccessState, type SecuritySettings } from "@/lib/adminSecurity";

const sb = supabase as any;

export function useAdminAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin-access", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminAccessState> => {
      const { data, error } = await sb.rpc("admin_access_state");
      // Base sem a função (antes da migration): só o papel conta, como antes.
      if (error) {
        const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user!.id, _role: "admin" });
        return isAdmin ? "ok" : "not_admin";
      }
      return accessState(data);
    },
  });
}

/** Recarrega tudo depois de mudar o nível da sessão (aal1 para aal2) ou os fatores. */
function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useMfaFactors() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mfa-factors", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.all ?? []).filter((f) => f.factor_type === "totp");
    },
  });
}

export function useEnrollTotp() {
  return useMutation({
    mutationFn: async (friendlyName: string) => {
      // Fatores por confirmar de tentativas antigas ficam pelo caminho: limpa antes de criar outro.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `${friendlyName} ${new Date().toISOString().slice(0, 10)}` });
      if (error) throw error;
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
    },
  });
}

export function useVerifyTotp() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useUnenrollFactor() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      // A sessão continua aal2 até renovar o token; renova já para refletir o estado novo.
      await supabase.auth.refreshSession();
    },
    onSuccess: refresh,
  });
}

const SETTINGS_KEY = ["store-settings", "security"] as const;

export function useSecuritySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<{ settings: SecuritySettings; raw: Record<string, unknown> }> => {
      const { data, error } = await sb.from("store_settings").select("value").eq("key", "security").maybeSingle();
      if (error) throw error;
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { settings: normalizeSecuritySettings(raw), raw };
    },
  });
}

export function useSaveSecuritySettings() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ next, raw }: { next: SecuritySettings; raw: Record<string, unknown> }) => {
      const { error } = await sb.from("store_settings").upsert({ key: "security", value: { ...raw, ...next } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export type AdminSecurityRow = { user_id: string; email: string; has_2fa: boolean; factors: number; last_sign_in_at: string | null; is_me: boolean };

export function useSecurityOverview() {
  return useQuery({
    queryKey: ["admin-security-overview"],
    queryFn: async (): Promise<AdminSecurityRow[]> => {
      const { data, error } = await sb.rpc("admin_security_overview");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, factors: Number(r.factors) }));
    },
  });
}

export function useResetAdminMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await sb.rpc("admin_reset_mfa", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-security-overview"] }),
  });
}

/** Provedores ligados no serviço de contas (sem chaves: só ligado ou não). */
export function useAuthProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const base: string = sb.supabaseUrl || window.location.origin;
      const key: string = sb.supabaseKey || "";
      const res = await fetch(`${base.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: key } });
      if (!res.ok) return {};
      const body = await res.json().catch(() => ({}));
      return body?.external && typeof body.external === "object" ? body.external : {};
    },
  });
}

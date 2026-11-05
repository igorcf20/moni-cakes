// =============================================================================================
// Registo de atividade do Admin para funções que usam a chave de serviço em nome de um administrador
// (contas de clientes, chaves de integrações). As mudanças feitas pelo site entram sozinhas pelo trigger
// admin_activity_capture; estas funções chamam recordAdminActivity depois de a mudança dar certo.
// Nunca passa valores secretos: só os nomes dos campos alterados ("***"). Erros aqui nunca param a função.
// =============================================================================================

// deno-lint-ignore no-explicit-any
type Client = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<any> };

export type ActivityEntry = {
  actor: string;
  action: "create" | "update" | "delete";
  entity: string;
  entityId?: string | null;
  label?: string | null;
  /** { campo: { o: antes, n: depois } }; use hidden() para campos secretos. */
  changes?: Record<string, { o: unknown; n: unknown }>;
};

/** Campo alterado sem mostrar o valor. */
export const hidden = (had = true, has = true) => ({ o: had ? "***" : null, n: has ? "***" : null });

export async function recordAdminActivity(sb: Client, req: Request, e: ActivityEntry): Promise<void> {
  try {
    const ip = (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    await sb.rpc("admin_activity_record", {
      _actor: e.actor, _action: e.action, _entity: e.entity, _entity_id: e.entityId ?? null, _label: e.label ?? null,
      _changes: e.changes ?? {}, _ip: ip, _user_agent: req.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("activity log", err);
  }
}

// =====================================================================================
// Páginas próprias dentro de uma seção do Admin (decisão do dono: criar, editar e ver detalhes em página,
// nunca em janela sobreposta). A página vive no endereço do Admin: /admin?tab=<seção>&ver=<página>&id=<id>,
// por isso tem link próprio, o botão Voltar do navegador funciona e a seção volta ao separador certo (aba=).
// Uso: const page = useAdminPage(); page.open("forma", id) / page.close(); <AdminSubpage title onBack> ... </AdminSubpage>
// =====================================================================================
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function useAdminPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get("ver");
  const id = params.get("id");
  const tab = params.get("aba");
  const update = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k); else next.set(k, v);
    }
    setParams(next, { replace });
  };
  return {
    view,
    id,
    /** Separador interno da seção (ex.: zonas), para voltar ao mesmo lugar. */
    tab,
    setTab: (v: string) => update({ aba: v }, true),
    open: (page: string, pageId?: string | null) => {
      update({ ver: page, id: pageId ?? null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    close: () => update({ ver: null, id: null }),
  };
}

export default function AdminSubpage({ title, subtitle, backLabel, onBack, actions, children }: {
  title: string;
  subtitle?: string;
  backLabel: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 border-b pb-4">
        <Button variant="ghost" size="sm" className="-ml-2 h-9 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{backLabel}
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// Confirmação na própria página, no lugar do confirm() do navegador (que abre uma janela por cima):
//   const { ask, confirmSlot } = useInlineConfirm();
//   if (!(await ask("Apagar este preset?"))) return;
//   ...e {confirmSlot} no JSX do componente, onde a faixa deve aparecer (ela rola até ficar à vista).
import { useCallback, useState, type ReactNode } from "react";
import { ConfirmStrip } from "./AdminPageParts";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";

type Ask = { description?: ReactNode; confirmLabel?: string; tone?: "danger" | "warning" };
type Pending = Ask & { title: ReactNode; resolve: (ok: boolean) => void };

export function useInlineConfirm() {
  const { t } = useMessages(adminPagesMessages);
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback(
    (title: ReactNode, opts: Ask = {}) =>
      new Promise<boolean>((resolve) => {
        setPending((prev) => { prev?.resolve(false); return { title, ...opts, resolve }; });
      }),
    [],
  );
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null); };
  const confirmSlot = (
    <ConfirmStrip
      open={!!pending}
      title={pending?.title}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel || t("confirm")}
      tone={pending?.tone}
      className="my-3"
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return { ask, confirmSlot };
}

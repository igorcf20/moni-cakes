// Peças pequenas de Admin > Kits: rótulo com dica, cartão de seção e o selo de estado do kit.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import HelpTip from "../HelpTip";
import { cn } from "@/lib/utils";
import type { AdminLegacyT as T } from "@/i18n/adminLegacy";
import type { KitStatus } from "./kitAdmin";

/** Rótulo de campo com a dica ao lado. */
export const FieldLabel = ({ t, label, help, htmlFor, className }: { t: T; label: string; help: string; htmlFor?: string; className?: string }) => (
  <div className="flex items-center gap-0.5">
    <Label htmlFor={htmlFor} className={className}>{label}</Label>
    <HelpTip label={t("help")} text={help} />
  </div>
);

/** Cartão de uma parte da página do kit: título, explicação curta e conteúdo. */
export function KitSection({ icon: Icon, title, intro, actions, children, className, id }: {
  icon: LucideIcon; title: string; intro: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("space-y-4 rounded-[18px] border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-base font-semibold">
            <Icon className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{title}
          </h4>
          <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<KitStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-50 text-sky-800",
  ended: "bg-muted text-muted-foreground",
  unavailable: "bg-amber-50 text-amber-800",
};

export function KitStatusChip({ t, status, title }: { t: T; status: KitStatus; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>
      {t(`kits_status_${status}`)}
    </span>
  );
}

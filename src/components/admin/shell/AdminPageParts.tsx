// =====================================================================================
// Peças das páginas próprias do Admin (pedido, cliente, produto), no lugar das janelas por cima (modais):
//   AdminPageHeader  voltar, título, linha de apoio, selos e ações da página
//   AdminPanel       bloco com título dentro da página
//   InlinePanel      painel que abre na própria página (substitui um diálogo); fecha com o X
//   ConfirmStrip     faixa de confirmação na página para ações sem volta (apagar...)
//   InlineConfirm    botão que abre a ConfirmStrip logo abaixo
// Textos em src/i18n/adminPages.ts.
// =====================================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeft, Loader2, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";

export function AdminPageHeader({
  back, title, subtitle, badges, actions,
}: { back?: { to: string; label: string }; title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 space-y-3">
      {back && (
        <Link to={back.to} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground break-words">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
          {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function AdminPanel({
  title, icon: Icon, actions, children, className, id,
}: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-[20px] border bg-card p-4 md:p-5 scroll-mt-24", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              {Icon && <Icon className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />} {title}
            </h2>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Painel que abre na própria página, com título e botão de fechar. Ao abrir, rola até ele. */
export function InlinePanel({
  open, onClose, title, description, children, className,
}: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  const { t } = useMessages(adminPagesMessages);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);
  if (!open) return null;
  return (
    <section ref={ref} className={cn("w-full min-w-0 rounded-[18px] border border-primary/30 bg-card p-4 shadow-sm md:p-5 scroll-mt-24", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose} aria-label={t("close")}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {children}
    </section>
  );
}

/** Faixa de confirmação na página, para ações sem volta. */
export function ConfirmStrip({
  open, title, description, confirmLabel, onConfirm, onCancel, busy, tone = "danger", className,
}: {
  open: boolean; title: ReactNode; description?: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
  busy?: boolean; tone?: "danger" | "warning"; className?: string;
}) {
  const { t } = useMessages(adminPagesMessages);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "w-full basis-full rounded-[14px] border p-3 text-left md:p-4",
        tone === "danger" ? "border-destructive/40 bg-destructive/5" : "border-amber-400/60 bg-amber-50",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "danger" ? "text-destructive" : "text-amber-700")} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={tone === "danger" ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {confirmLabel}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>{t("cancel")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão que abre uma ConfirmStrip logo abaixo dele (o pai deve permitir quebra de linha: flex-wrap). */
export function InlineConfirm({
  label, icon: Icon, title, description, confirmLabel, onConfirm, busy, variant = "outline", size = "sm", className, disabled,
}: {
  label: ReactNode; icon?: LucideIcon; title: ReactNode; description?: ReactNode; confirmLabel: string;
  onConfirm: () => void | Promise<void>; busy?: boolean; variant?: ButtonProps["variant"]; size?: ButtonProps["size"];
  className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} disabled={disabled || busy} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />} {label}
      </Button>
      <ConfirmStrip
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => { await onConfirm(); setOpen(false); }}
      />
    </>
  );
}

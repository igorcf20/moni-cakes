// =====================================================================================
// Partes (abas) da página do produto no Admin, em dois níveis dentro de um só cartão:
//   1. grupos (Básico, Opções e estoque, Preço e venda, Entrega e mais): 2 x 2 no celular,
//      4 lado a lado a partir do tablet, cada um com o número de partes e dica;
//   2. partes do grupo aberto: abas com sublinhado (roda para o lado no celular), cada uma com dica;
//   3. rodapé: explicação da parte aberta e onde ela grava (serve também para o toque, sem dica).
// =====================================================================================
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Info, Lock, Package, Shapes, Tag, Truck, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMessages } from "@/i18n";
import { adminProductNavMessages, type AdminProductNavKey } from "@/i18n/adminProductNav";
import { cn } from "@/lib/utils";

export type SectionGroup = "basics" | "options" | "selling" | "more";
const SECTION_GROUPS: { id: SectionGroup; icon: LucideIcon }[] = [
  { id: "basics", icon: Package },
  { id: "options", icon: Shapes },
  { id: "selling", icon: Tag },
  { id: "more", icon: Truck },
];

export type ProductSection = { value: string; label: string; icon: LucideIcon; persisted?: boolean; group: SectionGroup };

export function ProductSectionNav({ sections, active, onChange, isNew }: {
  sections: ProductSection[];
  active: string;
  onChange: (value: string) => void;
  isNew: boolean;
}) {
  const { t } = useMessages(adminProductNavMessages);
  const rowRef = useRef<HTMLDivElement>(null);
  const locked = (s: ProductSection) => isNew && !!s.persisted;
  const describe = (s: ProductSection) => (locked(s) ? t("nav_locked") : t(`d_${s.value}` as AdminProductNavKey));
  const groups = SECTION_GROUPS.map((g) => ({ ...g, items: sections.filter((s) => s.group === g.id) })).filter((g) => g.items.length);
  const current = sections.find((s) => s.value === active) ?? sections[0];
  const currentGroup = groups.find((g) => g.id === current?.group) ?? groups[0];

  // No celular a linha de partes roda para o lado: mantém a parte aberta à vista.
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !el) return;
    const left = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  if (!current || !currentGroup) return null;
  const openGroup = (id: SectionGroup) => {
    const first = groups.find((g) => g.id === id)?.items.find((s) => !locked(s));
    if (first) onChange(first.value);
  };
  const saveNote = current.persisted ? (isNew ? t("save_after") : t("save_own")) : t("save_main");

  return (
    <TooltipProvider delayDuration={200}>
      <nav aria-label={t("nav_title")} className="overflow-hidden rounded-[20px] border bg-card shadow-[var(--shadow-soft)]">
        {/* 1. Grupos */}
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4" role="group" aria-label={t("nav_groups")}>
          {groups.map((g) => {
            const on = g.id === currentGroup.id;
            const usable = g.items.some((s) => !locked(s));
            const GroupIcon = g.icon;
            return (
              <Tooltip key={g.id}>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => openGroup(g.id)} disabled={!usable} aria-pressed={on}
                    className={cn("relative flex min-h-[64px] items-center gap-3 px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 md:px-4",
                      on ? "bg-brand-orange-soft" : "bg-card hover:bg-muted/60")}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition-colors duration-200",
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <GroupIcon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight md:text-sm">{t(`g_${g.id}` as AdminProductNavKey)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t("nav_count", { n: g.items.length })}</span>
                      <span className="sr-only">{t(`gd_${g.id}` as AdminProductNavKey)}</span>
                    </span>
                    {on && <motion.span layoutId="product-group-bar" className="absolute inset-x-0 bottom-0 h-[3px] bg-primary" transition={{ duration: 0.2 }} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-[13px] leading-snug">{t(`gd_${g.id}` as AdminProductNavKey)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* 2. Partes do grupo aberto */}
        <div ref={rowRef} className="flex gap-1 overflow-x-auto border-t px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden" role="group" aria-label={t(`g_${currentGroup.id}` as AdminProductNavKey)}>
          {currentGroup.items.map((s) => {
            const Icon = s.icon;
            const on = s.value === current.value;
            return (
              <Tooltip key={s.value}>
                <TooltipTrigger asChild>
                  {/* span: o botão desligado não recebe o mouse, a dica continua a abrir */}
                  <span className="relative inline-flex shrink-0">
                    <button type="button" disabled={locked(s)} onClick={() => onChange(s.value)} aria-current={on ? "page" : undefined}
                      aria-describedby={`pdesc-${s.value}`}
                      className={cn("inline-flex h-12 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                        on ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground")}>
                      <Icon className={cn("h-4 w-4 shrink-0", on && "text-primary")} aria-hidden="true" />{s.label}
                      {locked(s) && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                    <span id={`pdesc-${s.value}`} className="sr-only">{describe(s)}</span>
                    {on && <motion.span layoutId="product-part-line" className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-primary" transition={{ duration: 0.2 }} />}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-[13px] leading-snug">{describe(s)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* 3. O que é a parte aberta e onde grava */}
        <div className="flex flex-col gap-2 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" role="note">
          <p className="flex min-w-0 items-start gap-2 text-[13px] leading-snug text-muted-foreground">
            <Info className="mt-px h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
            <span>{describe(current)}</span>
          </p>
          <span className={cn("inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium",
            current.persisted ? "border-primary/25 bg-card text-brand-orange-text" : "bg-card text-foreground")}>
            {saveNote}
          </span>
        </div>
      </nav>
    </TooltipProvider>
  );
}

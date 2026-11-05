// =====================================================================================
// Menu do painel Admin em acordeão: cada grupo (ADMIN_GROUPS) é uma categoria que abre e fecha, com uma aberta
// por vez. A categoria da seção atual abre sozinha ao navegar. Fechada, a categoria mostra a soma dos contadores
// do que espera o administrador. O mesmo menu serve o computador (barra lateral) e o celular (painel que abre
// por baixo do botão Menu, sem janela por cima). No computador a barra é grafite (tone "dark") e pode recolher:
// recolhida, mostra só os ícones das categorias; um clique abre a barra já com a categoria aberta.
// =====================================================================================
import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AdminAttention } from "@/hooks/useAdminAttention";
import { useMessages } from "@/i18n";
import { adminMessages } from "@/i18n/admin";
import { adminHref, sectionNameKey, type AdminGroup } from "./adminSections";

type Props = {
  groups: AdminGroup[];
  active: string;
  attention: AdminAttention;
  onPick: (section: string) => void;
  /** "dark" = barra lateral grafite do computador; "light" = painel do celular. */
  tone?: "light" | "dark";
  /** Só ícones das categorias (barra recolhida). */
  collapsed?: boolean;
  /** Barra recolhida: clique numa categoria abre a barra. */
  onExpand?: () => void;
};

const TONES = {
  light: {
    group: "text-foreground/80 hover:bg-muted hover:text-foreground",
    groupOpen: "bg-muted/70 text-foreground",
    chip: "bg-card text-muted-foreground border border-border group-hover:text-foreground",
    chipActive: "bg-primary text-primary-foreground",
    count: "text-muted-foreground",
    chevron: "text-muted-foreground",
    rail: "border-border",
    item: "text-muted-foreground hover:bg-muted hover:text-foreground",
    itemActive: "bg-primary/10 text-brand-orange-text font-semibold",
    ring: "focus-visible:ring-ring",
  },
  dark: {
    group: "text-white/70 hover:bg-white/[0.06] hover:text-white",
    groupOpen: "bg-white/[0.06] text-white",
    chip: "text-white/60 group-hover:text-white",
    chipActive: "bg-white/[0.12] text-white",
    count: "text-white/40",
    chevron: "text-white/40",
    rail: "border-white/10",
    item: "text-white/60 hover:bg-white/[0.06] hover:text-white",
    itemActive: "bg-white/[0.10] text-white font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]",
    ring: "focus-visible:ring-white/60",
  },
} as const;

const groupOf = (groups: AdminGroup[], section: string) =>
  groups.find((g) => g.items.some((s) => s.value === section))?.label ?? null;

export default function AdminNav({ groups, active, attention, onPick, tone = "light", collapsed = false, onExpand }: Props) {
  const { t } = useMessages(adminMessages);
  const baseId = useId();
  const activeGroup = groupOf(groups, active);
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);

  // Ao mudar de seção (ou quando o menu acaba de carregar os recursos), abre a categoria dela.
  useEffect(() => { if (activeGroup) setOpenGroup(activeGroup); }, [activeGroup]);
  const c = TONES[tone];

  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1" aria-label={t("panel")}>
        {groups.map((group) => {
          const hasActive = group.label === activeGroup;
          const waiting = group.items.reduce((sum, s) => sum + (s.badge?.(attention) ?? 0), 0);
          return (
            <button
              key={group.label}
              type="button"
              title={t(group.label)}
              aria-label={t(group.label)}
              onClick={() => { setOpenGroup(group.label); onExpand?.(); }}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${c.ring} ${hasActive ? c.chipActive : c.group}`}
            >
              <group.icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {waiting > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1" aria-label={t("panel")}>
      {groups.map((group) => {
        const isOpen = openGroup === group.label;
        const hasActive = group.label === activeGroup;
        const waiting = group.items.reduce((sum, s) => sum + (s.badge?.(attention) ?? 0), 0);
        const panelId = `${baseId}-${group.label}`;
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : group.label)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={`group w-full min-h-11 flex items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${c.ring} ${
                isOpen ? c.groupOpen : c.group
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                  hasActive ? c.chipActive : c.chip
                }`}
              >
                <group.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className={`flex-1 min-w-0 leading-5 ${hasActive || isOpen ? "font-semibold" : "font-medium"}`}>{t(group.label)}</span>
              {!isOpen && waiting > 0 ? (
                <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground tabular-nums">
                  {waiting}
                  <span className="sr-only"> {t("needs_attention")}</span>
                </span>
              ) : (
                <span className={`text-[11px] tabular-nums ${c.count}`} title={t("nav_sections", { n: group.items.length })}>
                  {group.items.length}
                  <span className="sr-only"> {t("nav_sections", { n: group.items.length })}</span>
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 ${c.chevron} transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {/* Altura animada (0fr -> 1fr); fechada fica invisível, sem foco nos links escondidos. */}
            <div
              id={panelId}
              className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${
                isOpen ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible"
              }`}
            >
              <div className="overflow-hidden">
                <div className={`ml-6 mt-1 mb-2 space-y-0.5 border-l ${c.rail} pl-2`}>
                  {group.items.map((item) => {
                    const badge = item.badge?.(attention) ?? 0;
                    const current = active === item.value;
                    return (
                      <a
                        key={item.value}
                        href={adminHref.section(item.value)}
                        onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onPick(item.value); }}
                        aria-current={current ? "page" : undefined}
                        className={`w-full min-h-10 flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${c.ring} ${
                          current ? c.itemActive : c.item
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                        <span className="text-left">{t(sectionNameKey(item.value))}</span>
                        {badge > 0 && (
                          <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground tabular-nums">
                            {badge}
                            <span className="sr-only"> {t("needs_attention")}</span>
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

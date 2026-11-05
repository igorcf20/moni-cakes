// =====================================================================================
// Contatos recebidos pelos pop-ups (todos, ou de um só): busca, filtro por pop-up, planilha CSV e apagar
// (pedido do cliente, LGPD/RGPD). Dados em usePopupLeads (tabela popup_leads, só o Admin lê).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, Inbox, Loader2, Mail, Phone, Search, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPager } from "@/components/admin/AdminListKit";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useDeletePopupLeads, usePopupLeads, type PopupLead } from "@/hooks/useLeadPopups";
import { downloadCsv } from "@/lib/csv";
import { countryName } from "@/lib/countries";
import { LOCALE_NAMES, type Locale } from "@/i18n";
import type { PT } from "./fields";

const PAGE = 25;

export default function PopupLeadsList({ t, popupId, popups }: { t: PT; popupId: string | null; popups?: { id: string; name: string }[] }) {
  const fmt = useAdminFormat();
  const [filter, setFilter] = useState<string>("all");
  const { data: leads = [], isLoading, error } = usePopupLeads(popupId);
  const del = useDeletePopupLeads();
  const { ask, confirmSlot } = useInlineConfirm();
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPg(1), [q, filter]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter((l) => (filter === "all" || l.popup_id === filter)
      && (!s || [l.email, l.phone, l.name, l.popup_name, ...Object.values(l.extra)].some((v) => v?.toLowerCase().includes(s))));
  }, [leads, q, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const extraKeys = useMemo(() => [...new Set(leads.flatMap((l) => Object.keys(l.extra)))], [leads]);

  const exportCsv = () => {
    downloadCsv("contatos-popups",
      [t("lead_date"), t("lead_popup"), t("field_name"), t("field_email"), t("field_phone"), ...extraKeys, t("lead_consent"), t("lead_newsletter"), t("lead_locale"), t("lead_country"), t("lead_page")],
      shown.map((l) => [fmt.dateTime(l.created_at), l.popup_name, l.name, l.email, l.phone, ...extraKeys.map((k) => l.extra[k] ?? ""),
        l.consent ? t("yes") : t("no"), l.newsletter ? t("yes") : t("no"), l.locale, l.country, l.path]));
  };

  const remove = async (ids: string[]) => {
    if (!(await ask(t("lead_delete_confirm", { n: ids.length }), { description: t("lead_delete_d"), tone: "danger", confirmLabel: t("delete") }))) return;
    try {
      await del.mutateAsync(ids);
      setPicked(new Set());
      toast.success(t("lead_deleted", { n: ids.length }));
    } catch {
      toast.error(t("save_error"));
    }
  };

  if (isLoading) return <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;
  if (!leads.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed p-10 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("leads_empty")}</p>
      </div>
    );
  }

  const pageRows = shown.slice((pg - 1) * PAGE, pg * PAGE);
  const allOnPage = pageRows.length > 0 && pageRows.every((l) => picked.has(l.id));
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-[18px] border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("leads_search")} aria-label={t("leads_search")} className="pl-9" />
        </div>
        {!popupId && popups && popups.length > 1 && (
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 sm:w-56" aria-label={t("lead_popup")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("leads_all_popups")}</SelectItem>
              {popups.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={exportCsv} disabled={!shown.length}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("leads_csv")}</Button>
      </div>
      {confirmSlot}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          <Checkbox checked={allOnPage} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); for (const l of pageRows) { if (v) n.add(l.id); else n.delete(l.id); } return n; })} aria-label={t("leads_pick_page")} />
          {t("leads_count", { n: shown.length })}
        </label>
        {picked.size > 0 && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => remove([...picked])}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("leads_delete_n", { n: picked.size })}
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {pageRows.map((l) => <LeadRow key={l.id} t={t} l={l} fmt={fmt} showPopup={!popupId} picked={picked.has(l.id)}
          onPick={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} onDelete={() => remove([l.id])} />)}
      </ul>
      <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE + 1} to={Math.min(shown.length, pg * PAGE)} onPage={setPg} />
    </div>
  );
}

function LeadRow({ t, l, fmt, showPopup, picked, onPick, onDelete }: {
  t: PT; l: PopupLead; fmt: ReturnType<typeof useAdminFormat>; showPopup: boolean; picked: boolean; onPick: (v: boolean) => void; onDelete: () => void;
}) {
  const extras = Object.entries(l.extra);
  return (
    <li className="flex items-start gap-3 rounded-[16px] border bg-card p-3">
      <Checkbox checked={picked} onCheckedChange={(v) => onPick(!!v)} aria-label={t("leads_pick")} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {l.name && <span className="inline-flex items-center gap-1.5 font-semibold"><User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{l.name}</span>}
          {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 break-all hover:underline"><Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{l.email}</a>}
          {l.phone && <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{l.phone}</a>}
        </div>
        {extras.length > 0 && <p className="text-xs text-foreground/80">{extras.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{fmt.dateTime(l.created_at)}</span>
          {showPopup && l.popup_name && <span>· {l.popup_name}</span>}
          {l.country && <span>· {countryName(l.country, fmt.locale as Locale)}</span>}
          {l.locale && <span>· {LOCALE_NAMES[l.locale as Locale] ?? l.locale}</span>}
          {l.path && <span className="truncate">· {l.path}</span>}
          {l.newsletter && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />{t("lead_on_list")}</span>}
          {l.consent && !l.newsletter && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{t("lead_consented")}</span>}
        </p>
      </div>
      <button type="button" onClick={onDelete} title={t("delete")} aria-label={t("delete")} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

// =====================================================================================
// Admin > Vales-presente (recurso gift_cards em Admin > Recursos da loja). Três telas, sem janelas:
//   lista   números (ativos, saldo em aberto, já usado, vencidos ou desligados), filtros, busca, Novo vale-presente
//   novo    (ver=novo) valor, código gerado (ou o seu), validade, destinatário, quem oferece, mensagem, nota interna
//   vale    (ver=vale&id=<id>) saldo, dados editáveis, ajuste de saldo com nota, histórico com os pedidos, texto
//           pronto para enviar ao cliente
// Regras e saldo no servidor (migration 20261006190000_gift_cards.sql); o checkout usa o vale em GiftCardInput.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Ban, CheckCircle2, ChevronRight, Clock, Copy, Loader2, Plus, RefreshCw, Save, Search, Wallet, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminGiftCardsMessages } from "@/i18n/adminGiftCards";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useStoreName } from "@/hooks/useBrand";
import { useAdjustGiftCard, useGiftCard, useGiftCardHistory, useGiftCards, useSaveGiftCard, type GiftCard, type GiftCardInputValues } from "@/hooks/useGiftCards";
import { formatGiftCode, generateGiftCode, giftCardState, isGiftCode, type GiftCardState } from "@/lib/giftCards";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminGiftCardsMessages["pt-BR"]>>["t"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const toDateInput = (v: string | null) => (v ? v.slice(0, 10) : "");
const fromDateInput = (v: string) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);

const STATE_CLS: Record<GiftCardState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  used: "bg-muted text-muted-foreground",
  expired: "bg-amber-50 text-amber-700",
  disabled: "bg-destructive/10 text-destructive",
};
function StateBadge({ g, t }: { g: Pick<GiftCard, "is_active" | "balance" | "expires_at">; t: T }) {
  const s = giftCardState(g);
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_CLS[s])}>{t(`st_${s}`)}</span>;
}

export default function AdminGiftCards() {
  const { t } = useMessages(adminGiftCardsMessages);
  const page = useAdminPage();
  if (page.view === "novo") return <GiftCardForm onBack={page.close} onSaved={(id) => page.open("vale", id)} />;
  if (page.view === "vale" && page.id) return <GiftCardPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="gift-cards" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <GiftCardList onOpen={(id) => page.open("vale", id)} onNew={() => page.open("novo")} />
    </div>
  );
}

type Filter = "all" | GiftCardState;

function GiftCardList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useMessages(adminGiftCardsMessages);
  const { money, date } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useGiftCards();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const count = (s: GiftCardState) => rows.filter((g) => giftCardState(g) === s).length;
  const active = rows.filter((g) => giftCardState(g) === "active");
  const outstanding = active.reduce((s, g) => s + g.balance, 0);
  const used = rows.reduce((s, g) => s + Math.max(0, g.initial_amount - g.balance), 0);

  const filtered = useMemo(() => {
    const needle = norm(q.trim().replace(/-/g, ""));
    return rows.filter((g) => (filter === "all" || giftCardState(g) === filter)
      && (!needle || norm([g.code, g.recipient_name, g.recipient_email, g.sender_name].filter(Boolean).join(" ")).includes(needle)));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><Button onClick={onNew}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("new")}</Button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={WalletCards} label={t("stat_active")} value={active.length} active={filter === "active"} onClick={() => setFilter("active")} />
        <AdminStatCard icon={Wallet} label={t("stat_outstanding")} value={money(outstanding)} hint={t("stat_outstanding_hint")} />
        <AdminStatCard icon={CheckCircle2} label={t("stat_used")} value={money(used)} tone="success" />
        <AdminStatCard icon={Clock} label={t("stat_expired")} value={count("expired") + count("disabled")} tone={count("expired") ? "warning" : "default"} active={filter === "expired"} onClick={() => setFilter("expired")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            ...(["active", "used", "expired", "disabled"] as const).map((s) => ({ value: s, label: t(`st_${s}`), count: count(s) })),
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
      </div>

      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{rows.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {paged.items.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onOpen(g.id)} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-semibold tracking-wide">{formatGiftCode(g.code)}</span>
                    <StateBadge g={g} t={t} />
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {[g.recipient_name || g.recipient_email || t("no_recipient"), g.expires_at ? t("expires_on", { date: date(g.expires_at) }) : t("no_expiry")].join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-right">
                    <span className="block text-lg font-bold tabular-nums">{money(g.balance)}</span>
                    <span className="block text-xs text-muted-foreground">{t("of_initial", { value: money(g.initial_amount) })}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

/** Campos comuns de criar e editar (o valor inicial e o código só ao criar). */
type FormState = { amount: string; code: string; expires: string; is_active: boolean; recipient_name: string; recipient_email: string; sender_name: string; message: string; notes: string };
const emptyForm = (): FormState => ({ amount: "", code: generateGiftCode(), expires: "", is_active: true, recipient_name: "", recipient_email: "", sender_name: "", message: "", notes: "" });
const toValues = (f: FormState): GiftCardInputValues => ({
  code: f.code, initial_amount: Math.round(Number(f.amount.replace(",", ".")) * 100) / 100, expires_at: fromDateInput(f.expires), is_active: f.is_active,
  recipient_name: f.recipient_name.trim() || null, recipient_email: f.recipient_email.trim() || null, sender_name: f.sender_name.trim() || null,
  message: f.message.trim() || null, notes: f.notes.trim() || null,
});

function DetailFields({ f, set, t }: { f: FormState; set: (p: Partial<FormState>) => void; t: T }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="gc-expires">{t("expires")}</Label>
        <Input id="gc-expires" type="date" value={f.expires} onChange={(e) => set({ expires: e.target.value })} />
        <p className="text-xs text-muted-foreground">{t("expires_hint")}</p>
      </div>
      <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
        <div>
          <Label htmlFor="gc-active" className="text-sm font-semibold">{t("active")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("active_hint")}</p>
        </div>
        <Switch id="gc-active" checked={f.is_active} onCheckedChange={(v) => set({ is_active: v })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gc-rname">{t("recipient_name")}</Label>
        <Input id="gc-rname" value={f.recipient_name} maxLength={120} onChange={(e) => set({ recipient_name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gc-remail">{t("recipient_email")}</Label>
        <Input id="gc-remail" type="email" value={f.recipient_email} maxLength={254} onChange={(e) => set({ recipient_email: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gc-sender">{t("sender_name")}</Label>
        <Input id="gc-sender" value={f.sender_name} maxLength={120} onChange={(e) => set({ sender_name: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="gc-message">{t("message")}</Label>
        <Textarea id="gc-message" rows={2} value={f.message} maxLength={500} onChange={(e) => set({ message: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="gc-notes">{t("notes")}</Label>
        <Textarea id="gc-notes" rows={2} value={f.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
        <p className="text-xs text-muted-foreground">{t("notes_hint")}</p>
      </div>
    </div>
  );
}

function GiftCardForm({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const { t } = useMessages(adminGiftCardsMessages);
  const { currency } = useAdminFormat();
  const save = useSaveGiftCard();
  const [f, setF] = useState<FormState>(emptyForm);
  const set = (p: Partial<FormState>) => setF((x) => ({ ...x, ...p }));
  const amount = Number(f.amount.replace(",", "."));
  const valid = amount > 0 && amount <= 1_000_000 && isGiftCode(f.code);

  const submit = async () => {
    if (!valid) return;
    try {
      const id = await save.mutateAsync({ id: null, values: toValues(f) });
      toast.success(t("created"));
      onSaved(id);
    } catch (e) {
      toast.error(String((e as { code?: string })?.code) === "23505" ? t("code_taken") : t("save_error"));
    }
  };

  return (
    <AdminSubpage title={t("new")} subtitle={t("new_hint")} backLabel={t("back")} onBack={onBack}>
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gc-amount">{t("amount", { currency })}</Label>
            <Input id="gc-amount" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="100" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gc-code">{t("code")}</Label>
            <div className="flex gap-2">
              <Input id="gc-code" value={formatGiftCode(f.code)} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="font-mono tracking-wide" aria-invalid={!isGiftCode(f.code)} />
              <Button type="button" variant="outline" onClick={() => set({ code: generateGiftCode() })} aria-label={t("regenerate")} title={t("regenerate")}><RefreshCw className="h-4 w-4" strokeWidth={1.8} /></Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("code_hint")}</p>
          </div>
        </div>
        <DetailFields f={f} set={set} t={t} />
      </section>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("create")}
        </Button>
      </div>
    </AdminSubpage>
  );
}

function GiftCardPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminGiftCardsMessages);
  const { money, date, dateTime } = useAdminFormat();
  const store = useStoreName();
  const { data: g, isLoading } = useGiftCard(id);
  const { data: history = [] } = useGiftCardHistory(id);
  const save = useSaveGiftCard();
  const adjust = useAdjustGiftCard();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<FormState | null>(null);
  const [adj, setAdj] = useState({ amount: "", note: "" });

  useEffect(() => {
    if (g) setF({ amount: String(g.initial_amount), code: g.code, expires: toDateInput(g.expires_at), is_active: g.is_active, recipient_name: g.recipient_name ?? "", recipient_email: g.recipient_email ?? "", sender_name: g.sender_name ?? "", message: g.message ?? "", notes: g.notes ?? "" });
  }, [g]);

  if (isLoading || !f) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!g) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const set = (p: Partial<FormState>) => setF((x) => (x ? { ...x, ...p } : x));
  const saveDetails = async () => {
    try {
      await save.mutateAsync({ id, values: toValues(f) });
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const adjAmount = Number(adj.amount.replace(",", "."));
  const runAdjust = async () => {
    if (!adjAmount) return;
    const text = adjAmount > 0 ? t("confirm_add", { value: money(adjAmount) }) : t("confirm_remove", { value: money(-adjAmount) });
    if (!(await ask(text, { confirmLabel: t("adjust_apply") }))) return;
    try {
      await adjust.mutateAsync({ id, amount: adjAmount, note: adj.note });
      setAdj({ amount: "", note: "" });
      toast.success(t("adjusted"));
    } catch (e) {
      toast.error(String((e as { message?: string })?.message).includes("negative_balance") ? t("negative") : t("save_error"));
    }
  };
  const shareText = t("share_text", {
    store, code: formatGiftCode(g.code), value: money(g.balance), link: siteUrl(),
    expiry: g.expires_at ? t("share_expiry", { date: date(g.expires_at) }) : "",
  }).replace(/\s+\./g, ".");
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t("copied")); } catch { toast.error(t("copy_error")); }
  };

  return (
    <AdminSubpage
      title={formatGiftCode(g.code)}
      subtitle={[g.recipient_name, t("created_on", { date: date(g.created_at) })].filter(Boolean).join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<Button variant="outline" size="sm" onClick={() => void copy(formatGiftCode(g.code))}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("copy_code")}</Button>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Wallet} label={t("balance")} value={money(g.balance)} tone="success" />
        <AdminStatCard icon={WalletCards} label={t("initial")} value={money(g.initial_amount)} />
        <AdminStatCard icon={CheckCircle2} label={t("used")} value={money(Math.max(0, g.initial_amount - g.balance))} />
        <AdminStatCard icon={g.is_active ? Clock : Ban} label={t("state")} value={<StateBadge g={g} t={t} />} hint={g.expires_at ? t("expires_on", { date: date(g.expires_at) }) : t("no_expiry")} />
      </div>

      {/* Texto pronto para enviar ao cliente */}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("share_title")}</h4>
        <p className="whitespace-pre-line rounded-xl bg-muted/50 p-3 text-sm">{shareText}</p>
        <Button variant="outline" size="sm" onClick={() => void copy(shareText)}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("share_copy")}</Button>
      </section>

      {/* Ajustar saldo */}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="font-semibold">{t("adjust_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("adjust_hint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="gc-adj">{t("adjust_amount")}</Label>
            <Input id="gc-adj" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} placeholder="-10 / 25" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gc-adj-note">{t("adjust_note")}</Label>
            <Input id="gc-adj-note" value={adj.note} maxLength={500} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
          </div>
          <Button onClick={() => void runAdjust()} disabled={!adjAmount || adjust.isPending}>{t("adjust_apply")}</Button>
        </div>
        {confirmSlot}
      </section>

      {/* Dados do vale */}
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("details")}</h4>
        <DetailFields f={f} set={set} t={t} />
        <div className="flex justify-end">
          <Button onClick={() => void saveDetails()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("save")}
          </Button>
        </div>
      </section>

      {/* Histórico */}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("history")}</h4>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">{t("history_empty")}</p> : (
          <ul className="divide-y">
            {history.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`tx_${x.kind}`)}
                    {x.order_id && <> · <Link to={adminHref.order(x.order_id)} className="text-brand-orange-text hover:underline">{t("order_link", { code: x.order_id.slice(0, 8).toUpperCase() })}</Link></>}
                  </p>
                  <p className="text-xs text-muted-foreground">{dateTime(x.created_at)}{x.note ? ` · ${x.note}` : ""}</p>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums", x.amount < 0 ? "text-destructive" : "text-emerald-700")}>{x.amount > 0 ? "+" : "-"}{money(Math.abs(x.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminSubpage>
  );
}

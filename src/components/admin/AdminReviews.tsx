// =====================================================================================
// Admin > Avaliações. Duas listas (separador no endereço, aba=):
//   produtos  avaliações dos produtos: números, filtros, aprovar ou ocultar na lista, página de cada uma
//   loja      avaliações da loja enviadas em /deixar-avaliacao
// Criar, editar, responder e apagar em página própria (ver=avaliacao | loja, id=<id> ou "nova"), nunca em janela.
// Regras de segurança na base (migration 20261006130000_reviews_admin.sql): compra verificada e moderação.
// =====================================================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Camera, Check, Mail, ChevronRight, Clock, EyeOff, Loader2, MessageSquareReply, MessageSquareText, Plus, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import ReviewPage from "./reviews/ReviewPage";
import StoreReviewPage from "./reviews/StoreReviewPage";
import { Stars, sourceLabel } from "./reviews/ReviewBits";
import { useMessages } from "@/i18n";
import { adminReviewsMessages } from "@/i18n/adminReviews";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useReviewSettings, useSaveReviewSettings } from "@/hooks/useReviewSettings";
import {
  REVIEW_SOURCES, useAdminProductReviews, useAdminStoreReviews, useReviewMutations, useStoreReviewMutations,
  type AdminReview, type StoreReview,
} from "@/hooks/useAdminReviews";

type Status = "all" | "pending" | "approved";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function AdminReviews() {
  const { t } = useMessages(adminReviewsMessages);
  const page = useAdminPage();
  const tab = page.tab === "loja" ? "loja" : "produtos";

  if (page.view === "avaliacao" && page.id) {
    return <ReviewPage id={page.id} onBack={page.close} onSaved={(id) => page.open("avaliacao", id)} />;
  }
  if (page.view === "loja" && page.id) {
    return <StoreReviewPage id={page.id} onBack={page.close} onSaved={(id) => page.open("loja", id)} />;
  }

  return (
    <div className="space-y-5">
      <AdminHelp id="avaliacoes" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4"), t("help_5")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11">
          <TabsTrigger value="produtos" className="px-4">{t("tab_products")}</TabsTrigger>
          <TabsTrigger value="loja" className="px-4">{t("tab_store")}</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-5"><ProductReviewList onOpen={(id) => page.open("avaliacao", id)} /></TabsContent>
        <TabsContent value="loja" className="mt-5"><StoreReviewList onOpen={(id) => page.open("loja", id)} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProductReviewList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminReviewsMessages);
  const { date, locale } = useAdminFormat();
  const { data: reviews = [], isLoading, error } = useAdminProductReviews();
  const { setApproved } = useReviewMutations();
  const [status, setStatus] = useState<Status>("all");
  const [rating, setRating] = useState("all");
  const [source, setSource] = useState("all");
  const [product, setProduct] = useState("all");
  const [unanswered, setUnanswered] = useState(false);
  const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const approved = reviews.filter((r) => r.approved);
    const avg = approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0;
    return {
      avg,
      total: reviews.length,
      pending: reviews.filter((r) => !r.approved).length,
      verified: reviews.filter((r) => r.verified).length,
      unanswered: approved.filter((r) => !r.admin_reply).length,
      approved: approved.length,
    };
  }, [reviews]);

  const productOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reviews) m.set(r.product_id, r.product_name ?? t("no_product"));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reviews, t]);

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    return reviews.filter((r) =>
      (status === "all" || (status === "pending" ? !r.approved : !!r.approved))
      && (rating === "all" || r.rating === Number(rating))
      && (source === "all" || r.source === source)
      && (product === "all" || r.product_id === product)
      && (!unanswered || !r.admin_reply)
      && (!needle || norm([r.display_name, r.title, r.comment, r.product_name].filter(Boolean).join(" ")).includes(needle)));
  }, [reviews, status, rating, source, product, unanswered, q]);
  const paged = usePaged(filtered, 20);

  const toggle = (r: AdminReview) => setApproved.mutate({ id: r.id, approved: !r.approved }, {
    onSuccess: () => toast.success(r.approved ? t("hidden_toast") : t("approved_toast")),
    onError: () => toast.error(t("save_error")),
  });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  const avgFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Star} label={t("stat_average")} value={stats.approved ? avgFmt.format(stats.avg) : "-"} hint={t("stat_average_hint")} />
        <AdminStatCard icon={MessageSquareText} label={t("stat_total")} value={stats.total} active={status === "all" && !unanswered} onClick={() => { setStatus("all"); setUnanswered(false); }} />
        <AdminStatCard icon={Clock} label={t("stat_pending")} value={stats.pending} tone={stats.pending ? "warning" : "default"} active={status === "pending"} onClick={() => setStatus("pending")} />
        <AdminStatCard icon={MessageSquareReply} label={t("stat_unanswered")} value={stats.unanswered} hint={t("stat_verified") + ": " + stats.verified} active={unanswered} onClick={() => { setStatus("approved"); setUnanswered(true); }} />
      </div>

      <ReviewPhotoSetting />
      <ReviewRequestSetting />

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<Status>
            label={t("f_status")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: t("f_all"), count: stats.total },
              { value: "pending", label: t("f_pending"), count: stats.pending, tone: "warning" },
              { value: "approved", label: t("f_approved"), count: stats.approved },
            ]}
          />
          <Button onClick={() => onOpen("nova")}><Plus className="mr-1.5 h-4 w-4" />{t("new_review")}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
          </div>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger aria-label={t("f_rating")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("f_all_ratings")}</SelectItem>
              {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n === 1 ? t("f_star") : t("f_stars", { n })}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger aria-label={t("f_source")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("f_all_sources")}</SelectItem>
              {REVIEW_SOURCES.map((s) => <SelectItem key={s} value={s}>{sourceLabel(t, s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={product} onValueChange={setProduct}>
            <SelectTrigger aria-label={t("f_product")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("f_all_products")}</SelectItem>
              {productOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="rv-unanswered" checked={unanswered} onCheckedChange={setUnanswered} />
          <Label htmlFor="rv-unanswered" className="text-sm font-normal">{t("f_unanswered")}</Label>
        </div>
      </div>

      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{reviews.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {paged.items.map((r) => (
            <li key={r.id} className="rounded-[18px] border bg-card p-4 transition-colors duration-150 hover:border-primary/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    {!r.approved && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{t("pending")}</Badge>}
                    {r.verified && <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800"><BadgeCheck className="mr-1 h-3.5 w-3.5" />{t("verified")}</Badge>}
                    {r.source !== "site" && <Badge variant="outline">{sourceLabel(t, r.source)}</Badge>}
                    {r.admin_reply && <Badge variant="outline">{t("answered")}</Badge>}
                  </div>
                  <p className="mt-2 font-semibold">{r.title}</p>
                  {r.comment && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {(r.display_name || t("anonymous"))} · {r.product_name ?? t("no_product")} · {date(r.created_at)}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggle(r)} disabled={setApproved.isPending}>
                    {r.approved ? <><EyeOff className="mr-1.5 h-4 w-4" />{t("hide")}</> : <><Check className="mr-1.5 h-4 w-4" />{t("approve")}</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>{t("open")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

/** Regra da loja: os clientes podem ou não enviar uma foto com a avaliação (store_settings.review_settings). */
function ReviewPhotoSetting() {
  const { t } = useMessages(adminReviewsMessages);
  const { data, isLoading } = useReviewSettings();
  const save = useSaveReviewSettings();
  const on = !!data?.customer_photos;
  return (
    <div className="flex items-start justify-between gap-4 rounded-[18px] border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Camera className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
        <div>
          <Label htmlFor="rv-photos-setting" className="text-sm font-semibold">{t("photos_setting")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{on ? t("photos_setting_on") : t("photos_setting_off")}</p>
        </div>
      </div>
      <Switch
        id="rv-photos-setting"
        checked={on}
        disabled={isLoading || save.isPending}
        onCheckedChange={(v) => data && save.mutate({ ...data, customer_photos: v }, {
          onSuccess: () => toast.success(t("photos_setting_saved")),
          onError: () => toast.error(t("save_error")),
        })}
      />
    </div>
  );
}

/** Pedido de avaliação por e-mail depois da entrega: regra e números (review_requests). Sem remetente, os pedidos esperam. */
function ReviewRequestSetting() {
  const { t } = useMessages(adminReviewsMessages);
  const { data, isLoading } = useReviewSettings();
  const save = useSaveReviewSettings();
  const stats = useQuery({
    queryKey: ["admin-review-request-stats"],
    queryFn: async () => {
      const { data: s, error } = await (supabase as any).rpc("admin_review_request_stats");
      if (error) throw error;
      return s as { waiting: number; due: number; sent: number; skipped: number; failed: number };
    },
  });
  const [days, setDays] = useState<string | null>(null);
  const on = data?.request_email !== false;
  const shownDays = days ?? String(data?.request_after_days ?? 3);
  const store = (patch: Partial<NonNullable<typeof data>>) => data && save.mutate({ ...data, ...patch }, {
    onSuccess: () => { setDays(null); toast.success(t("request_saved")); },
    onError: () => toast.error(t("save_error")),
  });
  return (
    <div className="space-y-3 rounded-[18px] border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Mail className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
          <div>
            <div className="flex items-center gap-1">
              <Label htmlFor="rv-request-setting" className="text-sm font-semibold">{t("request_setting")}</Label>
              <HelpTip label={t("help")} text={t("request_help")} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{on ? t("request_on") : t("request_off")}</p>
          </div>
        </div>
        <Switch id="rv-request-setting" checked={on} disabled={isLoading || save.isPending} onCheckedChange={(v) => store({ request_email: v })} />
      </div>
      {on && (
        <div className="flex flex-wrap items-end gap-3 pl-12">
          <div className="space-y-1">
            <Label htmlFor="rv-request-days" className="text-xs">{t("request_days")}</Label>
            <Input id="rv-request-days" type="number" min={0} max={60} inputMode="numeric" className="h-10 w-24" value={shownDays}
              onChange={(e) => setDays(e.target.value)}
              onBlur={() => { const n = Math.min(60, Math.max(0, Math.round(Number(shownDays) || 0))); if (data && n !== data.request_after_days) store({ request_after_days: n }); else setDays(null); }} />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">{t("request_days_hint")}</p>
        </div>
      )}
      <div className="ml-12 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span>{t("request_waiting", { n: stats.data?.waiting ?? 0 })}</span>
        <span>{t("request_due", { n: stats.data?.due ?? 0 })}</span>
        <span>{t("request_sent", { n: stats.data?.sent ?? 0 })}</span>
      </div>
      <p className="ml-12 text-xs font-medium text-brand-orange-text">{t("request_no_sender")}</p>
    </div>
  );
}

function StoreReviewList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminReviewsMessages);
  const { date } = useAdminFormat();
  const { data: items = [], isLoading, error } = useAdminStoreReviews();
  const { setStatus } = useStoreReviewMutations();
  const [status, setFilter] = useState<"all" | StoreReview["status"]>("all");
  const count = (s: StoreReview["status"]) => items.filter((i) => i.status === s).length;
  const filtered = useMemo(() => items.filter((i) => status === "all" || i.status === status), [items, status]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  const change = (i: StoreReview, next: StoreReview["status"]) => setStatus.mutate({ id: i.id, status: next }, {
    onSuccess: () => toast.success(next === "approved" ? t("approved_toast") : t("hidden_toast")),
    onError: () => toast.error(t("save_error")),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<"all" | StoreReview["status"]>
          label={t("f_status")}
          value={status}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: items.length },
            { value: "pending", label: t("f_pending"), count: count("pending"), tone: "warning" },
            { value: "approved", label: t("f_approved"), count: count("approved") },
            { value: "rejected", label: t("f_rejected"), count: count("rejected") },
          ]}
        />
        <Button onClick={() => onOpen("nova")}><Plus className="mr-1.5 h-4 w-4" />{t("new_store_review")}</Button>
      </div>
      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{items.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {paged.items.map((i) => (
            <li key={i.id} className="rounded-[18px] border bg-card p-4 transition-colors duration-150 hover:border-primary/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button type="button" onClick={() => onOpen(i.id)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    {i.rating ? <Stars value={i.rating} /> : null}
                    {i.status !== "approved" && (
                      <Badge variant="outline" className={i.status === "pending" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}>{t(i.status)}</Badge>
                    )}
                  </div>
                  {i.body && <p className="mt-2 line-clamp-2 text-sm">{i.body}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[i.author_name || t("anonymous"), i.author_location, date(i.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {i.status === "approved"
                    ? <Button size="sm" variant="outline" onClick={() => change(i, "rejected")} disabled={setStatus.isPending}><EyeOff className="mr-1.5 h-4 w-4" />{t("hide")}</Button>
                    : <Button size="sm" variant="outline" onClick={() => change(i, "approved")} disabled={setStatus.isPending}><Check className="mr-1.5 h-4 w-4" />{t("approve")}</Button>}
                  <Button size="sm" variant="ghost" onClick={() => onOpen(i.id)}>{t("open")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

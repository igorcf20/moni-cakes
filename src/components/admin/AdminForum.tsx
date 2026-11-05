// =====================================================================================
// Admin > Aparência e conteúdo > Fórum (recurso forum em Admin > Recursos da loja). Sem janelas:
//   Tópicos    números (tópicos, respostas, participantes, para revisar, sem resposta), filtros, seção, busca e lista
//   topico     (ver=topico&id=<id>) texto do tópico (editar), respostas com aprovar, esconder e apagar, responder
//              como a loja (também em tópico fechado); ao lado: situação, seção, fixar, fechar e denúncias do tópico
//   Revisar    tópicos e respostas à espera de aprovação e denúncias abertas, com as ações na própria lista
//   Seções     criar, editar, ordenar, ligar e desligar e apagar seções (nome, endereço, descrição, idioma)
//   Regras     visitantes leem ou não, aprovação de tópicos e de respostas, prazo para o autor editar
// Regras no banco (migration 20261007190000_forum.sql); contas em src/lib/forum.ts; dados em src/hooks/useForum.ts;
// textos em src/i18n/adminForum.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Check, ChevronRight, ExternalLink, EyeOff, Flag, Loader2, Lock, MessageSquare, MessagesSquare, Pencil, Pin, Plus, Search, Send,
  Store, Trash2, Undo2, UserCircle2, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALE_NAMES, useMessages } from "@/i18n";
import { adminForumMessages } from "@/i18n/adminForum";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useStoreName } from "@/hooks/useBrand";
import {
  useAdminForumCategories, useAdminForumPosts, useAdminForumTopic, useAdminForumTopics, useDeleteForumCategory, useDeleteForumPost,
  useDeleteForumTopic, useForumReply, useForumReports, useForumRules, useForumStats, useResolveForumReport, useSaveForumCategory,
  useSaveForumRules, useUpdateForumPost, useUpdateForumTopic,
} from "@/hooks/useForum";
import {
  BODY_MAX, categoryErrors, EDIT_MINUTE_OPTIONS, EMPTY_CATEGORY, EMPTY_FORUM_STATS, FORUM_DEFAULTS, FORUM_LOCALES, FORUM_PATH, forumErrorOf, forumSlug,
  TITLE_MAX, topicErrors, topicPath, type AdminForumCategory, type AdminForumPost, type AdminForumTopic, type CategoryDraft, type ForumLocale,
  type ForumReport, type ForumRules, type ForumStatus,
} from "@/lib/forum";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminForumMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);

const STATUS_TONE: Record<ForumStatus, string> = {
  visible: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-800",
  hidden: "bg-muted text-muted-foreground",
};
function StatusChip({ t, status }: { t: T; status: ForumStatus }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{t(`st_${status}`)}</span>;
}

/** Quem escreveu: a loja com o ícone; o cliente com link para a página dele no Admin. */
function Author({ name, staff, userId, t }: { name: string | null; staff: boolean; userId: string | null; t: T }) {
  const storeName = useStoreName();
  if (staff) return <span className="inline-flex items-center gap-1 font-medium"><Store className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{storeName}</span>;
  if (!userId) return <span>{name || t("anon")}</span>;
  return <Link to={adminHref.customer(userId)} className="inline-flex items-center gap-1 font-medium text-brand-orange-text hover:underline"><UserCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{name || t("anon")}</Link>;
}

export default function AdminForum() {
  const { t } = useMessages(adminForumMessages);
  const page = useAdminPage();
  const { data: stats = EMPTY_FORUM_STATS } = useForumStats();
  if (page.view === "topico" && page.id) return <TopicPage id={page.id} onBack={page.close} />;
  const tab = ["revisar", "secoes", "regras"].includes(page.tab ?? "") ? page.tab! : "topicos";
  const review = stats.pending_topics + stats.pending_posts + stats.open_reports;
  return (
    <div className="space-y-5">
      <AdminHelp id="forum" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="topicos" className="px-4">{t("tab_topics")}</TabsTrigger>
          <TabsTrigger value="revisar" className="gap-2 px-4">
            {t("tab_review")}
            {review > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground">{review}</span>}
          </TabsTrigger>
          <TabsTrigger value="secoes" className="px-4">{t("tab_sections")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="topicos" className="mt-5"><TopicList onOpen={(id) => page.open("topico", id)} onReview={() => page.setTab("revisar")} /></TabsContent>
        <TabsContent value="revisar" className="mt-5"><Review onOpen={(id) => page.open("topico", id)} /></TabsContent>
        <TabsContent value="secoes" className="mt-5"><Sections /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Tópicos ---------- */

type ListFilter = "all" | "visible" | "pending" | "hidden" | "unanswered" | "pinned";

function TopicList({ onOpen, onReview }: { onOpen: (id: string) => void; onReview: () => void }) {
  const { t } = useMessages(adminForumMessages);
  const fmt = useAdminFormat();
  const { data: topics = [], isLoading, error } = useAdminForumTopics();
  const { data: cats = [] } = useAdminForumCategories();
  const { data: stats = EMPTY_FORUM_STATS } = useForumStats();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [section, setSection] = useState("");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  useEffect(() => setPg(1), [filter, section, q]);
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  const match = (x: AdminForumTopic, f: ListFilter) => f === "all" || (f === "unanswered" ? x.status === "visible" && x.reply_count === 0 && !x.locked
    : f === "pinned" ? x.pinned : x.status === f);
  const count = (f: ListFilter) => topics.filter((x) => match(x, f)).length;
  const s = q.trim().toLowerCase();
  const shown = topics.filter((x) => match(x, filter) && (!section || x.category_id === section)
    && (!s || x.title.toLowerCase().includes(s) || x.body.toLowerCase().includes(s) || (x.author_name ?? "").toLowerCase().includes(s)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const review = stats.pending_topics + stats.pending_posts + stats.open_reports;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={MessagesSquare} label={t("stat_topics")} value={stats.topics.toLocaleString()} hint={t("stat_topics_30d", { n: stats.topics_30d })} />
        <AdminStatCard icon={MessageSquare} label={t("stat_posts")} value={stats.posts.toLocaleString()} hint={stats.unanswered ? t("stat_unanswered", { n: stats.unanswered }) : undefined}
          onClick={() => setFilter("unanswered")} active={filter === "unanswered"} />
        <AdminStatCard icon={Users} label={t("stat_members")} value={stats.members.toLocaleString()} />
        <AdminStatCard icon={Flag} label={t("stat_review")} value={review.toLocaleString()} onClick={onReview} />
      </div>
      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: topics.length },
          { value: "visible", label: t("st_visible"), count: count("visible") },
          { value: "pending", label: t("st_pending"), count: count("pending") },
          { value: "hidden", label: t("st_hidden"), count: count("hidden") },
          { value: "unanswered", label: t("f_unanswered"), count: count("unanswered") },
          { value: "pinned", label: t("f_pinned"), count: count("pinned") },
        ]} />
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label={t("f_section")} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("all_sections")}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
          </div>
        </div>
      </div>
      {topics.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
          <MessagesSquare className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
          <a href={`${siteUrl()}${FORUM_PATH}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-orange-text hover:underline">{t("view_site")}<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      ) : shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <>
          <ul className="space-y-3">
            {shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpen(x.id)}
                  className="flex w-full items-center gap-4 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-orange-soft text-brand-orange-text"><MessagesSquare className="h-5 w-5" strokeWidth={1.8} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{x.title}</span>
                      {x.status !== "visible" && <StatusChip t={t} status={x.status} />}
                      {x.pinned && <Pin className="h-3.5 w-3.5 text-primary" aria-label={t("f_pinned")} />}
                      {x.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("locked")} />}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {[catName.get(x.category_id), x.is_staff ? t("by_store") : x.author_name || t("anon"), t("last_post", { when: fmt.relative(x.last_post_at) })].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="block text-lg font-semibold tabular-nums">{x.reply_count}</span>
                    <span className="block text-xs text-muted-foreground">{t("replies")}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
        </>
      )}
    </div>
  );
}

/* ---------- Página do tópico ---------- */

function TopicPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminForumMessages);
  const fmt = useAdminFormat();
  const { ask, confirmSlot } = useInlineConfirm();
  const { data: topic, isLoading } = useAdminForumTopic(id);
  const { data: posts = [] } = useAdminForumPosts(id);
  const { data: cats = [] } = useAdminForumCategories();
  const { data: reports = [] } = useForumReports();
  const update = useUpdateForumTopic();
  const del = useDeleteForumTopic();
  const resolve = useResolveForumReport();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => { if (topic) { setTitle(topic.title); setBody(topic.body); } }, [topic]);

  if (isLoading) return <Loading t={t} />;
  if (!topic) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("err_not_found_d")}</p></AdminSubpage>;

  const open = reports.filter((r) => r.topic_id === id && !r.resolved_at);
  const patch = async (p: Parameters<typeof update.mutateAsync>[0]["patch"], done: string) => {
    try { await update.mutateAsync({ id, patch: p }); toast.success(done); } catch { toast.error(t("save_error")); }
  };
  const saveText = async () => {
    if (topicErrors({ title, body }, false).length) { toast.error(t("err_text")); return; }
    await patch({ title, body }, t("saved"));
    setEditing(false);
  };
  const remove = async () => {
    if (!(await ask(t("delete_confirm", { title: topic.title }), { description: t("delete_d", { n: posts.length }), confirmLabel: t("delete"), tone: "danger" }))) return;
    try { await del.mutateAsync(id); toast.success(t("deleted")); onBack(); } catch { toast.error(t("save_error")); }
  };

  return (
    <AdminSubpage
      title={topic.title}
      subtitle={[cats.find((c) => c.id === topic.category_id)?.name, t(`st_${topic.status}`), t("replies_n", { n: topic.reply_count }), t("views_n", { n: topic.views })].filter(Boolean).join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={(
        <div className="flex items-center gap-1">
          {topic.status === "visible" && <a href={`${siteUrl()}${topicPath(topic.id)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-brand-orange-text hover:bg-muted">{t("view_site")}<ExternalLink className="h-3.5 w-3.5" /></a>}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
        </div>
      )}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[18px] border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="flex flex-wrap items-center gap-2"><Author name={topic.author_name} staff={topic.is_staff} userId={topic.user_id} t={t} /> · {fmt.dateTime(topic.created_at)}{topic.edited_at && ` · ${t("edited")}`}</span>
              {!editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" />{t("edit_text")}</Button>}
            </div>
            {editing ? (
              <div className="mt-3 space-y-3">
                <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} aria-label={t("f_title")} className="text-base font-semibold" />
                <Textarea rows={6} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t("f_body")} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setEditing(false); setTitle(topic.title); setBody(topic.body); }}>{t("cancel")}</Button>
                  <Button onClick={() => void saveText()} disabled={update.isPending}>{t("save")}</Button>
                </div>
              </div>
            ) : <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed">{topic.body}</p>}
          </section>

          <section className="space-y-3">
            <h4 className="font-semibold">{t("replies_title", { n: posts.length })}</h4>
            {posts.length === 0 ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("no_replies")}</p>
              : <ul className="space-y-3">{posts.map((p) => <PostRow key={p.id} post={p} t={t} ask={ask} reported={open.filter((r) => r.post_id === p.id)} />)}</ul>}
            <StaffReply topicId={id} locked={topic.locked} t={t} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-4 rounded-[18px] border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{t("status_title")}</h4>
              <StatusChip t={t} status={topic.status} />
            </div>
            {topic.status === "pending" && <Button className="w-full" onClick={() => void patch({ status: "visible" }, t("approved"))}><Check className="mr-1.5 h-4 w-4" />{t("approve")}</Button>}
            <div className="space-y-1.5">
              <Label htmlFor="ft-status">{t("f_status")}</Label>
              <select id="ft-status" value={topic.status} onChange={(e) => void patch({ status: e.target.value as ForumStatus }, t("saved"))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {(["visible", "pending", "hidden"] as ForumStatus[]).map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t(`st_${topic.status}_d`)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ft-section">{t("f_section")}</Label>
              <select id="ft-section" value={topic.category_id} onChange={(e) => void patch({ category_id: e.target.value }, t("moved"))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_pinned_label")}</span><span className="block text-xs text-muted-foreground">{t("f_pinned_d")}</span></span>
              <Switch checked={topic.pinned} onCheckedChange={(v) => void patch({ pinned: v }, v ? t("pinned_done") : t("unpinned_done"))} />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_locked_label")}</span><span className="block text-xs text-muted-foreground">{t("f_locked_d")}</span></span>
              <Switch checked={topic.locked} onCheckedChange={(v) => void patch({ locked: v }, v ? t("locked_done") : t("unlocked_done"))} />
            </label>
          </section>
          <section className="space-y-3 rounded-[18px] border bg-card p-4">
            <h4 className="flex items-center gap-2 font-semibold"><Flag className="h-4 w-4 text-primary" />{t("reports_title")}</h4>
            {open.length === 0 ? <p className="text-sm text-muted-foreground">{t("reports_none")}</p> : (
              <>
                <ul className="space-y-2">
                  {open.map((r) => (
                    <li key={r.id} className="rounded-xl bg-muted/50 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">{r.post_id ? t("report_on_reply") : t("report_on_topic")} · {fmt.relative(r.created_at)}</p>
                      <p className="mt-1">{r.reason}</p>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full" onClick={() => void resolve.mutateAsync(open.map((r) => r.id)).then(() => toast.success(t("resolved")))}><Check className="mr-1.5 h-4 w-4" />{t("resolve_all")}</Button>
              </>
            )}
          </section>
        </aside>
      </div>
    </AdminSubpage>
  );
}

type Ask = ReturnType<typeof useInlineConfirm>["ask"];

function PostRow({ post, t, ask, reported, topicTitle, onOpen }: { post: AdminForumPost; t: T; ask: Ask; reported?: ForumReport[]; topicTitle?: string; onOpen?: () => void }) {
  const fmt = useAdminFormat();
  const update = useUpdateForumPost();
  const del = useDeleteForumPost();
  const set = async (status: ForumStatus, done: string) => {
    try { await update.mutateAsync({ id: post.id, patch: { status } }); toast.success(done); } catch { toast.error(t("save_error")); }
  };
  const remove = async () => {
    if (!(await ask(t("delete_reply_confirm"), { description: t("delete_reply_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try { await del.mutateAsync(post.id); toast.success(t("reply_deleted")); } catch { toast.error(t("save_error")); }
  };
  return (
    <li className={cn("rounded-[18px] border bg-card p-4", post.is_staff && "border-primary/30 bg-brand-orange-soft/30", post.status === "hidden" && "opacity-70")}>
      {topicTitle && onOpen && <button type="button" onClick={onOpen} className="mb-2 text-sm font-semibold text-brand-orange-text hover:underline">{t("in_topic", { title: topicTitle })}</button>}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Author name={post.author_name} staff={post.is_staff} userId={post.user_id} t={t} />
        <span>· {fmt.dateTime(post.created_at)}{post.edited_at && ` · ${t("edited")}`}</span>
        {post.status !== "visible" && <StatusChip t={t} status={post.status} />}
        {!!reported?.length && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"><Flag className="h-3 w-3" />{t("reports_n", { n: reported.length })}</span>}
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed">{post.body}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {post.status !== "visible" && <Button size="sm" variant={post.status === "pending" ? "default" : "outline"} onClick={() => void set("visible", t("approved"))} disabled={update.isPending}><Check className="mr-1.5 h-4 w-4" />{post.status === "pending" ? t("approve") : t("show")}</Button>}
        {post.status !== "hidden" && <Button size="sm" variant="ghost" onClick={() => void set("hidden", t("hidden_done"))} disabled={update.isPending}><EyeOff className="mr-1.5 h-4 w-4" />{t("hide")}</Button>}
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
      </div>
    </li>
  );
}

function StaffReply({ topicId, locked, t }: { topicId: string; locked: boolean; t: T }) {
  const storeName = useStoreName();
  const reply = useForumReply();
  const [body, setBody] = useState("");
  const send = async () => {
    if (body.trim().length < 2) { toast.error(t("err_reply")); return; }
    try { await reply.mutateAsync({ topicId, body }); setBody(""); toast.success(t("reply_sent")); } catch (x) { toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`)); }
  };
  return (
    <div className="space-y-2 rounded-[18px] border bg-card p-4">
      <Label htmlFor="ft-reply" className="flex items-center gap-1.5"><Store className="h-4 w-4 text-primary" />{t("staff_reply", { name: storeName })}</Label>
      <Textarea id="ft-reply" rows={4} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("staff_reply_ph")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{locked ? t("staff_reply_locked") : t("staff_reply_d")}</p>
        <Button onClick={() => void send()} disabled={reply.isPending}><Send className="mr-1.5 h-4 w-4" />{t("send_reply")}</Button>
      </div>
    </div>
  );
}

/* ---------- Revisar ---------- */

function Review({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminForumMessages);
  const fmt = useAdminFormat();
  const { ask, confirmSlot } = useInlineConfirm();
  const { data: topics = [], isLoading } = useAdminForumTopics();
  const { data: pendingPosts = [] } = useAdminForumPosts(null);
  const { data: reports = [] } = useForumReports();
  const update = useUpdateForumTopic();
  const updatePost = useUpdateForumPost();
  const resolve = useResolveForumReport();
  const byId = useMemo(() => new Map(topics.map((x) => [x.id, x])), [topics]);
  if (isLoading) return <Loading t={t} />;
  const waiting = topics.filter((x) => x.status === "pending");
  const open = reports.filter((r) => !r.resolved_at);
  const setTopic = async (id: string, status: ForumStatus, done: string) => {
    try { await update.mutateAsync({ id, patch: { status } }); toast.success(done); } catch { toast.error(t("save_error")); }
  };
  const hideTarget = async (r: ForumReport) => {
    try {
      if (r.post_id) await updatePost.mutateAsync({ id: r.post_id, patch: { status: "hidden" } });
      else await update.mutateAsync({ id: r.topic_id, patch: { status: "hidden" } });
      await resolve.mutateAsync(open.filter((o) => o.topic_id === r.topic_id && o.post_id === r.post_id).map((o) => o.id));
      toast.success(t("hidden_done"));
    } catch { toast.error(t("save_error")); }
  };

  if (!waiting.length && !pendingPosts.length && !open.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <Check className="h-8 w-8 text-emerald-600" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("review_empty")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {confirmSlot}
      {waiting.length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold">{t("review_topics", { n: waiting.length })}</h4>
          <ul className="space-y-3">
            {waiting.map((x) => (
              <li key={x.id} className="rounded-[18px] border bg-card p-4">
                <button type="button" onClick={() => onOpen(x.id)} className="text-left font-semibold hover:text-brand-orange-text">{x.title}</button>
                <p className="mt-0.5 text-sm text-muted-foreground"><Author name={x.author_name} staff={x.is_staff} userId={x.user_id} t={t} /> · {fmt.dateTime(x.created_at)}</p>
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-[15px]">{x.body}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => void setTopic(x.id, "visible", t("approved"))}><Check className="mr-1.5 h-4 w-4" />{t("approve")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void setTopic(x.id, "hidden", t("hidden_done"))}><EyeOff className="mr-1.5 h-4 w-4" />{t("hide")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(x.id)}>{t("open")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pendingPosts.length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold">{t("review_posts", { n: pendingPosts.length })}</h4>
          <ul className="space-y-3">
            {pendingPosts.map((p) => <PostRow key={p.id} post={p} t={t} ask={ask} topicTitle={byId.get(p.topic_id)?.title ?? ""} onOpen={() => onOpen(p.topic_id)} />)}
          </ul>
        </section>
      )}
      {open.length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold">{t("review_reports", { n: open.length })}</h4>
          <ul className="space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded-[18px] border bg-card p-4">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Flag className="h-4 w-4 text-destructive" />{r.post_id ? t("report_on_reply") : t("report_on_topic")} · {fmt.relative(r.created_at)}
                </p>
                <p className="mt-1 font-medium">{r.reason}</p>
                <button type="button" onClick={() => onOpen(r.topic_id)} className="mt-1 text-sm font-semibold text-brand-orange-text hover:underline">{t("in_topic", { title: byId.get(r.topic_id)?.title ?? "" })}</button>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => void hideTarget(r)}><EyeOff className="mr-1.5 h-4 w-4" />{r.post_id ? t("hide_reply") : t("hide_topic")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void resolve.mutateAsync([r.id]).then(() => toast.success(t("resolved")))}><X className="mr-1.5 h-4 w-4" />{t("dismiss")}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Seções ---------- */

function Sections() {
  const { t } = useMessages(adminForumMessages);
  const { data: cats = [], isLoading } = useAdminForumCategories();
  const { data: topics = [] } = useAdminForumTopics();
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of topics) m.set(x.category_id, (m.get(x.category_id) ?? 0) + 1);
    return m;
  }, [topics]);
  if (isLoading) return <Loading t={t} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("sections_d")}</p>
        {editing !== "novo" && <Button onClick={() => setEditing("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_section")}</Button>}
      </div>
      {editing === "novo" && <SectionForm cat={null} all={cats} t={t} onDone={() => setEditing(null)} topics={0} />}
      {cats.length === 0 && editing !== "novo" ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("sections_empty")}</p> : (
        <ul className="space-y-3">
          {cats.map((c) => editing === c.id ? <li key={c.id}><SectionForm cat={c} all={cats} t={t} onDone={() => setEditing(null)} topics={counts.get(c.id) ?? 0} /></li> : (
            <li key={c.id} className={cn("flex items-center gap-4 rounded-[18px] border bg-card p-4", !c.is_active && "opacity-70")}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  {!c.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("section_off")}</span>}
                  {c.locale && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{LOCALE_NAMES[c.locale]}</span>}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">{FORUM_PATH}/{c.slug} · {t("topics_n", { n: counts.get(c.id) ?? 0 })}{c.description ? ` · ${c.description}` : ""}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(c.id)}><Pencil className="mr-1.5 h-4 w-4" />{t("edit")}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionForm({ cat, all, t, onDone, topics }: { cat: AdminForumCategory | null; all: AdminForumCategory[]; t: T; onDone: () => void; topics: number }) {
  const { ask, confirmSlot } = useInlineConfirm();
  const save = useSaveForumCategory();
  const del = useDeleteForumCategory();
  const [f, setF] = useState<CategoryDraft>(cat ? { slug: cat.slug, name: cat.name, description: cat.description, locale: cat.locale, sort_order: cat.sort_order, is_active: cat.is_active }
    : { ...EMPTY_CATEGORY, sort_order: all.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1 });
  const [slugTouched, setSlugTouched] = useState(!!cat);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof CategoryDraft>(k: K, v: CategoryDraft[K]) => setF((p) => ({ ...p, [k]: v }));
  const errs = categoryErrors(f, all, cat?.id ?? null);
  const submit = async () => {
    setTried(true);
    if (errs.length) return;
    try { await save.mutateAsync({ id: cat?.id ?? null, draft: { ...f, slug: f.slug.trim() } }); toast.success(t("section_saved")); onDone(); } catch { toast.error(t("save_error")); }
  };
  const remove = async () => {
    if (!cat) return;
    if (!(await ask(t("section_delete_confirm", { name: cat.name }), { description: topics ? t("section_delete_d", { n: topics }) : t("section_delete_empty_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try { await del.mutateAsync(cat.id); toast.success(t("section_deleted")); onDone(); } catch { toast.error(t("save_error")); }
  };
  return (
    <div className="space-y-4 rounded-[18px] border border-primary/40 bg-card p-4 sm:p-5">
      {confirmSlot}
      <h4 className="font-semibold">{cat ? t("edit_section") : t("new_section")}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fs-name">{t("f_name")}</Label>
          <Input id="fs-name" value={f.name} maxLength={80} placeholder={t("f_name_ph")} aria-invalid={tried && errs.includes("name")}
            onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", forumSlug(e.target.value)); }} />
          {tried && errs.includes("name") && <p className="text-xs text-destructive">{t("err_name")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fs-slug">{t("f_slug")}</Label>
          <Input id="fs-slug" value={f.slug} maxLength={80} aria-invalid={tried && errs.some((e) => e.startsWith("slug"))}
            onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} />
          {tried && errs.includes("slug") ? <p className="text-xs text-destructive">{t("err_slug")}</p>
            : tried && errs.includes("slug_taken") ? <p className="text-xs text-destructive">{t("err_slug_taken")}</p>
              : <p className="text-xs text-muted-foreground">{siteUrl()}{FORUM_PATH}/{f.slug || "..."}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fs-desc">{t("f_desc")}</Label>
        <Textarea id="fs-desc" rows={2} maxLength={300} value={f.description ?? ""} placeholder={t("f_desc_ph")} onChange={(e) => set("description", e.target.value || null)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fs-locale">{t("f_locale")}</Label>
          <select id="fs-locale" value={f.locale ?? ""} onChange={(e) => set("locale", (e.target.value || null) as ForumLocale | null)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("all_locales")}</option>
            {FORUM_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fs-order">{t("f_order")}</Label>
          <Input id="fs-order" type="number" value={f.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:mt-6">
          <span className="text-sm font-medium">{t("f_active")}</span>
          <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {cat ? <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}><Undo2 className="mr-1.5 h-4 w-4" />{t("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>{t("save")}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminForumMessages);
  const { data } = useForumRules();
  const save = useSaveForumRules();
  const [f, setF] = useState<ForumRules>(FORUM_DEFAULTS);
  useEffect(() => { if (data) setF(data); }, [data]);
  const toggle = (k: "guests_read" | "moderate_topics" | "moderate_posts", label: string, d: string) => (
    <label className="flex items-start justify-between gap-4 rounded-[14px] border p-4">
      <span><span className="block font-medium">{label}</span><span className="mt-0.5 block text-sm text-muted-foreground">{d}</span></span>
      <Switch checked={f[k]} onCheckedChange={(v) => setF((p) => ({ ...p, [k]: v }))} />
    </label>
  );
  const submit = async () => {
    try { await save.mutateAsync(f); toast.success(t("rules_saved")); } catch { toast.error(t("save_error")); }
  };
  return (
    <div className="max-w-2xl space-y-3">
      {toggle("guests_read", t("r_guests"), t("r_guests_d"))}
      {toggle("moderate_topics", t("r_mod_topics"), t("r_mod_topics_d"))}
      {toggle("moderate_posts", t("r_mod_posts"), t("r_mod_posts_d"))}
      <div className="space-y-1.5 rounded-[14px] border p-4">
        <Label htmlFor="fr-edit">{t("r_edit")}</Label>
        <select id="fr-edit" value={f.edit_minutes} onChange={(e) => setF((p) => ({ ...p, edit_minutes: Number(e.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-64">
          {EDIT_MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{t(`r_edit_${m}`)}</option>)}
        </select>
        <p className="text-sm text-muted-foreground">{t("r_edit_d")}</p>
      </div>
      <p className="rounded-[14px] bg-muted/50 p-4 text-sm text-muted-foreground">{t("r_limits")}</p>
      <div className="flex justify-end"><Button onClick={() => void submit()} disabled={save.isPending}>{t("save")}</Button></div>
    </div>
  );
}

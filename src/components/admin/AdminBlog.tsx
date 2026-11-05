// =====================================================================================
// Admin > Aparência e conteúdo > Blog (recurso blog em Admin > Recursos da loja). Sem janelas:
//   Artigos      números (publicados, agendados, rascunhos, leituras), filtros, busca e lista
//   artigo       (ver=artigo&id=<id> ou id=novo) título, endereço, resumo, texto, capa, produtos ligados, SEO com
//                prévia do Google; ao lado: estado (rascunho ou publicado, data no futuro = agendado), idioma,
//                autor, assuntos, destaque, comentários abertos; comentários do artigo; apagar
//   Comentários  à espera, aprovados e recusados: aprovar, recusar, responder como loja e apagar
//   Regras       artigos por página, comentários ligados, aprovação antes de aparecer
// Regras no banco (migration 20261007160000_blog.sql); contas em src/lib/blog.ts; dados em src/hooks/useBlog.ts;
// textos em src/i18n/adminBlog.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, CalendarClock, Check, ChevronRight, Eye, ExternalLink, FileEdit, Loader2, MessageSquare, Newspaper, Plus, Reply,
  Search, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import RichTextEditor from "./RichTextEditor";
import StorageImageUploader from "./StorageImageUploader";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALE_NAMES, useMessages } from "@/i18n";
import { adminBlogMessages } from "@/i18n/adminBlog";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useLinkProductOptions } from "@/hooks/useCrossSell";
import {
  useAdminBlogComments, useAdminBlogPosts, useBlogSettings, useDeleteBlogComment, useDeleteBlogPost, useModerateBlogComment,
  useSaveBlogPost, useSaveBlogSettings, type AdminBlogComment,
} from "@/hooks/useBlog";
import {
  blogDraftErrors, blogExcerpt, blogSlug, blogState, BLOG_LOCALES, BLOG_PATH, EMPTY_BLOG_DRAFT, parseTags, readingMinutes,
  type BlogDraft, type BlogLocale, type BlogSettings, type BlogState,
} from "@/lib/blog";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminBlogMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);

const STATE_TONE: Record<BlogState, string> = {
  published: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-sky-50 text-sky-800",
  draft: "bg-muted text-muted-foreground",
};
function StateChip({ t, state }: { t: T; state: BlogState }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_TONE[state])}>{t(`state_${state}`)}</span>;
}

/** ISO para o campo datetime-local (hora local) e de volta. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function AdminBlog() {
  const { t } = useMessages(adminBlogMessages);
  const page = useAdminPage();
  const { data: comments = [] } = useAdminBlogComments();
  const pending = comments.filter((c) => c.status === "pending").length;
  const tab = ["comentarios", "regras"].includes(page.tab ?? "") ? page.tab! : "artigos";
  if (page.view === "artigo" && page.id) return <PostPage id={page.id} onBack={page.close} onOpen={(id) => page.open("artigo", id)} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="blog" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="artigos" className="px-4">{t("tab_posts")}</TabsTrigger>
          <TabsTrigger value="comentarios" className="gap-1.5 px-4">
            {t("tab_comments")}
            {pending > 0 && <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{pending}</span>}
          </TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="artigos" className="mt-5"><PostList onOpen={(id) => page.open("artigo", id)} pending={pending} onComments={() => page.setTab("comentarios")} /></TabsContent>
        <TabsContent value="comentarios" className="mt-5"><CommentList postId={null} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Artigos ---------- */

type ListFilter = "all" | BlogState | "featured";

function PostList({ onOpen, pending, onComments }: { onOpen: (id: string) => void; pending: number; onComments: () => void }) {
  const { t } = useMessages(adminBlogMessages);
  const fmt = useAdminFormat();
  const { data: posts = [], isLoading, error } = useAdminBlogPosts();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const rows = useMemo(() => posts.map((p) => ({ p, state: blogState(p) })), [posts]);
  useEffect(() => setPg(1), [filter, q]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!posts.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <Newspaper className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
        <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
      </div>
    );
  }

  const count = (s: BlogState) => rows.filter((r) => r.state === s).length;
  const views = posts.reduce((s, p) => s + p.views, 0);
  const s = q.trim().toLowerCase();
  const shown = rows.filter(({ p, state }) => (filter === "all" || (filter === "featured" ? p.featured : state === filter))
    && (!s || p.title.toLowerCase().includes(s) || p.slug.includes(s) || p.tags.some((x) => x.includes(s)) || (p.author_name ?? "").toLowerCase().includes(s)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const top = [...posts].filter((p) => blogState(p) === "published").sort((a, b) => b.views - a.views)[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Newspaper} label={t("stat_published")} value={count("published")} onClick={() => setFilter("published")} active={filter === "published"} />
        <AdminStatCard icon={CalendarClock} label={t("stat_scheduled")} value={count("scheduled")} onClick={() => setFilter("scheduled")} active={filter === "scheduled"} />
        <AdminStatCard icon={FileEdit} label={t("stat_drafts")} value={count("draft")} onClick={() => setFilter("draft")} active={filter === "draft"} />
        <AdminStatCard icon={Eye} label={t("stat_views")} value={views.toLocaleString()} hint={top && top.views > 0 ? t("stat_top", { title: top.title }) : undefined} />
      </div>
      {pending > 0 && (
        <button type="button" onClick={onComments} className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-primary/30 bg-primary/5 p-4 text-left text-sm font-medium transition-colors duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("pending_banner", { n: pending })}</span>
          <ChevronRight className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />
        </button>
      )}

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "published", label: t("state_published"), count: count("published") },
            { value: "scheduled", label: t("state_scheduled"), count: count("scheduled") },
            { value: "draft", label: t("state_draft"), count: count("draft") },
            { value: "featured", label: t("f_featured_list"), count: posts.filter((p) => p.featured).length },
          ]} />
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <>
          <ul className="space-y-3">
            {shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map(({ p, state }) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-center gap-3">
                    {p.cover_url ? <img src={p.cover_url} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                      : <span className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-primary/10 text-brand-orange-text"><Newspaper className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{p.title}</span>
                        <StateChip t={t} state={state} />
                        {p.featured && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-orange-text">{t("featured")}</span>}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {[p.locale ? LOCALE_NAMES[p.locale] : t("all_locales"),
                          state === "draft" ? t("edited", { when: fmt.relative(p.updated_at) }) : state === "scheduled" ? t("goes_live", { when: fmt.dateTime(p.published_at!) }) : fmt.date(p.published_at!),
                          p.tags.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-4 self-end sm:self-auto">
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{p.views.toLocaleString()}</span>
                      <span className="block text-xs text-muted-foreground">{t("row_views")}</span>
                    </span>
                    <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                  </span>
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

/* ---------- Página do artigo ---------- */

function PostPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminBlogMessages);
  const fmt = useAdminFormat();
  const isNew = id === "novo";
  const { data: posts = [], isLoading } = useAdminBlogPosts();
  const { data: comments = [] } = useAdminBlogComments();
  const save = useSaveBlogPost();
  const del = useDeleteBlogPost();
  const { ask, confirmSlot } = useInlineConfirm();
  const p = posts.find((x) => x.id === id);
  const [f, setF] = useState<BlogDraft>(EMPTY_BLOG_DRAFT);
  const [tagsRaw, setTagsRaw] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [when, setWhen] = useState("");
  const [tried, setTried] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Recarrega o formulário só quando o artigo muda no banco.
  useEffect(() => {
    if (p) {
      const { id: _id, views: _v, created_at: _c, updated_at: _u, ...draft } = p;
      setF(draft);
      setTagsRaw(p.tags.join(", "));
      setWhen(toLocalInput(p.published_at));
      setSlugTouched(true);
      setEditorKey((k) => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.updated_at]);

  if (isLoading) return <Loading t={t} />;
  if (!isNew && !p) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("load_error")}</p></AdminSubpage>;

  const set = <K extends keyof BlogDraft>(k: K, v: BlogDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTitle = (title: string) => setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : blogSlug(title) }));
  const state = blogState({ status: f.status, published_at: f.status === "published" ? fromLocalInput(when) : null });
  const errs = blogDraftErrors(f, posts, isNew ? null : id, f.status === "published");
  const postComments = comments.filter((c) => c.post_id === id);
  const live = p && blogState(p) === "published";

  const submit = async (status: BlogDraft["status"]) => {
    setTried(true);
    const draft: BlogDraft = { ...f, status, tags: parseTags(tagsRaw), published_at: status === "published" ? (fromLocalInput(when) ?? new Date().toISOString()) : fromLocalInput(when) };
    if (blogDraftErrors(draft, posts, isNew ? null : id, status === "published").length) return;
    try {
      const newId = await save.mutateAsync({ id: isNew ? null : id, draft });
      toast.success(status === "published" ? (blogState(draft) === "scheduled" ? t("scheduled_toast") : t("published_toast")) : t("saved"));
      if (isNew) onOpen(newId);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? "").includes("blog_posts_slug_key") ? t("err_slug_taken") : t("save_error"));
    }
  };
  const remove = async () => {
    if (!p) return;
    if (!(await ask(t("delete_confirm", { title: p.title }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(p.id);
      toast.success(t("deleted"));
      onBack();
    } catch {
      toast.error(t("save_error"));
    }
  };

  const seoTitle = f.seo_title || f.title || t("f_title");
  const seoDesc = f.seo_description || blogExcerpt(f, 160) || t("seo_empty");

  return (
    <AdminSubpage
      title={isNew ? t("new") : p!.title}
      subtitle={isNew ? t("new_d") : [t(`state_${blogState(p!)}`), t("edited", { when: fmt.relative(p!.updated_at) }), t("views_n", { n: p!.views })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && (
        <div className="flex items-center gap-1">
          {live && <a href={`${siteUrl()}${BLOG_PATH}/${p!.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-brand-orange-text hover:bg-muted">{t("view_site")}<ExternalLink className="h-3.5 w-3.5" /></a>}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
        </div>
      )}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="bp-title">{t("f_title")}</Label>
              <Input id="bp-title" value={f.title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-invalid={tried && errs.includes("title")} className="text-base" />
              {tried && errs.includes("title") && <p className="text-xs text-destructive">{t("err_title")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-slug">{t("f_slug")}</Label>
              <div className="flex items-center gap-2">
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{BLOG_PATH}/</span>
                <Input id="bp-slug" value={f.slug} maxLength={120} onChange={(e) => { setSlugTouched(true); set("slug", blogSlug(e.target.value) || e.target.value.toLowerCase()); }}
                  aria-invalid={tried && (errs.includes("slug") || errs.includes("slug_taken"))} className="font-mono" />
              </div>
              {tried && errs.includes("slug") ? <p className="text-xs text-destructive">{t("err_slug")}</p>
                : tried && errs.includes("slug_taken") ? <p className="text-xs text-destructive">{t("err_slug_taken")}</p>
                : <p className="text-xs text-muted-foreground">{t("f_slug_d")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-excerpt">{t("f_excerpt")}</Label>
              <Textarea id="bp-excerpt" rows={2} maxLength={600} value={f.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value || null)} placeholder={t("f_excerpt_ph")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("f_body")}</Label>
              <RichTextEditor key={editorKey} value={f.body ?? ""} onChange={(v) => set("body", v)} placeholder={t("f_body_ph")} className="[&_.ProseMirror]:min-h-[360px]" />
              {tried && errs.includes("body") ? <p className="text-xs text-destructive">{t("err_body")}</p> : <p className="text-xs text-muted-foreground">{t("reading", { n: readingMinutes(f.body) })}</p>}
            </div>
          </section>

          <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
            <h4 className="font-semibold">{t("cover_title")}</h4>
            <StorageImageUploader value={f.cover_url ?? ""} onChange={(url) => set("cover_url", url || null)} bucket="product-images" folder="blog" label="" previewAspect="aspect-[16/9]" hint={t("cover_hint")} />
            <div className="space-y-1.5">
              <Label htmlFor="bp-alt">{t("f_alt")}</Label>
              <Input id="bp-alt" value={f.cover_alt ?? ""} maxLength={200} onChange={(e) => set("cover_alt", e.target.value || null)} placeholder={t("f_alt_ph")} />
            </div>
          </section>

          <ProductsPicker ids={f.product_ids} onChange={(ids) => set("product_ids", ids)} t={t} />

          <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
            <div>
              <h4 className="font-semibold">{t("seo_title")}</h4>
              <p className="text-sm text-muted-foreground">{t("seo_d")}</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="truncate text-xs text-emerald-700">{siteUrl().replace(/^https?:\/\//, "")}{BLOG_PATH}/{f.slug || "..."}</p>
              <p className="truncate text-[17px] text-[#1a0dab]">{seoTitle}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{seoDesc}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-seo-t">{t("f_seo_title")}</Label>
              <Input id="bp-seo-t" value={f.seo_title ?? ""} maxLength={200} onChange={(e) => set("seo_title", e.target.value || null)} placeholder={f.title} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-seo-d">{t("f_seo_desc")}</Label>
              <Textarea id="bp-seo-d" rows={2} maxLength={300} value={f.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value || null)} placeholder={blogExcerpt(f, 160)} />
              <p className="text-xs text-muted-foreground">{t("seo_len", { n: (f.seo_description ?? "").length })}</p>
            </div>
          </section>

          {!isNew && (
            <section className="space-y-3">
              <h4 className="font-semibold">{t("post_comments", { n: postComments.length })}</h4>
              {postComments.length ? <CommentList postId={id} /> : <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("post_comments_none")}</p>}
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="space-y-4 rounded-[18px] border bg-card p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{t("publish_title")}</h4>
              <StateChip t={t} state={isNew && f.status === "draft" ? "draft" : state} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-when">{t("f_when")}</Label>
              <Input id="bp-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("f_when_d")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-locale">{t("f_locale")}</Label>
              <select id="bp-locale" value={f.locale ?? ""} onChange={(e) => set("locale", (e.target.value || null) as BlogLocale | null)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{t("all_locales")}</option>
                {BLOG_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t("f_locale_d")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-author">{t("f_author")}</Label>
              <Input id="bp-author" value={f.author_name ?? ""} maxLength={120} onChange={(e) => set("author_name", e.target.value || null)} placeholder={t("f_author_ph")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-tags">{t("f_tags")}</Label>
              <Input id="bp-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder={t("f_tags_ph")} />
              <p className="text-xs text-muted-foreground">{t("f_tags_d")}</p>
            </div>
            <label className="flex items-start justify-between gap-3 border-t pt-3">
              <span><span className="block text-sm font-medium">{t("f_featured")}</span><span className="block text-xs text-muted-foreground">{t("f_featured_d")}</span></span>
              <Switch checked={f.featured} onCheckedChange={(v) => set("featured", v)} aria-label={t("f_featured")} />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_comments")}</span><span className="block text-xs text-muted-foreground">{t("f_comments_d")}</span></span>
              <Switch checked={f.allow_comments} onCheckedChange={(v) => set("allow_comments", v)} aria-label={t("f_comments")} />
            </label>
            {tried && errs.length > 0 && <p className="text-sm text-destructive" role="alert">{t("err_fix")}</p>}
            <div className="flex flex-col gap-2 border-t pt-3">
              <Button onClick={() => void submit("published")} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {when && new Date(when).getTime() > Date.now() ? t("schedule") : f.status === "published" && !isNew ? t("update") : t("publish")}
              </Button>
              <Button variant="outline" onClick={() => void submit("draft")} disabled={save.isPending}>{f.status === "published" && !isNew ? t("unpublish") : t("save_draft")}</Button>
            </div>
          </section>
        </aside>
      </div>
    </AdminSubpage>
  );
}

function ProductsPicker({ ids, onChange, t }: { ids: string[]; onChange: (ids: string[]) => void; t: T }) {
  const { data: options = [] } = useLinkProductOptions();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return options.filter((o) => !ids.includes(o.id) && [o.name, o.id, o.sku ?? "", o.category ?? ""].some((v) => v.toLowerCase().includes(s))).slice(0, 8);
  }, [q, options, ids]);
  const move = (i: number, d: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h4 className="font-semibold">{t("products_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("products_d")}</p>
      </div>
      {ids.length > 0 && (
        <ol className="divide-y rounded-xl border">
          {ids.map((pid, i) => {
            const o = byId.get(pid);
            return (
              <li key={pid} className="flex items-center gap-3 p-2.5">
                {o?.image ? <img src={o.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o?.name ?? pid}{o && !o.is_active && <span className="ml-1 text-xs text-amber-700">{t("hidden")}</span>}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} aria-label={t("move_up")} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === ids.length - 1} aria-label={t("move_down")} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("remove")} onClick={() => onChange(ids.filter((x) => x !== pid))}><X className="h-4 w-4" /></Button>
              </li>
            );
          })}
        </ol>
      )}
      {ids.length < 12 && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("products_search")} aria-label={t("products_search")} className="pl-9" />
          </div>
          {q.trim() && (results.length === 0 ? <p className="text-sm text-muted-foreground">{t("no_results")}</p> : (
            <ul className="divide-y rounded-xl border">
              {results.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => { onChange([...ids, o.id]); setQ(""); }} className="flex w-full items-center gap-3 p-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    {o.image ? <img src={o.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-muted" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-orange-text"><Plus className="h-3.5 w-3.5" />{t("add")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </>
      )}
    </section>
  );
}

/* ---------- Comentários ---------- */

type CommentFilter = "pending" | "approved" | "rejected" | "all";

function CommentList({ postId }: { postId: string | null }) {
  const { t } = useMessages(adminBlogMessages);
  const { data: all = [], isLoading, error } = useAdminBlogComments();
  const [filter, setFilter] = useState<CommentFilter>(postId ? "all" : "pending");
  const [pg, setPg] = useState(1);
  const list = postId ? all.filter((c) => c.post_id === postId) : all;
  useEffect(() => setPg(1), [filter]);
  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("comments_empty")}</p>
      </div>
    );
  }
  const count = (s: AdminBlogComment["status"]) => list.filter((c) => c.status === s).length;
  const shown = list.filter((c) => filter === "all" || c.status === filter);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  return (
    <div className="space-y-4">
      {!postId && (
        <div className="grid grid-cols-3 gap-3">
          <AdminStatCard icon={MessageSquare} label={t("c_pending")} value={count("pending")} tone={count("pending") ? "warning" : "default"} onClick={() => setFilter("pending")} active={filter === "pending"} />
          <AdminStatCard icon={Check} label={t("c_approved")} value={count("approved")} tone="success" onClick={() => setFilter("approved")} active={filter === "approved"} />
          <AdminStatCard icon={X} label={t("c_rejected")} value={count("rejected")} onClick={() => setFilter("rejected")} active={filter === "rejected"} />
        </div>
      )}
      <div className="rounded-[18px] border bg-card p-4">
        <FilterChips<CommentFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "pending", label: t("c_pending"), count: count("pending"), tone: "warning" },
          { value: "approved", label: t("c_approved"), count: count("approved") },
          { value: "rejected", label: t("c_rejected"), count: count("rejected") },
          { value: "all", label: t("f_all"), count: list.length },
        ]} />
      </div>
      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-8 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <>
          <ul className="space-y-3">{shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map((c) => <CommentRow key={c.id} c={c} showPost={!postId} />)}</ul>
          <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
        </>
      )}
    </div>
  );
}

function CommentRow({ c, showPost }: { c: AdminBlogComment; showPost: boolean }) {
  const { t } = useMessages(adminBlogMessages);
  const fmt = useAdminFormat();
  const moderate = useModerateBlogComment();
  const del = useDeleteBlogComment();
  const { ask, confirmSlot } = useInlineConfirm();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(c.admin_reply ?? "");
  const act = async (status: AdminBlogComment["status"]) => {
    try {
      await moderate.mutateAsync({ id: c.id, status });
      toast.success(status === "approved" ? t("approved_toast") : t("rejected_toast"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const saveReply = async () => {
    try {
      await moderate.mutateAsync({ id: c.id, reply, ...(c.status === "pending" ? { status: "approved" as const } : {}) });
      toast.success(t("reply_saved"));
      setReplying(false);
    } catch {
      toast.error(t("save_error"));
    }
  };
  const remove = async () => {
    if (!(await ask(t("c_delete_confirm"), { description: t("c_delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(c.id);
      toast.success(t("c_deleted"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const tone = c.status === "pending" ? "bg-amber-50 text-amber-800" : c.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground";
  return (
    <li className="space-y-3 rounded-[18px] border bg-card p-4">
      {confirmSlot}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{c.author_name || t("anon")}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{t(`cs_${c.status}`)}</span>
        <span className="text-muted-foreground">{fmt.relative(c.created_at)}</span>
        {showPost && c.post && <span className="min-w-0 truncate text-muted-foreground">{t("on_post", { title: c.post.title })}</span>}
      </div>
      <p className="whitespace-pre-line text-sm">{c.body}</p>
      {c.admin_reply && !replying && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p className="text-xs font-semibold text-brand-orange-text">{t("store_reply")}</p>
          <p className="whitespace-pre-line">{c.admin_reply}</p>
        </div>
      )}
      {replying && (
        <div className="space-y-2">
          <Label htmlFor={`br-${c.id}`}>{t("reply_label")}</Label>
          <Textarea id={`br-${c.id}`} rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("reply_ph")} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setReplying(false); setReply(c.admin_reply ?? ""); }}>{t("cancel")}</Button>
            <Button size="sm" onClick={() => void saveReply()} disabled={moderate.isPending}>{c.status === "pending" ? t("reply_approve") : t("reply_save")}</Button>
          </div>
        </div>
      )}
      {!replying && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
          <Button size="sm" variant="outline" onClick={() => setReplying(true)}><Reply className="mr-1.5 h-4 w-4" />{c.admin_reply ? t("reply_edit") : t("reply")}</Button>
          {c.status !== "rejected" && <Button size="sm" variant="outline" onClick={() => void act("rejected")} disabled={moderate.isPending}><X className="mr-1.5 h-4 w-4" />{t("reject")}</Button>}
          {c.status !== "approved" && <Button size="sm" onClick={() => void act("approved")} disabled={moderate.isPending}><Check className="mr-1.5 h-4 w-4" />{t("approve")}</Button>}
        </div>
      )}
    </li>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminBlogMessages);
  const { data, isLoading } = useBlogSettings();
  const save = useSaveBlogSettings();
  const [f, setF] = useState<BlogSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (isLoading || !f) return <Loading t={t} />;
  const bad = !Number.isInteger(f.posts_per_page) || f.posts_per_page < 3 || f.posts_per_page > 48;
  const submit = async () => {
    if (bad) return;
    try {
      await save.mutateAsync(f);
      toast.success(t("rules_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{t("rules_title")}</h4>
      <div className="space-y-1.5">
        <Label htmlFor="br-per">{t("r_per_page")}</Label>
        <Input id="br-per" inputMode="numeric" className="max-w-[140px]" value={String(f.posts_per_page)} aria-invalid={bad}
          onChange={(e) => setF({ ...f, posts_per_page: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
        {bad ? <p className="text-xs text-destructive">{t("err_per_page")}</p> : <p className="text-xs text-muted-foreground">{t("r_per_page_d")}</p>}
      </div>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_comments")}</span><span className="block text-xs text-muted-foreground">{t("r_comments_d")}</span></span>
        <Switch checked={f.comments} onCheckedChange={(v) => setF({ ...f, comments: v })} aria-label={t("r_comments")} />
      </label>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_moderate")}</span><span className="block text-xs text-muted-foreground">{t("r_moderate_d")}</span></span>
        <Switch checked={f.moderate_comments} onCheckedChange={(v) => setF({ ...f, moderate_comments: v })} aria-label={t("r_moderate")} disabled={!f.comments} />
      </label>
      <div className="border-t pt-4">
        <p className="text-sm font-medium">{t("r_page")}</p>
        <p className="break-all text-xs text-muted-foreground">{t("r_page_d", { page: `${siteUrl()}${BLOG_PATH}` })}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending || bad}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}</Button>
      </div>
    </section>
  );
}

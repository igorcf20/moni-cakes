// /forum e /forum/<seção>: fórum da loja (recurso forum, Admin > Fórum). Seções ao lado (no celular, em botões
// que deslizam), tópicos com os fixados primeiro e depois a última atividade, busca (?q=), páginas (?pagina=) e o
// formulário de tópico novo (só com conta). Tudo lido pelas RPCs do banco, que já filtram idioma e aprovação.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, LogIn, MessagesSquare, Plus, Search, X } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { NewTopicForm, TopicRow, type ForumT } from "@/components/forum/ForumParts";
import { useAuth } from "@/hooks/useAuth";
import { useStoreName } from "@/hooks/useBrand";
import { useForumCategories, useForumTopics } from "@/hooks/useForum";
import { useMessages } from "@/i18n";
import { forumMessages } from "@/i18n/forum";
import { categoryPath, FORUM_PATH, forumErrorOf, pageCount, relativeTime, type ForumCategory } from "@/lib/forum";
import { cn } from "@/lib/utils";

export default function Forum() {
  const { slug } = useParams();
  const { t, locale } = useMessages(forumMessages);
  const storeName = useStoreName();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const [typed, setTyped] = useState(q);
  const [writing, setWriting] = useState(params.get("novo") === "1");
  useEffect(() => setTyped(q), [q]);

  const cats = useForumCategories(locale);
  const categories = cats.data ?? [];
  const current = slug ? categories.find((c) => c.slug === slug) ?? null : null;
  const topics = useForumTopics({ category: slug ?? null, q: q || null, locale, page });
  const total = topics.data?.total ?? 0;
  const pages = pageCount(total);
  const loadError = cats.error ?? topics.error;
  const errCode = loadError ? forumErrorOf((loadError as Error).message) : null;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "pagina") next.delete("pagina");
    setParams(next, { replace: k !== "pagina" });
  };
  const startTopic = () => {
    if (!user) { navigate(`/auth?redirect=${encodeURIComponent(`${slug ? categoryPath(slug) : FORUM_PATH}?novo=1`)}`); return; }
    setWriting(true);
  };

  const title = current?.name ?? t("forum");
  const lead = current?.description || t("lead");
  const unknownSection = !!slug && cats.isSuccess && !current;

  return (
    <ListingShell>
      <Helmet>
        <title>{`${title} | ${storeName}`}</title>
        <meta name="description" content={lead} />
        {(q || page > 1 || unknownSection) && <meta name="robots" content="noindex" />}
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, ...(current ? [{ label: t("forum"), href: FORUM_PATH }, { label: current.name }] : [{ label: t("forum") }])]} />

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[40px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px] lg:text-[60px]">{title}</h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{lead}</p>
        </div>
        {errCode !== "auth_required" && (
          <button type="button" onClick={startTopic}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {user ? <Plus className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}{user ? t("new_topic") : t("login_to_post")}
          </button>
        )}
      </div>

      {errCode === "auth_required" ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[24px] border border-brand-card-border bg-white p-10 text-center">
          <LogIn className="h-8 w-8 text-primary" strokeWidth={1.7} aria-hidden="true" />
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t("auth_required_title")}</h2>
          <p className="max-w-md text-brand-ink-soft">{t("auth_required")}</p>
          <Link to={`/auth?redirect=${encodeURIComponent(slug ? categoryPath(slug) : FORUM_PATH)}`}
            className="mt-2 inline-flex min-h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover">{t("login_btn")}</Link>
        </div>
      ) : loadError ? (
        <p className="mt-8 rounded-[20px] bg-destructive/5 p-6 text-destructive">{t("load_error")}</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Sections categories={categories} active={slug ?? null} loading={cats.isLoading} t={t} locale={locale} />
          <div className="min-w-0 space-y-5">
            <AnimatePresence initial={false}>
              {writing && user && <NewTopicForm key="new" categories={categories} initial={current?.id ?? null} t={t} onClose={() => { setWriting(false); setParam("novo", null); }} />}
            </AnimatePresence>
            <form role="search" onSubmit={(e) => { e.preventDefault(); setParam("q", typed.trim() || null); }} className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={current ? t("search_in", { name: current.name }) : t("search_ph")} aria-label={t("search")}
                className="h-12 w-full rounded-[14px] border border-brand-card-border bg-white pl-11 pr-24 text-[16px] outline-none transition-colors duration-150 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring md:text-[15px]" />
              <button type="submit" className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-[10px] px-3 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-brand-orange-soft">{t("search")}</button>
            </form>
            {q && (
              <p className="flex flex-wrap items-center gap-2 text-[15px] text-brand-ink-soft">
                {t("results_for", { n: total, q })}
                <button type="button" onClick={() => setParam("q", null)} className="inline-flex items-center gap-1 rounded-full bg-brand-alt px-2.5 py-1 text-[13px] font-semibold text-foreground transition-colors duration-150 hover:bg-brand-orange-soft">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />{t("clear_search")}
                </button>
              </p>
            )}
            {topics.isLoading ? (
              <ul className="space-y-3" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <li key={i} className="skeleton h-[104px] rounded-[18px]" />)}</ul>
            ) : unknownSection ? (
              <Empty text={t("section_missing")} t={t} />
            ) : (topics.data?.rows ?? []).length === 0 ? (
              <Empty text={q ? t("empty_search") : current ? t("empty_section") : t("empty")} t={t} action={!q ? <button type="button" onClick={startTopic} className="mt-2 font-semibold text-brand-orange-text hover:underline">{t("empty_cta")}</button> : null} />
            ) : (
              <>
                <ul className="space-y-3">
                  {topics.data!.rows.map((x, i) => <TopicRow key={x.id} topic={x} t={t} locale={locale} index={i} showSection={!slug} />)}
                </ul>
                {pages > 1 && (
                  <nav aria-label={t("pages")} className="flex items-center justify-between gap-3 pt-2">
                    <button type="button" disabled={page <= 1} onClick={() => setParam("pagina", String(page - 1))}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-brand-card-border bg-white px-4 text-[14px] font-semibold transition-colors duration-150 hover:border-primary/50 disabled:pointer-events-none disabled:opacity-40">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("prev")}
                    </button>
                    <span className="text-[14px] text-brand-ink-soft">{t("page_of", { page, total: pages })}</span>
                    <button type="button" disabled={page >= pages} onClick={() => setParam("pagina", String(page + 1))}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-brand-card-border bg-white px-4 text-[14px] font-semibold transition-colors duration-150 hover:border-primary/50 disabled:pointer-events-none disabled:opacity-40">
                      {t("next")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </ListingShell>
  );
}

function Empty({ text, t, action }: { text: string; t: ForumT; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-brand-card-border p-12 text-center">
      <MessagesSquare className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
      <p className="max-w-md text-brand-ink-soft">{text}</p>
      {action}
      <span className="sr-only">{t("forum")}</span>
    </div>
  );
}

/** Seções: lista com números no computador, botões que deslizam no celular. */
function Sections({ categories, active, loading, t, locale }: { categories: ForumCategory[]; active: string | null; loading: boolean; t: ForumT; locale: string }) {
  const totalTopics = categories.reduce((s, c) => s + c.topics, 0);
  const item = (on: boolean) => cn(
    "flex items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "bg-brand-orange-soft text-brand-orange-text" : "hover:bg-white");
  return (
    <aside aria-label={t("sections")} className="min-w-0">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        <Link to={FORUM_PATH} className={cn("shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold", !active ? "border-primary bg-primary text-primary-foreground" : "border-brand-card-border bg-white")}>{t("all_topics")}</Link>
        {categories.map((c) => (
          <Link key={c.id} to={categoryPath(c.slug)} className={cn("shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold", active === c.slug ? "border-primary bg-primary text-primary-foreground" : "border-brand-card-border bg-white")}>{c.name}</Link>
        ))}
      </div>
      <div className="hidden rounded-[20px] border border-brand-card-border bg-brand-alt/60 p-2 lg:block">
        <p className="px-3.5 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink-soft">{t("sections")}</p>
        <Link to={FORUM_PATH} className={item(!active)}>
          <span className="font-semibold">{t("all_topics")}</span>
          <span className="text-[13px] tabular-nums">{totalTopics}</span>
        </Link>
        {loading ? Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton m-1 h-14 rounded-[12px]" />) : categories.map((c) => (
          <Link key={c.id} to={categoryPath(c.slug)} className={cn(item(active === c.slug), "flex-col items-stretch gap-0.5")}>
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold">{c.name}</span>
              <span className="text-[13px] tabular-nums">{c.topics}</span>
            </span>
            {c.description && <span className="line-clamp-2 text-[13px] font-normal text-brand-ink-soft">{c.description}</span>}
            {c.last_post_at && <span className="text-[12px] font-normal text-brand-ink-soft">{t("last_activity", { when: relativeTime(c.last_post_at, locale) })}</span>}
          </Link>
        ))}
      </div>
    </aside>
  );
}

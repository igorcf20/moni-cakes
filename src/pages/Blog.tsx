// /blog: artigos publicados do blog (recurso blog, Admin > Blog) no idioma do visitante (ou sem idioma), com busca
// (?q=), assuntos (?assunto=), destaque grande no topo e "Ver mais artigos" pela regra posts_per_page.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { ArrowRight, Newspaper, Search, X } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { LayerArt, MediaImage } from "@/components/MediaImage";
import { useStoreName } from "@/hooks/useBrand";
import { useBlogPosts, useBlogSettings } from "@/hooks/useBlog";
import { useMessages } from "@/i18n";
import { blogMessages } from "@/i18n/blog";
import { blogExcerpt, blogForLocale, BLOG_PATH, filterPosts, tagCounts, type BlogPost } from "@/lib/blog";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof blogMessages["pt-BR"]>>["t"];

export default function Blog() {
  const { t, locale } = useMessages(blogMessages);
  const storeName = useStoreName();
  const [params, setParams] = useSearchParams();
  const { data: all = [], isLoading, error } = useBlogPosts();
  const { data: settings } = useBlogSettings();
  const [shown, setShown] = useState(0);
  const q = params.get("q") ?? "";
  const tag = params.get("assunto");
  const posts = useMemo(() => all.filter((p) => blogForLocale(p, locale)), [all, locale]);
  const tags = useMemo(() => tagCounts(posts).slice(0, 14), [posts]);
  const list = useMemo(() => filterPosts(posts, { tag, q }), [posts, tag, q]);
  const per = settings?.posts_per_page ?? 9;
  const limit = Math.max(per, shown);
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setShown(0);
  };
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const [hero, ...rest] = !q && !tag && list[0]?.featured ? list : [null as BlogPost | null, ...list];

  return (
    <ListingShell>
      <Helmet>
        <title>{`${t("blog")} | ${storeName}`}</title>
        <meta name="description" content={t("lead")} />
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("blog") }]} />
      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[40px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px] lg:text-[60px]">{t("blog")}</h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t("lead")}</p>
        </div>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setParam("q", e.target.value || null)} placeholder={t("search")} aria-label={t("search")}
            className="h-12 w-full rounded-[14px] border border-brand-card-border bg-white pl-11 pr-4 text-[16px] outline-none transition-colors duration-150 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring md:text-[15px]" />
        </form>
      </div>

      {tags.length > 0 && (
        <nav aria-label={t("tags")} className="mt-6 flex flex-wrap gap-2">
          <TagChip active={!tag} onClick={() => setParam("assunto", null)}>{t("all")}</TagChip>
          {tags.map((x) => <TagChip key={x.tag} active={tag === x.tag} onClick={() => setParam("assunto", tag === x.tag ? null : x.tag)}>{x.tag}</TagChip>)}
        </nav>
      )}

      {isLoading ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="skeleton h-[360px] rounded-[20px]" />)}
        </ul>
      ) : error ? (
        <p className="mt-8 rounded-[20px] bg-destructive/5 p-6 text-destructive">{t("load_error")}</p>
      ) : posts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-brand-card-border p-12 text-center">
          <Newspaper className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="text-brand-ink-soft">{t("empty")}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-brand-card-border p-12 text-center">
          <p className="text-brand-ink-soft">{t("none_match")}</p>
          <button type="button" onClick={() => { setParam("q", null); setParam("assunto", null); }} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-orange-text hover:underline">
            <X className="h-4 w-4" aria-hidden="true" />{t("clear")}
          </button>
        </div>
      ) : (
        <>
          {hero && <HeroCard p={hero} t={t} date={date(hero.published_at)} />}
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.filter(Boolean).slice(0, limit).map((p, i) => (
              <motion.li key={p!.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.03 }}>
                <PostCard p={p!} t={t} date={date(p!.published_at)} />
              </motion.li>
            ))}
          </ul>
          {rest.filter(Boolean).length > limit && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={() => setShown(limit + per)}
                className="inline-flex min-h-12 items-center gap-2 rounded-[14px] border border-brand-card-border bg-white px-6 text-[15px] font-semibold transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("load_more")}
              </button>
            </div>
          )}
        </>
      )}
    </ListingShell>
  );
}

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("min-h-10 rounded-full border px-4 text-[14px] font-semibold capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary text-primary-foreground" : "border-brand-card-border bg-white text-foreground hover:border-primary/50")}>
      {children}
    </button>
  );
}

const href = (p: BlogPost) => `${BLOG_PATH}/${p.slug}`;

function Meta({ p, t, date }: { p: BlogPost; t: T; date: string }) {
  return (
    <p className="text-[13px] text-brand-ink-soft">
      {[date, p.author_name ? t("by", { name: p.author_name }) : null].filter(Boolean).join(" · ")}
    </p>
  );
}

function HeroCard({ p, t, date }: { p: BlogPost; t: T; date: string }) {
  return (
    <Link to={href(p)} className="group mt-8 grid overflow-hidden rounded-[24px] border border-brand-card-border bg-white transition-shadow duration-200 hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[1.2fr_1fr]">
      <MediaImage src={p.cover_url} alt={p.cover_alt ?? ""} eager className="aspect-[16/10] lg:aspect-auto lg:min-h-[380px]" imgClassName="transition-transform duration-300 group-hover:scale-[1.03]" fallback={<LayerArt Icon={Newspaper} size="lg" />} />
      <div className="flex flex-col justify-center gap-3 p-6 sm:p-8 lg:p-10">
        <span className="w-fit rounded-full bg-brand-orange-soft px-3 py-1 text-[12px] font-semibold text-brand-orange-text">{t("featured")}</span>
        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">{p.title}</h2>
        <p className="text-[16px] leading-relaxed text-brand-ink-soft">{blogExcerpt(p, 240)}</p>
        <Meta p={p} t={t} date={date} />
        <span className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-orange-text">{t("read_more")}<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

function PostCard({ p, t, date }: { p: BlogPost; t: T; date: string }) {
  return (
    <Link to={href(p)} className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-brand-card-border bg-white transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <MediaImage src={p.cover_url} alt={p.cover_alt ?? ""} className="aspect-[16/10]" imgClassName="transition-transform duration-300 group-hover:scale-[1.03]" fallback={<LayerArt Icon={Newspaper} />} />
      <div className="flex flex-1 flex-col gap-2 p-5">
        {p.tags.length > 0 && <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-orange-text">{p.tags.slice(0, 2).join(" · ")}</p>}
        <h2 className="text-[20px] font-bold leading-snug tracking-[-0.02em]">{p.title}</h2>
        <p className="line-clamp-3 text-[15px] leading-relaxed text-brand-ink-soft">{blogExcerpt(p)}</p>
        <div className="mt-auto pt-2"><Meta p={p} t={t} date={date} /></div>
      </div>
    </Link>
  );
}

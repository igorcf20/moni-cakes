// /enquetes: enquetes do site (recurso polls, Admin > Enquetes) no idioma do visitante, primeiro as abertas e
// depois as encerradas com o resultado (quando a regra de cada uma deixa).
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { Vote } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { PollCard } from "@/components/polls/PollCard";
import { useStoreName } from "@/hooks/useBrand";
import { useSitePolls } from "@/hooks/usePolls";
import { useMessages } from "@/i18n";
import { pollsMessages } from "@/i18n/polls";
import { pollForLocale, type SitePoll } from "@/lib/polls";

export default function Polls() {
  const { t, locale } = useMessages(pollsMessages);
  const storeName = useStoreName();
  const { data = [], isLoading, error } = useSitePolls("all");
  const polls = data.filter((p) => pollForLocale(p, locale));
  const open = polls.filter((p) => p.open);
  const closed = polls.filter((p) => !p.open);

  return (
    <ListingShell>
      <Helmet>
        <title>{`${t("polls")} | ${storeName}`}</title>
        <meta name="description" content={t("lead")} />
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("polls") }]} />
      <div className="mt-4">
        <h1 className="text-[40px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px] lg:text-[60px]">{t("polls")}</h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t("lead")}</p>
      </div>

      {isLoading ? (
        <ul className="mt-8 grid gap-5 md:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => <li key={i} className="skeleton h-[320px] rounded-[20px]" />)}
        </ul>
      ) : error ? (
        <p className="mt-8 rounded-[20px] bg-destructive/5 p-6 text-destructive">{t("load_error")}</p>
      ) : polls.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-brand-card-border p-12 text-center">
          <Vote className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="text-brand-ink-soft">{t("empty")}</p>
        </div>
      ) : (
        <>
          {open.length > 0 && <Group title={t("open_title")} polls={open} />}
          {closed.length > 0 && <Group title={t("closed_title")} polls={closed} />}
        </>
      )}
    </ListingShell>
  );
}

function Group({ title, polls }: { title: string; polls: SitePoll[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-5 text-[24px] font-bold tracking-[-0.02em] md:text-[28px]">{title}</h2>
      <ul className="grid gap-5 md:grid-cols-2">
        {polls.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.04 }}>
            <PollCard poll={p} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

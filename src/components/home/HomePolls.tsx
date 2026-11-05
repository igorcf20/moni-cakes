// Bloco "Sua opinião conta" na página inicial: enquetes abertas marcadas para a página inicial (Admin > Enquetes),
// no idioma do visitante, até três. Sem o recurso polls ou sem enquetes, não aparece nada.
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PollCard } from "@/components/polls/PollCard";
import { useSitePolls } from "@/hooks/usePolls";
import { useMessages } from "@/i18n";
import { pollsMessages } from "@/i18n/polls";
import { pollForLocale, POLL_PATH } from "@/lib/polls";
import { cn } from "@/lib/utils";

export function HomePolls() {
  const { t, locale } = useMessages(pollsMessages);
  const { data = [] } = useSitePolls("home");
  const polls = data.filter((p) => pollForLocale(p, locale)).slice(0, 3);
  if (!polls.length) return null;
  return (
    <section className="bg-brand-alt">
      <div className="shell py-14 md:py-20">
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.25 }}
          className="mb-6 flex items-end justify-between gap-4 md:mb-8">
          <div>
            <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em] md:text-[38px]">{t("home_title")}</h2>
            <p className="mt-1.5 text-[15px] text-muted-foreground md:text-base">{t("home_sub")}</p>
          </div>
          <Link to={POLL_PATH} className="group hidden shrink-0 items-center gap-1 text-[15px] font-semibold text-brand-orange-text sm:flex">
            {t("see_all")}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </motion.div>
        <div className={cn("grid gap-5", polls.length === 1 ? "mx-auto max-w-2xl" : polls.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
          {polls.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.25, delay: i * 0.05 }}>
              <PollCard poll={p} />
            </motion.div>
          ))}
        </div>
        <Link to={POLL_PATH} className="mt-6 flex items-center justify-center gap-1 text-[15px] font-semibold text-brand-orange-text sm:hidden">
          {t("see_all")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

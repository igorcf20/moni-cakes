import { Link } from "react-router-dom";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { cn } from "@/lib/utils";
import { cardCls, focusRing, iconTile } from "./ui";

/** Bloco de ajuda com os contatos da loja (só os que estiverem preenchidos no Admin). */
export default function OrderHelp() {
  const { t } = useMessages(accountMessages);
  const { data: info } = useStoreInfo();
  const email = info?.email?.trim();
  const phone = info?.phone?.trim();
  const link = cn("inline-flex min-h-11 items-center gap-2 rounded-[12px] text-[15px] font-semibold text-brand-orange-text hover:underline", focusRing);
  return (
    <section className={cn(cardCls, "mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6")} aria-labelledby="order-help-title">
      <div className="flex items-start gap-3">
        <span className={iconTile}><MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
        <div>
          <h2 id="order-help-title" className="text-[18px] font-bold tracking-[-0.02em]">{t("helpTitle")}</h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">{t("helpText")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {email && <a href={`mailto:${email}`} className={link}><Mail className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{email}</a>}
        {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={link}><Phone className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{phone}</a>}
        <Link to="/contatos" className={link}>{t("helpContact")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
    </section>
  );
}


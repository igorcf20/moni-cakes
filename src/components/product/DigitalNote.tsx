// Aviso de produto digital na página do produto (recurso digital_products): como o cliente recebe os arquivos e as
// regras do produto (downloads por arquivo, dias de acesso, chave de licença). Textos em src/i18n/digitalProducts.ts.
import { FileDown } from "lucide-react";
import { useMessages } from "@/i18n";
import { digitalMessages } from "@/i18n/digitalProducts";
import type { ProductDigital } from "@/lib/digitalProducts";

export function DigitalNote({ digital }: { digital: ProductDigital }) {
  const { t } = useMessages(digitalMessages);
  const rules = [
    digital.download_limit == null ? null : digital.download_limit === 1 ? t("rule_limit_one") : t("rule_limit", { n: digital.download_limit }),
    digital.access_days == null ? null : digital.access_days === 1 ? t("rule_days_one") : t("rule_days", { n: digital.access_days }),
    digital.license_keys ? t("rule_key") : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-primary/30 bg-brand-orange-soft/50 p-3.5" data-digital-note>
      <FileDown className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0 text-[14px]">
        <p className="font-semibold text-foreground">{t("badge")}</p>
        <p className="mt-0.5 text-brand-ink-soft">{digital.ships ? t("badge_d_ships") : t("badge_d")}</p>
        {rules.length > 0 && <p className="mt-1 text-brand-ink-soft">{rules.join(" ")}</p>}
      </div>
    </div>
  );
}

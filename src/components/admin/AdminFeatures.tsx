// =====================================================================================
// Admin > Recursos da loja: liga e desliga cada recurso opcional da loja modelo, por categoria.
//   Cabeçalho   ajuda, contagem de ligados, busca e filtros (todos, ligados, desligados)
//   Categorias  um cartão por categoria; cada recurso com nome, explicação, interruptor e atalho Configurar
// Grava store_settings.features (src/lib/features.ts, useSaveFeatures). Desligar não apaga dados: o site esconde o
// recurso, o menu do Admin tira a seção dele e o servidor recusa o que depende dele (public.feature_enabled).
// =====================================================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Mail, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminFeaturesMessages, type AdminFeaturesKey } from "@/i18n/adminFeatures";
import { useFeatures, useSaveFeatures } from "@/hooks/useFeatures";
import { FEATURE_CATEGORIES, FEATURES, featureOn, type FeatureDef } from "@/lib/features";

type Filter = "all" | "on" | "off";

export default function AdminFeatures() {
  const { t } = useMessages(adminFeaturesMessages);
  const { data: flags, isLoading, isError } = useFeatures();
  const save = useSaveFeatures();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const name = (f: FeatureDef) => t(`f_${f.id}` as AdminFeaturesKey);
  const desc = (f: FeatureDef) => t(`f_${f.id}_d` as AdminFeaturesKey);
  const onCount = FEATURES.filter((f) => featureOn(flags, f.id)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return FEATURES.filter((f) => {
      const on = featureOn(flags, f.id);
      if (filter === "on" && !on) return false;
      if (filter === "off" && on) return false;
      if (!q) return true;
      return `${name(f)} ${desc(f)}`.toLocaleLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, query, filter, t]);

  const toggle = async (f: FeatureDef, on: boolean) => {
    try {
      await save.mutateAsync({ ...(flags ?? {}), [f.id]: on });
      toast.success(t(on ? "saved_on" : "saved_off", { name: name(f) }));
    } catch {
      toast.error(t("save_error"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("loading")}
      </div>
    );
  }
  if (isError) return <p className="py-10 text-sm text-destructive">{t("load_error")}</p>;

  const FILTERS: Filter[] = ["all", "on", "off"];

  return (
    <div className="space-y-6">
      <AdminHelp id="features" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      {/* Busca, filtros e contagem */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
        <div className="flex gap-1.5" role="group">
          {FILTERS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              aria-pressed={filter === v}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                filter === v ? "border-primary bg-primary/10 text-brand-orange-text" : "hover:bg-muted"
              }`}
            >
              {t(`f_${v}` as AdminFeaturesKey)}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground sm:ml-auto tabular-nums">{t("count", { on: onCount, total: FEATURES.length })}</p>
      </div>

      {visible.length === 0 && <p className="rounded-[18px] border bg-card p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}

      {/* Um cartão por categoria */}
      {FEATURE_CATEGORIES.map((cat) => {
        const items = visible.filter((f) => f.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="rounded-[18px] border bg-card">
            <h3 className="border-b px-4 py-3 text-base font-bold sm:px-5">{t(`c_${cat}` as AdminFeaturesKey)}</h3>
            <ul className="divide-y">
              {items.map((f) => {
                const on = featureOn(flags, f.id);
                const switchId = `feature-${f.id}`;
                return (
                  <li key={f.id} className="flex items-start gap-4 px-4 py-4 sm:px-5">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label htmlFor={switchId} className="block font-semibold">{name(f)}</label>
                      <p className="text-sm text-muted-foreground">{desc(f)}</p>
                      {f.needsEmail && (
                        <p className="flex items-start gap-1.5 pt-1 text-xs text-brand-orange-text">
                          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span><strong>{t("needs_email")}.</strong> {t("needs_email_hint")}</span>
                        </p>
                      )}
                      {f.configSection && on && (
                        <Link to={adminHref.section(f.configSection)} className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand-orange-text hover:underline">
                          {t("configure")} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <span className="hidden text-xs text-muted-foreground sm:inline">{on ? t("on") : t("off")}</span>
                      <Switch id={switchId} checked={on} disabled={save.isPending} onCheckedChange={(v) => toggle(f, v)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

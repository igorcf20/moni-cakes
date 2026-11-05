// =====================================================================================
// Admin > Visão geral > Financeiro (recurso finance): painel com números e gráficos, lançamentos manuais de
// despesas e entradas, categorias e regras das contas. Separador no endereço (?tab=finance&aba=<painel|lancamentos|
// categorias|regras>); páginas próprias para criar e editar lançamentos (AdminSubpage).
// =====================================================================================
import { LayoutDashboard, ListOrdered, Settings2, Tags } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "@/components/admin/AdminHelp";
import { useAdminPage } from "@/components/admin/AdminSubpage";
import { useMessages } from "@/i18n";
import { adminFinanceMessages } from "@/i18n/adminFinance";
import FinanceDashboard from "./FinanceDashboard";
import FinanceEntries from "./FinanceEntries";
import { FinanceCategories, FinanceRules } from "./FinanceSetup";

const TABS = ["painel", "lancamentos", "categorias", "regras"] as const;

export default function AdminFinance() {
  const { t } = useMessages(adminFinanceMessages);
  const page = useAdminPage();
  const tab = (TABS as readonly string[]).includes(page.tab ?? "") ? page.tab! : "painel";
  if (page.view) return <FinanceEntries />;
  const icons = { painel: LayoutDashboard, lancamentos: ListOrdered, categorias: Tags, regras: Settings2 };
  return (
    <div className="space-y-5">
      <AdminHelp id="finance" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          {TABS.map((k) => {
            const Icon = icons[k];
            return <TabsTrigger key={k} value={k} className="gap-1.5 px-4"><Icon className="h-4 w-4" aria-hidden="true" />{t(`tab_${k}`)}</TabsTrigger>;
          })}
        </TabsList>
        <TabsContent value="painel" className="mt-5"><FinanceDashboard onEntries={() => page.setTab("lancamentos")} /></TabsContent>
        <TabsContent value="lancamentos" className="mt-5"><FinanceEntries /></TabsContent>
        <TabsContent value="categorias" className="mt-5"><FinanceCategories /></TabsContent>
        <TabsContent value="regras" className="mt-5"><FinanceRules /></TabsContent>
      </Tabs>
    </div>
  );
}

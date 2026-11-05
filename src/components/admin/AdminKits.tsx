// =====================================================================================
// Admin > Catálogo > Kits (recurso kits). Telas, sem janelas:
//   lista   período (30 dias, 90 dias, tudo), números (kits vendidos, receita, desconto dado, kits ativos), filtros por
//           estado, busca, tabela com estado, desconto e vendas de cada kit, Ver no site      -> kits/KitList.tsx
//   kit     (ver=kit&id=<id>; sem id = novo) básico, desconto com prévia, peças, página do kit, traduções e SEO
//                                                                                            -> kits/KitEditor.tsx
//   onde    (ver=onde) onde oferecer os kits: produto, carrinho, carrinho lateral, checkout, rodapé
//                                                                                            -> kits/KitOfferSettings.tsx
// Dados e contas em kits/kitAdmin.ts; textos kits_* em src/i18n/adminLegacy.ts; migration 20261008020000_kit_pages.sql.
// =====================================================================================
import AdminHelp from "./AdminHelp";
import { useAdminPage } from "./AdminSubpage";
import KitEditor from "./kits/KitEditor";
import KitList from "./kits/KitList";
import KitOfferSettings, { KitOfferSummary } from "./kits/KitOfferSettings";
import { useMessages } from "@/i18n";
import { adminLegacyMessages } from "@/i18n/adminLegacy";

export const AdminKits = () => {
  const { t } = useMessages(adminLegacyMessages);
  const page = useAdminPage();
  if (page.view === "onde") return <KitOfferSettings onBack={page.close} />;
  if (page.view === "kit") return <KitEditor key={page.id ?? "new"} id={page.id} onBack={page.close} onSaved={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="kits" title={t("kits_help_title")} steps={[t("kits_help_1"), t("kits_help_2"), t("kits_help_3")]} />
      <KitOfferSummary onOpen={() => page.open("onde")} />
      <KitList onOpen={(id) => page.open("kit", id)} onNew={() => page.open("kit")} />
    </div>
  );
};

export default AdminKits;

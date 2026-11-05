// =====================================================================================
// Criar e editar categoria no Admin, numa página (antes era uma janela por cima da lista):
//   /admin/categorias/nova            nova categoria (depois de gravar abre os números dela)
//   /admin/categorias/<id>/editar     dados, foto, menu e os produtos da categoria
// O formulário em si é o CategoryForm de src/components/admin/AdminCategories.tsx.
// =====================================================================================
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { CategoryForm, type CategoryFormRow } from "@/components/admin/AdminCategories";
import { useMessages } from "@/i18n";
import { adminStatsMessages } from "@/i18n/adminStats";

const db = supabase as any;

export default function AdminCategoryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useMessages(adminStatsMessages);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async (): Promise<CategoryFormRow[]> => {
      const { data, error } = await db.from("categories").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const category = id ? rows.find((r) => r.id === id) ?? null : null;
  const back = id
    ? { to: adminHref.category(id), label: category?.name ?? t("back_categories") }
    : { to: adminHref.section("categories"), label: t("back_categories") };

  return (
    <AdminShell active="categories">
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-96 w-full" /></div>
      ) : id && !category ? (
        <>
          <AdminPageHeader back={{ to: adminHref.section("categories"), label: t("back_categories") }} title={t("category_not_found")} />
          <p className="text-muted-foreground">{t("category_not_found_hint")}</p>
        </>
      ) : (
        <>
          <AdminPageHeader
            back={back}
            title={category ? t("edit_category_title", { name: category.name }) : t("new_category")}
            subtitle={category ? t("edit_category_hint") : t("new_category_hint")}
          />
          <AdminPanel className="max-w-3xl">
            <CategoryForm
              key={category?.id ?? "new"}
              category={category}
              rows={rows}
              onClose={(savedId) => navigate(savedId ? adminHref.category(savedId) : back.to)}
            />
          </AdminPanel>
        </>
      )}
    </AdminShell>
  );
}

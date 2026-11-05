// =====================================================================================
// Criar e editar cliente no Admin, numa página (antes eram janelas por cima da lista):
//   /admin/clientes/novo            cria a conta (e-mail, senha provisória, nome, telefone, documento)
//   /admin/clientes/<id>/editar     muda os dados; e-mail e senha novos atualizam o acesso do cliente
// Funções do servidor: admin-create-user e admin-update-user (só administradores).
// =====================================================================================
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";
import { useAdminCustomer } from "@/hooks/useAdminRecords";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fnError = (data: any) => {
  const e = data?.error;
  if (!e) return null;
  return typeof e === "string" ? e : JSON.stringify(e);
};

export default function AdminCustomerFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useMessages(adminPagesMessages);
  const { customer, isLoading } = useAdminCustomer(id);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", tax_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) setForm({ email: customer.email || "", password: "", full_name: customer.full_name || "", phone: customer.phone || "", tax_id: customer.tax_id || "" });
  }, [customer]);

  const back = isNew
    ? { to: adminHref.section("customers"), label: t("back_customers") }
    : { to: adminHref.customer(id!), label: t("back_customer") };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) { toast.error(t("err_email")); return; }
    if ((isNew || form.password) && form.password.length < 8) { toast.error(t("err_password")); return; }
    if (isNew && !form.full_name.trim()) { toast.error(t("err_name")); return; }
    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: { email, password: form.password, full_name: form.full_name.trim(), phone: form.phone.trim(), tax_id: form.tax_id.trim() },
        });
        if (error) throw error;
        const err = fnError(data);
        if (err) throw new Error(err);
        toast.success(t("customer_created"));
        await queryClient.invalidateQueries({ queryKey: ["admin-customers-profiles"] });
        navigate((data as any)?.user_id ? adminHref.customer((data as any).user_id) : adminHref.section("customers"));
        return;
      }
      const { error } = await supabase.from("user_profiles").update({
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        tax_id: form.tax_id.trim() || null,
      }).eq("user_id", id!);
      if (error) throw error;
      const emailChanged = email.toLowerCase() !== (customer?.email || "").toLowerCase();
      if (emailChanged || form.password) {
        const body: Record<string, string> = { user_id: id! };
        if (emailChanged) body.email = email;
        if (form.password) body.password = form.password;
        const { data, error: fnErr } = await supabase.functions.invoke("admin-update-user", { body });
        if (fnErr) throw fnErr;
        const err = fnError(data);
        if (err) throw new Error(err);
      }
      toast.success(t("customer_saved"));
      await queryClient.invalidateQueries({ queryKey: ["admin-customers-profiles"] });
      navigate(adminHref.customer(id!));
    } catch (err: any) {
      toast.error(isNew ? t("customer_create_error") : t("customer_save_error"), { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell active="customers">
      <AdminPageHeader
        back={back}
        title={isNew ? t("new_customer_title") : t("edit_customer_title", { name: customer?.full_name || customer?.email || "" })}
        subtitle={isNew ? t("new_customer_hint") : t("edit_customer_hint")}
      />
      {!isNew && isLoading ? (
        <Skeleton className="h-96 w-full max-w-2xl" />
      ) : !isNew && !customer ? (
        <p className="text-muted-foreground">{t("customer_not_found_hint")}</p>
      ) : (
        <form onSubmit={submit} className="max-w-2xl space-y-5">
          <AdminPanel title={t("access")}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">{t("email")}</Label>
                <Input id="c-email" type="email" autoComplete="off" required value={form.email} onChange={set("email")} className="text-base md:text-sm" />
                {!isNew && <p className="text-xs text-muted-foreground">{t("email_change_hint")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-pass">{isNew ? t("temp_password") : t("new_password")}</Label>
                <Input id="c-pass" type="text" autoComplete="new-password" required={isNew} value={form.password} onChange={set("password")} placeholder={isNew ? t("password_min") : t("password_keep")} className="text-base md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("password_hint")}</p>
              </div>
            </div>
          </AdminPanel>
          <AdminPanel title={t("personal")}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">{t("full_name")}</Label>
                <Input id="c-name" autoComplete="off" required={isNew} value={form.full_name} onChange={set("full_name")} className="text-base md:text-sm" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">{t("phone")}</Label>
                  <Input id="c-phone" type="tel" autoComplete="off" value={form.phone} onChange={set("phone")} className="text-base md:text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-doc">{t("tax_doc")}</Label>
                  <Input id="c-doc" autoComplete="off" value={form.tax_id} onChange={set("tax_id")} className="text-base md:text-sm" />
                </div>
              </div>
            </div>
          </AdminPanel>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {isNew ? t("create_customer") : t("save_changes")}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(back.to)} disabled={saving}>{t("cancel")}</Button>
          </div>
        </form>
      )}
    </AdminShell>
  );
}

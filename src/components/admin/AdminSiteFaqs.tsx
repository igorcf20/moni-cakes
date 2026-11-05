// =====================================================================================
// Admin > Perguntas frequentes: o que aparece na página /faq do site (src/pages/Faq.tsx).
//
//   Perguntas padrão   grupos prontos no i18n (src/i18n/pages.ts); cada grupo pode ser escondido
//                      (store_settings.faq_settings.hiddenGroups).
//   Perguntas da loja  tabela site_faqs: grupo (category), pergunta, resposta, idioma (locale, NULL = todos),
//                      ordem e ativa. Com o nome de um grupo padrão, a pergunta entra nesse grupo.
// Depois de gravar invalida SITE_FAQS_QUERY_KEY (src/hooks/useSiteFaqs.ts). Textos em src/i18n/adminFaq.ts.
// =====================================================================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import { DEFAULT_FAQ_GROUPS, SITE_FAQS_QUERY_KEY, parseFaqSettings, type FaqSettings } from "@/hooks/useSiteFaqs";
import { LOCALES, LOCALE_NAMES, useMessages } from "@/i18n";
import { adminFaqMessages } from "@/i18n/adminFaq";
import { faqMessages } from "@/i18n/pages";

type Row = { id: string; category: string; question: string; answer: string; display_order: number; is_active: boolean; locale: string | null };
type Draft = Omit<Row, "id" | "display_order"> & { id?: string };

const ADMIN_KEY = ["admin-site-faqs"] as const;
const ALL = "__all__";
const db = supabase as any;

const AdminSiteFaqs = () => {
  const { t } = useMessages(adminFaqMessages);
  const { ask, confirmSlot } = useInlineConfirm();
  const { t: tf } = useMessages(faqMessages);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ADMIN_KEY });
    qc.invalidateQueries({ queryKey: SITE_FAQS_QUERY_KEY });
  };

  const { data, isLoading } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async (): Promise<{ rows: Row[]; settings: FaqSettings }> => {
      const [rows, settings] = await Promise.all([
        db.from("site_faqs").select("*").order("display_order", { ascending: true }),
        supabase.from("store_settings").select("value").eq("key", "faq_settings").maybeSingle(),
      ]);
      if (rows.error) throw rows.error;
      return { rows: rows.data ?? [], settings: parseFaqSettings(settings.data?.value) };
    },
  });
  const rows = data?.rows ?? [];
  const hidden = data?.settings.hiddenGroups ?? [];

  const toggleGroup = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const next: FaqSettings = { hiddenGroups: on ? hidden.filter((g) => g !== id) : [...hidden, id] };
      const { error } = await supabase.from("store_settings").upsert(
        { key: "faq_settings", value: next as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error(t("settings_error")),
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = { category: d.category.trim() || t("default_group"), question: d.question.trim(), answer: d.answer.trim(), is_active: d.is_active, locale: d.locale };
      const { error } = d.id
        ? await db.from("site_faqs").update(payload).eq("id", d.id)
        : await db.from("site_faqs").insert({ ...payload, display_order: (rows[rows.length - 1]?.display_order ?? 0) + 10 });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success(t("saved")); setDraft(null); },
    onError: () => toast.error(t("save_error")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("site_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success(t("deleted")); },
    onError: () => toast.error(t("delete_error")),
  });

  // Troca a ordem com a vizinha do mesmo grupo e renumera o grupo.
  const move = useMutation({
    mutationFn: async ({ group, index, dir }: { group: Row[]; index: number; dir: -1 | 1 }) => {
      const next = [...group];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      // Mantém o grupo na mesma faixa de números (a ordem entre grupos não muda).
      const start = Math.min(...group.map((r) => r.display_order));
      for (const [i, r] of next.entries()) {
        const order = start + i;
        if (r.display_order === order) continue;
        const { error } = await db.from("site_faqs").update({ display_order: order }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
  });

  const grouped = rows.reduce<Record<string, Row[]>>((acc, f) => {
    (acc[f.category] ||= []).push(f);
    return acc;
  }, {});
  const groupNames = [...new Set([...DEFAULT_FAQ_GROUPS.map((g) => tf(g.title)), ...Object.keys(grouped)])];
  const countOf = (prefix: string) => Object.keys(faqMessages["pt-BR"]).filter((k) => k.startsWith(prefix)).length;

  return (
    <div className="space-y-6">
      <AdminHelp id="faq" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">{t("defaults_title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("defaults_hint")}</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/faq" target="_blank" rel="noopener"><ExternalLink className="mr-1.5 h-4 w-4" />{t("view_page")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DEFAULT_FAQ_GROUPS.map((g) => {
              const on = !hidden.includes(g.id);
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <span className={on ? "" : "text-muted-foreground"}>
                    <span className="block font-medium">{tf(g.title)}</span>
                    <span className="text-xs text-muted-foreground">{on ? t("defaults_count", { n: countOf(g.prefix) }) : t("hidden")}</span>
                  </span>
                  <Switch checked={on} disabled={isLoading || toggleGroup.isPending} onCheckedChange={(v) => toggleGroup.mutate({ id: g.id, on: v })} aria-label={tf(g.title)} />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <InlinePanel open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t("edit_question") : t("new_question")}>
        {draft && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="faq-group">{t("group")}</Label>
                <Input id="faq-group" list="faq-groups" value={draft.category} placeholder={t("default_group")} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                <datalist id="faq-groups">{groupNames.map((n) => <option key={n} value={n} />)}</datalist>
                <p className="text-xs text-muted-foreground">{t("group_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("language")}</Label>
                <Select value={draft.locale ?? ALL} onValueChange={(v) => setDraft({ ...draft, locale: v === ALL ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("language_all")}</SelectItem>
                    {LOCALES.map((l) => <SelectItem key={l} value={l}>{LOCALE_NAMES[l]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faq-q">{t("question")}</Label>
              <Input id="faq-q" value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faq-a">{t("answer")}</Label>
              <Textarea id="faq-a" rows={6} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} required />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="faq-active" checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              <Label htmlFor="faq-active">{t("active")}</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("cancel")}</Button>
              <Button type="submit" disabled={!draft.question.trim() || !draft.answer.trim() || save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
            </div>
          </form>
        )}
      </InlinePanel>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{t("own_title")}</CardTitle>
          <Button onClick={() => setDraft({ category: "", question: "", answer: "", is_active: true, locale: null })}>
            <Plus className="mr-2 h-4 w-4" />{t("new_question")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {confirmSlot}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{cat}</h3>
                {items.map((f, i) => (
                  <div key={f.id} className={`flex items-start gap-3 rounded-xl border border-border p-4 ${f.is_active ? "" : "opacity-60"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{f.question}</p>
                        {f.locale && <Badge variant="outline" className="text-[10px]">{LOCALE_NAMES[f.locale as keyof typeof LOCALE_NAMES] ?? f.locale}</Badge>}
                        {!f.is_active && <Badge variant="outline" className="text-[10px]">{t("hidden")}</Badge>}
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{f.answer}</p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button size="icon" variant="ghost" className="h-9 w-9" disabled={i === 0 || move.isPending} onClick={() => move.mutate({ group: items, index: i, dir: -1 })} aria-label={t("move_up")} title={t("move_up")}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" disabled={i === items.length - 1 || move.isPending} onClick={() => move.mutate({ group: items, index: i, dir: 1 })} aria-label={t("move_down")} title={t("move_down")}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setDraft({ ...f })} aria-label={t("edit")} title={t("edit")}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={async () => { if (await ask(t("confirm_delete"))) remove.mutate(f.id); }} aria-label={t("remove")} title={t("remove")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default AdminSiteFaqs;

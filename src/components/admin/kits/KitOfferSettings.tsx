// Admin > Kits > Onde oferecer (ver=onde): em que partes da loja os kits aparecem (store_settings.kits, src/lib/kits.ts).
//   KitOfferSummary   cartão no topo da lista de kits: lugares ligados e o botão Configurar
//   KitOfferSettings  página com os interruptores por lugar (produto, carrinho, carrinho lateral, checkout, rodapé),
//                     cada um com explicação; a página inicial é só um link (a seção é ligada em Conteúdo da página inicial)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutTemplate, Loader2, Package, Save, ShoppingCart, SlidersHorizontal, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminSubpage from "../AdminSubpage";
import HelpTip from "../HelpTip";
import { adminHref } from "../shell/adminSections";
import { useKitSettings, useSaveKitSettings } from "@/hooks/useOfferSettings";
import { useMessages } from "@/i18n";
import { adminOffersMessages, type AdminOffersT as T } from "@/i18n/adminOffers";
import { DEFAULT_KIT_SETTINGS, type KitSettings } from "@/lib/kits";
import { cn } from "@/lib/utils";

/** Lugares ligados, pela ordem da página. */
function placesOn(s: KitSettings, t: T): string[] {
  return [
    s.productPage && t("ko_group_product"),
    (s.cartComplete || s.cartLoose) && t("ko_group_cart"),
    (s.cartComplete || s.cartLoose) && s.sideCart && t("ko_side"),
    (s.cartComplete || s.cartLoose) && s.checkout && t("ko_checkout"),
    s.footerLink && t("ko_footer"),
  ].filter(Boolean) as string[];
}

export function KitOfferSummary({ onOpen }: { onOpen: () => void }) {
  const { t: tr } = useMessages(adminOffersMessages);
  const t = tr as T;
  const { data: s = DEFAULT_KIT_SETTINGS, isLoading } = useKitSettings();
  const places = placesOn(s, t);
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-orange-text"><SlidersHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("ko_title")}</p>
        {isLoading ? <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" /> : places.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t("ko_summary")}>
            {places.map((p) => <li key={p} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{p}</li>)}
          </ul>
        ) : <p className="text-xs text-muted-foreground">{t("ko_summary_none")}</p>}
      </div>
      <Button variant="outline" onClick={onOpen} className="shrink-0">{t("configure")}<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
    </section>
  );
}

export default function KitOfferSettings({ onBack }: { onBack: () => void }) {
  const { t: tr } = useMessages(adminOffersMessages);
  const t = tr as T;
  const { data: saved } = useKitSettings();
  const save = useSaveKitSettings();
  const [form, setForm] = useState<KitSettings>(DEFAULT_KIT_SETTINGS);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  const set = <K extends keyof KitSettings>(k: K, v: KitSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cartOn = form.cartComplete || form.cartLoose;
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  return (
    <AdminSubpage
      title={t("ko_title")} subtitle={t("ko_sub")} backLabel={t("back")} onBack={onBack}
      actions={<>
        {dirty && <Button variant="ghost" onClick={() => saved && setForm(saved)}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
        <Button onClick={submit} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
        </Button>
      </>}
    >
      <Group icon={Package} title={t("ko_group_product")}>
        <Toggle label={t("ko_product")} hint={t("ko_product_h")} checked={form.productPage} onChange={(v) => set("productPage", v)} t={t} />
        <div className={cn("flex flex-wrap items-center justify-between gap-3 py-3", !form.productPage && "opacity-50")}>
          <span className="min-w-0">
            <span className="flex items-center text-sm font-semibold">{t("ko_product_limit")}<HelpTip label={t("help")} text={t("ko_product_limit_h")} /></span>
          </span>
          <Select value={String(form.productPageLimit)} onValueChange={(v) => set("productPageLimit", Number(v))} disabled={!form.productPage}>
            <SelectTrigger className="w-24" aria-label={t("ko_product_limit")}><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Group>

      <Group icon={ShoppingCart} title={t("ko_group_cart")}>
        <Toggle label={t("ko_complete")} hint={t("ko_complete_h")} checked={form.cartComplete} onChange={(v) => set("cartComplete", v)} t={t} />
        <Toggle label={t("ko_loose")} hint={t("ko_loose_h")} checked={form.cartLoose} onChange={(v) => set("cartLoose", v)} t={t} />
        <Toggle label={t("ko_side")} hint={t("ko_side_h")} checked={form.sideCart} onChange={(v) => set("sideCart", v)} disabled={!cartOn} t={t} />
        <Toggle label={t("ko_checkout")} hint={t("ko_checkout_h")} checked={form.checkout} onChange={(v) => set("checkout", v)} disabled={!cartOn} t={t} />
        {!cartOn && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ko_cart_needs")}</p>}
      </Group>

      <Group icon={LayoutTemplate} title={t("ko_group_other")}>
        <Toggle label={t("ko_footer")} hint={t("ko_footer_h")} checked={form.footerLink} onChange={(v) => set("footerLink", v)} t={t} />
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{t("ko_home")}</span>
            <span className="block text-xs text-muted-foreground">{t("ko_home_h")}</span>
          </span>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link to={adminHref.section("home-content")}>{t("ko_home_link")}<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </Group>
    </AdminSubpage>
  );
}

function Group({ icon: Icon, title, children }: { icon: typeof Package; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border bg-card p-5">
      <h4 className="flex items-center gap-2 text-base font-semibold"><Icon className="h-4 w-4 text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />{title}</h4>
      <div className="mt-2 divide-y">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange, disabled, t }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; t: T }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-3 py-3", disabled && "cursor-not-allowed opacity-50")}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">{checked && !disabled ? t("on") : t("off")}</span>
        <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      </span>
    </label>
  );
}

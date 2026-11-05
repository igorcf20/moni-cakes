// Admin > Kits > página do kit: as peças (produto, quantidade, observação e ordem), com foto, preço, estoque e avisos.
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ImageOff, Package, Palette, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HelpTip from "../HelpTip";
import type { AdminLegacyT as T } from "@/i18n/adminLegacy";
import { FieldLabel, KitSection } from "./KitParts";
import { pieceProblem, type AdminKitItem, type KitProductOption } from "./kitAdmin";

export default function KitPiecesEditor({ t, items, onChange, products, categories, money, showErrors }: {
  t: T;
  items: AdminKitItem[];
  onChange: (items: AdminKitItem[]) => void;
  products: KitProductOption[];
  categories: string[];
  money: (v: number) => string;
  showErrors: boolean;
}) {
  const [category, setCategory] = useState("all");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const options = category === "all" ? products : products.filter((p) => p.category === category);

  const update = (i: number, patch: Partial<AdminKitItem>) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <KitSection
      icon={Package}
      title={t("kits_sec_pieces")}
      intro={t("kits_sec_pieces_d")}
      actions={<Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { product_id: "", quantity: 1, note: "", display_order: items.length }])}><Plus className="mr-1.5 h-4 w-4" />{t("kits_add_product")}</Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="kit-cat" className="text-xs text-muted-foreground">{t("kits_filter")}</Label>
        <HelpTip label={t("help")} text={t("kits_h_filter")} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="kit-cat" className="h-9 w-full text-sm sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("kits_all_categories")}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <p className={`rounded-[14px] border border-dashed p-6 text-center text-sm ${showErrors ? "border-destructive/50 text-destructive" : "text-muted-foreground"}`}>{t("kits_no_products")}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((it, i) => {
            const p = it.product_id ? byId.get(it.product_id) : undefined;
            const problem = it.product_id ? pieceProblem(p) : null;
            const dup = !!it.product_id && items.findIndex((x) => x.product_id === it.product_id) !== i;
            const choices = p && !options.some((o) => o.id === p.id) ? [p, ...options] : options;
            return (
              <li key={i} className="rounded-[14px] border bg-background/60 p-3">
                <div className="flex gap-3">
                  {p?.image
                    ? <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-xl border bg-muted object-cover" loading="lazy" />
                    : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border bg-muted text-muted-foreground"><ImageOff className="h-5 w-5" /></span>}
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
                      <div className="space-y-1.5">
                        <FieldLabel t={t} htmlFor={`kit-p-${i}`} label={t("kits_f_product", { n: i + 1 })} help={t("kits_h_product")} className="text-xs" />
                        <Select value={it.product_id} onValueChange={(v) => update(i, { product_id: v })}>
                          <SelectTrigger id={`kit-p-${i}`} aria-invalid={showErrors && !it.product_id} className={showErrors && !it.product_id ? "border-destructive" : ""}>
                            <SelectValue placeholder={t("kits_select_product")} />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name} · {money(o.price)}{!o.is_active ? ` · ${t("kits_inactive_short")}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel t={t} htmlFor={`kit-q-${i}`} label={t("kits_qty")} help={t("kits_h_qty")} className="text-xs" />
                        <Input id={`kit-q-${i}`} type="number" inputMode="numeric" min={1} value={it.quantity}
                          onChange={(e) => update(i, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel t={t} htmlFor={`kit-n-${i}`} label={t("kits_f_note")} help={t("kits_h_note")} className="text-xs" />
                      <Input id={`kit-n-${i}`} value={it.note ?? ""} maxLength={120} placeholder={t("kits_note_ph")} onChange={(e) => update(i, { note: e.target.value })} />
                    </div>
                    {p && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{t("kits_unit_price", { price: money(p.price) })}</span>
                        <span className="tabular-nums">{p.stock == null ? t("kits_stock_unlimited") : t("kits_stock", { n: p.stock })}</span>
                        {(p.hasColors || p.hasSizes) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground">
                            <Palette className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {p.hasColors && p.hasSizes ? t("kits_hint_options") : p.hasColors ? t("kits_hint_colors") : t("kits_hint_sizes")}
                          </span>
                        )}
                      </div>
                    )}
                    {problem && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{t(`kits_warn_${problem}`)}
                      </p>
                    )}
                    {dup && <p className="text-xs text-amber-800">{t("kits_dup_warn")}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("kits_move_up")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("kits_move_down")} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("kits_remove_product")} onClick={() => onChange(items.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 1 && <p className="text-xs text-muted-foreground">{t("kits_pieces_order_h")}</p>}
    </KitSection>
  );
}

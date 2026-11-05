// =====================================================================================
// Painel ao lado da área de desenho (Admin > Pop-ups > pop-up > Desenho), em quatro abas:
//   Adicionar        peças que entram no pop-up (texto, imagem, forma, campos, aceite, botões, cupom)
//   Elemento         tudo do elemento escolhido: texto por idioma, letra, cores, ação do botão, posição exata,
//                    em que aparelho aparece, ordem, duplicar e apagar
//   Camadas          lista de tudo o que está no passo, da frente para trás
//   Fundo e tamanho  tamanho no computador e no celular, imagem e cor de fundo, cantos, sombra, botão fechar
// =====================================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, CheckSquare, ChevronsDown, ChevronsUp, Copy, Eye, EyeOff, Image as ImageIcon,
  Layers, Mail, Monitor, MousePointerClick, Phone, Plus, RectangleHorizontal, Scaling, Smartphone, Square, Ticket, Trash2, Type, User, TextCursorInput,
  Heading, Crosshair, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPick, Field, Group, ImagePick, L10nField, NumberSlider, Segmented, SwitchRow, type PT } from "./fields";
import { updateElement, type SetContent } from "./PopupBuilder";
import {
  heightForImage, keepApart, mobileFont, newElement, SAMPLES, pickText, SIZE_LIMITS, type Box, type ButtonEl, type ConsentEl, type CouponEl, type Device, type ElementType,
  type FieldEl, type FieldKind, type ImageEl, type PopupContent, type PopupElement, type PopupLocale, type ShapeEl, type StepId, type TextEl,
} from "@/lib/leadPopups";
import { cn } from "@/lib/utils";

export type InspectorTab = "add" | "element" | "layers" | "box";

export const TYPE_ICON: Record<ElementType, LucideIcon> = {
  text: Type, image: ImageIcon, shape: Square, field: TextCursorInput, consent: CheckSquare, button: RectangleHorizontal, coupon: Ticket,
};
const FIELD_ICON: Record<FieldKind, LucideIcon> = { email: Mail, phone: Phone, name: User, custom: TextCursorInput };

/** Nome mostrado na lista de camadas. */
export function elementLabel(t: PT, el: PopupElement, locale: string): string {
  if (el.name) return el.name;
  if (el.type === "text" || el.type === "button") return pickText(el.text, locale).split("\n")[0].slice(0, 40) || t(`type_${el.type}`);
  if (el.type === "field") return t(`field_${el.field}`);
  return t(`type_${el.type}`);
}

export default function PopupInspector({
  t, tab, setTab, content, setContent, step, device, locale, selected, setSelected, onDelete, onDuplicate, focusText, couponCode,
}: {
  t: PT;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  content: PopupContent;
  setContent: SetContent;
  step: StepId;
  device: Device;
  locale: PopupLocale;
  selected: string | null;
  setSelected: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** pedido para pôr o cursor no texto do elemento (duplo clique na área) */
  focusText: number;
  couponCode: string;
}) {
  const el = content[step].elements.find((e) => e.id === selected) ?? null;
  const tabs: { id: InspectorTab; label: string; icon: LucideIcon }[] = [
    { id: "add", label: t("tab_add"), icon: Plus },
    { id: "element", label: t("tab_element"), icon: MousePointerClick },
    { id: "layers", label: t("tab_layers"), icon: Layers },
    { id: "box", label: t("tab_box"), icon: Scaling },
  ];
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("panel")} className="grid grid-cols-4 gap-1 rounded-2xl border bg-muted/50 p-1">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={cn("flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === x.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <x.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{x.label}
          </button>
        ))}
      </div>
      {tab === "add" && <AddPanel t={t} content={content} setContent={setContent} step={step} device={device} onAdded={(id) => { setSelected(id); setTab("element"); }} />}
      {tab === "element" && (el ? (
        <ElementPanel key={el.id} t={t} el={el} content={content} setContent={setContent} step={step} device={device} locale={locale}
          onDelete={onDelete} onDuplicate={onDuplicate} focusText={focusText} couponCode={couponCode} />
      ) : (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <MousePointerClick className="mx-auto mb-2 h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
          {t("element_none")}
          <button type="button" onClick={() => setTab("add")} className="mt-3 block w-full font-semibold text-brand-orange-text hover:underline">{t("element_add_link")}</button>
        </div>
      ))}
      {tab === "layers" && <LayersPanel t={t} content={content} setContent={setContent} step={step} device={device} locale={locale} selected={selected}
        onSelect={(id) => { setSelected(id); setTab("element"); }} onDelete={onDelete} />}
      {tab === "box" && <BoxPanel t={t} content={content} setContent={setContent} step={step} device={device} />}
    </div>
  );
}

/* ---------- Adicionar ---------- */

function AddPanel({ t, content, setContent, step, device, onAdded }: {
  t: PT; content: PopupContent; setContent: SetContent; step: StepId; device: Device; onAdded: (id: string) => void;
}) {
  const els = content[step].elements;
  const has = (k: FieldKind) => els.some((e) => e.type === "field" && e.field === k);
  const nextY = () => {
    const vis = els.filter((e) => !e.hidden[device]);
    if (!vis.length) return 10;
    const low = Math.max(...vis.map((e) => e[device].y + (e[device].h ?? 9)));
    return Math.min(85, Math.round(low + 2));
  };
  const add = (type: ElementType, extra: Partial<FieldEl> = {}, patch: Record<string, unknown> = {}) => {
    const y = nextY();
    const el = { ...newElement(type, y, extra), ...patch } as PopupElement;
    el.desktop = { ...el.desktop, y };
    el.mobile = { ...el.mobile, y };
    setContent((c) => ({ ...c, [step]: { ...c[step], elements: [...c[step].elements, el] } }), { checkpoint: true });
    onAdded(el.id);
  };
  const form = step === "form";
  const item = (icon: LucideIcon, label: string, hint: string, onClick: () => void, disabled?: string | false) => (
    <button type="button" key={label} onClick={onClick} disabled={!!disabled} title={disabled || hint}
      className="group flex items-start gap-2.5 rounded-xl border bg-card p-2.5 text-left transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-brand-orange-text">{(() => { const I = icon; return <I className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />; })()}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{disabled || hint}</span>
      </span>
    </button>
  );
  return (
    <div className="space-y-3">
      <Group title={t("add_content")} tip={t("add_content_tip")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {item(Heading, t("add_title"), t("add_title_d"), () => add("text", {}, { size: 30, weight: 800, lineHeight: 1.15, text: SAMPLES.title }))}
          {item(Type, t("add_text"), t("add_text_d"), () => add("text", {}, { size: 16, weight: 400, color: "#404040" }))}
          {item(ImageIcon, t("add_image"), t("add_image_d"), () => add("image"))}
          {item(Square, t("add_shape"), t("add_shape_d"), () => add("shape"))}
        </div>
      </Group>
      <Group title={t("add_form")} tip={t("add_form_tip")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {item(Mail, t("field_email"), t("add_email_d"), () => add("field", { field: "email" }), !form ? t("add_only_form") : has("email") && t("add_exists"))}
          {item(Phone, t("field_phone"), t("add_phone_d"), () => add("field", { field: "phone" }), !form ? t("add_only_form") : has("phone") && t("add_exists"))}
          {item(User, t("field_name"), t("add_name_d"), () => add("field", { field: "name", required: false }), !form ? t("add_only_form") : has("name") && t("add_exists"))}
          {item(TextCursorInput, t("field_custom"), t("add_custom_d"), () => add("field", { field: "custom", required: false }), !form && t("add_only_form"))}
          {item(CheckSquare, t("type_consent"), t("add_consent_d"), () => add("consent"), !form ? t("add_only_form") : els.some((e) => e.type === "consent") && t("add_exists"))}
        </div>
      </Group>
      <Group title={t("add_buttons")} tip={t("add_buttons_tip")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {item(RectangleHorizontal, t("add_submit"), t("add_submit_d"), () => add("button"), !form && t("add_only_form"))}
          {item(X, t("add_close"), t("add_close_d"), () => add("button", {}, { action: "close", variant: "text", size: 14, height: 34, weight: 500, text: SAMPLES.close }))}
          {item(MousePointerClick, t("add_link"), t("add_link_d"), () => add("button", {}, { action: "link", href: "/produtos", text: SAMPLES.link }))}
          {item(Ticket, t("type_coupon"), t("add_coupon_d"), () => add("coupon"), form && t("add_only_success"))}
        </div>
      </Group>
    </div>
  );
}

/* ---------- Elemento ---------- */

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function ElementPanel({ t, el, content, setContent, step, device, locale, onDelete, onDuplicate, focusText, couponCode }: {
  t: PT; el: PopupElement; content: PopupContent; setContent: SetContent; step: StepId; device: Device; locale: PopupLocale;
  onDelete: (id: string) => void; onDuplicate: (id: string) => void; focusText: number; couponCode: string;
}) {
  const textRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => { if (focusText) textRef.current?.focus(); }, [focusText]);
  const set = <E extends PopupElement>(patch: Partial<E>) => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, ...patch } as PopupElement)));
  const setBox = (patch: Partial<Box>) => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, [device]: { ...e[device], ...patch } })));
  const move = (dir: "up" | "down" | "top" | "bottom") => setContent((c) => {
    const list = [...c[step].elements];
    const i = list.findIndex((e) => e.id === el.id);
    const [x] = list.splice(i, 1);
    const j = dir === "top" ? list.length : dir === "bottom" ? 0 : dir === "up" ? Math.min(list.length, i + 1) : Math.max(0, i - 1);
    list.splice(j, 0, x);
    return { ...c, [step]: { ...c[step], elements: list } };
  }, { checkpoint: true });
  const b = el[device];
  const Icon = el.type === "field" ? FIELD_ICON[el.field] : TYPE_ICON[el.type];
  const withH = el.type === "image" || el.type === "shape";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border bg-card p-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-brand-orange-text"><Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{elementLabel(t, el, locale)}</p>
          <p className="text-[11px] text-muted-foreground">{el.type === "field" ? t(`field_${el.field}_d`) : t(`type_${el.type}_d`)}</p>
        </div>
        <button type="button" onClick={() => onDuplicate(el.id)} title={t("duplicate")} aria-label={t("duplicate")} className="grid h-8 w-8 place-items-center rounded-lg border hover:bg-muted"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></button>
        <button type="button" onClick={() => onDelete(el.id)} title={t("delete_el")} aria-label={t("delete_el")} className="grid h-8 w-8 place-items-center rounded-lg border text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>

      {el.type === "text" && <TextProps t={t} el={el} set={set} locale={locale} textRef={textRef} content={content} device={device} />}
      {el.type === "image" && (
        <Group title={t("g_image")}>
          <ImagePick label={t("image_src")} tip={t("image_src_tip")} value={el.src} onChange={(src) => set<ImageEl>({ src })}
            onLoaded={(w, h) => {
              if (el.src && (b.h == null || b.h === 22)) {
                const size = content.size[device];
                const hPct = Math.round(((b.w / 100) * size.w * (h / w) / size.h) * 1000) / 10;
                if (Number.isFinite(hPct) && hPct > 0) setBox({ h: Math.min(120, hPct) });
              }
            }} />
          <Field label={t("image_fit")} tip={t("image_fit_tip")}>
            <Segmented label={t("image_fit")} full size="sm" value={el.fit} onChange={(fit) => set<ImageEl>({ fit })} options={[
              { value: "contain", label: t("fit_contain") }, { value: "cover", label: t("fit_cover") },
            ]} />
          </Field>
          <NumberSlider label={t("radius")} tip={t("radius_tip")} value={el.radius} min={0} max={300} onChange={(radius) => set<ImageEl>({ radius })} suffix="px" />
          <NumberSlider label={t("opacity")} value={el.opacity} min={0} max={100} onChange={(opacity) => set<ImageEl>({ opacity })} suffix="%" />
          <L10nField label={t("image_alt")} tip={t("image_alt_tip")} value={el.alt} onChange={(alt) => set<ImageEl>({ alt })} locale={locale} max={200} />
          <Field label={t("image_href")} tip={t("image_href_tip")}>
            <Input value={el.href} placeholder="/produtos" onChange={(e) => set<ImageEl>({ href: e.target.value.trim() })} className="h-9 text-sm" />
          </Field>
        </Group>
      )}
      {el.type === "shape" && (
        <Group title={t("g_shape")} tip={t("type_shape_d")}>
          <ColorPick label={t("color_fill")} value={el.color} allowEmpty={false} onChange={(color) => set<ShapeEl>({ color })} />
          <NumberSlider label={t("opacity")} tip={t("shape_opacity_tip")} value={el.opacity} min={0} max={100} onChange={(opacity) => set<ShapeEl>({ opacity })} suffix="%" />
          <NumberSlider label={t("radius")} tip={t("radius_tip")} value={el.radius} min={0} max={300} onChange={(radius) => set<ShapeEl>({ radius })} suffix="px" />
          <Row>
            <ColorPick label={t("border_color")} value={el.borderColor} onChange={(borderColor) => set<ShapeEl>({ borderColor })} themeHint={t("none")} />
            <NumberSlider label={t("border_width")} value={el.borderWidth} min={0} max={12} onChange={(borderWidth) => set<ShapeEl>({ borderWidth })} suffix="px" />
          </Row>
        </Group>
      )}
      {el.type === "field" && <FieldProps t={t} el={el} set={set} locale={locale} textRef={textRef} />}
      {el.type === "consent" && (
        <Group title={t("type_consent")} tip={t("consent_tip")}>
          <L10nField label={t("consent_text")} value={el.text} onChange={(text) => set<ConsentEl>({ text })} locale={locale} multiline max={400} inputRef={textRef} />
          <SwitchRow label={t("required")} hint={t("consent_required_d")} checked={el.required} onChange={(required) => set<ConsentEl>({ required })} />
          <SwitchRow label={t("consent_privacy")} hint={t("consent_privacy_d")} checked={el.privacyLink} onChange={(privacyLink) => set<ConsentEl>({ privacyLink })} />
          <Row>
            <ColorPick label={t("color_text")} value={el.color} onChange={(color) => set<ConsentEl>({ color })} />
            <NumberSlider label={t("font_size")} value={el.size} min={10} max={20} onChange={(size) => set<ConsentEl>({ size })} suffix="px" />
          </Row>
        </Group>
      )}
      {el.type === "button" && <ButtonProps t={t} el={el} set={set} locale={locale} textRef={textRef} step={step} />}
      {el.type === "coupon" && (
        <Group title={t("type_coupon")} tip={t("coupon_el_tip")}>
          <p className={cn("rounded-xl px-3 py-2 text-xs", couponCode ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-800")}>
            {couponCode ? t("coupon_el_code", { code: couponCode }) : t("coupon_el_none")}
          </p>
          <L10nField label={t("coupon_label")} value={el.label} onChange={(label) => set<CouponEl>({ label })} locale={locale} max={80} inputRef={textRef} />
          <L10nField label={t("coupon_copy")} value={el.copyText} onChange={(copyText) => set<CouponEl>({ copyText })} locale={locale} max={40} />
          <Row>
            <ColorPick label={t("color_fill")} value={el.bg} onChange={(bg) => set<CouponEl>({ bg })} />
            <ColorPick label={t("color_text")} value={el.color} onChange={(color) => set<CouponEl>({ color })} />
          </Row>
          <ColorPick label={t("border_color")} value={el.borderColor} onChange={(borderColor) => set<CouponEl>({ borderColor })} />
          <NumberSlider label={t("font_size")} value={el.size} min={14} max={48} onChange={(size) => set<CouponEl>({ size })} suffix="px" />
          <NumberSlider label={t("radius")} value={el.radius} min={0} max={40} onChange={(radius) => set<CouponEl>({ radius })} suffix="px" />
        </Group>
      )}

      <Group title={t("g_position", { device: t(device === "desktop" ? "device_desktop" : "device_mobile") })} tip={t("g_position_tip")} icon={Crosshair}>
        <div className="grid grid-cols-2 gap-2">
          {(["x", "y", "w", ...(withH ? ["h"] : [])] as (keyof Box)[]).map((k) => (
            <Field key={k} label={t(`pos_${k}`)}>
              <div className="relative">
                <Input inputMode="decimal" value={String(b[k] ?? "")} aria-label={t(`pos_${k}`)}
                  onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); if (Number.isFinite(n)) setBox({ [k]: n }); }}
                  className="h-9 pr-7 text-sm tabular-nums" />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, [device]: { ...e[device], x: Math.round((100 - e[device].w) * 5) / 10 } })), { checkpoint: true })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted"><AlignCenter className="h-3.5 w-3.5" aria-hidden="true" />{t("center_h")}</button>
          <button type="button" onClick={() => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, [device]: { ...e[device], x: 0, y: 0, w: 100, h: e[device].h == null ? null : 100 } })), { checkpoint: true })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted"><Scaling className="h-3.5 w-3.5" aria-hidden="true" />{t("fill_box")}</button>
          <button type="button" onClick={() => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, [device === "desktop" ? "mobile" : "desktop"]: { ...e[device] } })), { checkpoint: true })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted">
            {device === "desktop" ? <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> : <Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
            {t(device === "desktop" ? "copy_to_mobile" : "copy_to_desktop")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SwitchRow label={t("show_desktop")} checked={!el.hidden.desktop} onChange={(v) => set({ hidden: { ...el.hidden, desktop: !v } })} />
          <SwitchRow label={t("show_mobile")} checked={!el.hidden.mobile} onChange={(v) => set({ hidden: { ...el.hidden, mobile: !v } })} />
        </div>
        <Field label={t("order")} tip={t("order_tip")}>
          <div className="grid grid-cols-4 gap-1.5">
            {([["top", ChevronsUp, "order_top"], ["up", ArrowUp, "order_up"], ["down", ArrowDown, "order_down"], ["bottom", ChevronsDown, "order_bottom"]] as const).map(([d, I, k]) => (
              <button key={d} type="button" onClick={() => move(d)} title={t(k)} aria-label={t(k)} className="grid h-9 place-items-center rounded-lg border hover:bg-muted"><I className="h-4 w-4" aria-hidden="true" /></button>
            ))}
          </div>
        </Field>
        <Field label={t("el_name")} tip={t("el_name_tip")}>
          <Input value={el.name} maxLength={60} placeholder={elementLabel(t, { ...el, name: "" }, locale)} onChange={(e) => set({ name: e.target.value })} className="h-9 text-sm" />
        </Field>
      </Group>
    </div>
  );
}

function TextProps({ t, el, set, locale, textRef, content, device }: {
  t: PT; el: TextEl; set: (p: Partial<TextEl>) => void; locale: PopupLocale; textRef: React.Ref<HTMLTextAreaElement | HTMLInputElement>;
  content: PopupContent; device: Device;
}) {
  const auto = mobileFont(el.size, content);
  return (
    <>
      <Group title={t("g_text")}>
        <L10nField label={t("text")} tip={t("text_tip")} value={el.text} onChange={(text) => set({ text })} locale={locale} multiline inputRef={textRef} />
      </Group>
      <Group title={t("g_font")} tip={t("g_font_tip")}>
        <NumberSlider label={t("font_size_desktop")} value={el.size} min={8} max={96} onChange={(size) => set({ size })} suffix="px" />
        <Field label={t("font_size_mobile")} tip={t("font_size_mobile_tip")}>
          <div className="flex items-center gap-2">
            <Segmented label={t("font_size_mobile")} size="sm" value={el.mobileSize == null ? "auto" : "own"}
              onChange={(v) => set({ mobileSize: v === "auto" ? null : auto })} options={[
                { value: "auto", label: t("auto_n", { n: auto }) }, { value: "own", label: t("own") },
              ]} />
            {el.mobileSize != null && (
              <Input inputMode="numeric" value={String(el.mobileSize)} aria-label={t("font_size_mobile")}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 8 && n <= 96) set({ mobileSize: n }); }}
                className="h-8 w-16 text-sm" />
            )}
          </div>
          {device === "mobile" && el.mobileSize == null && <p className="text-[11px] text-muted-foreground">{t("font_auto_now", { n: auto })}</p>}
        </Field>
        <Row>
          <Field label={t("weight")}>
            <Select value={String(el.weight)} onValueChange={(v) => set({ weight: Number(v) })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{([300, 400, 500, 600, 700, 800, 900] as const).map((w) => <SelectItem key={w} value={String(w)}>{t(`weight_${w}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <ColorPick label={t("color_text")} value={el.color} onChange={(color) => set({ color })} />
        </Row>
        <Field label={t("align")}>
          <Segmented label={t("align")} full size="sm" value={el.align} onChange={(align) => set({ align })} options={[
            { value: "left", label: t("align_left"), icon: AlignLeft }, { value: "center", label: t("align_center"), icon: AlignCenter }, { value: "right", label: t("align_right"), icon: AlignRight },
          ]} />
        </Field>
        <Row>
          <SwitchRow label={t("italic")} checked={el.italic} onChange={(italic) => set({ italic })} />
          <SwitchRow label={t("upper")} checked={el.upper} onChange={(upper) => set({ upper })} />
        </Row>
        <NumberSlider label={t("line_height")} tip={t("line_height_tip")} value={el.lineHeight} min={0.8} max={2.5} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
        <NumberSlider label={t("letter_spacing")} tip={t("letter_spacing_tip")} value={el.letterSpacing} min={-5} max={20} step={0.5} onChange={(letterSpacing) => set({ letterSpacing })} />
      </Group>
      <Group title={t("g_text_bg")} tip={t("g_text_bg_tip")}>
        <ColorPick label={t("color_fill")} value={el.bg} onChange={(bg) => set({ bg })} themeHint={t("none")} />
        <Row>
          <NumberSlider label={t("padding")} value={el.padding} min={0} max={60} onChange={(padding) => set({ padding })} suffix="px" />
          <NumberSlider label={t("radius")} value={el.radius} min={0} max={60} onChange={(radius) => set({ radius })} suffix="px" />
        </Row>
      </Group>
    </>
  );
}

function FieldProps({ t, el, set, locale, textRef }: {
  t: PT; el: FieldEl; set: (p: Partial<FieldEl>) => void; locale: PopupLocale; textRef: React.Ref<HTMLTextAreaElement | HTMLInputElement>;
}) {
  return (
    <>
      <Group title={t(`field_${el.field}`)} tip={t("field_tip")}>
        <L10nField label={t("placeholder")} tip={t("placeholder_tip")} value={el.placeholder} onChange={(placeholder) => set({ placeholder })} locale={locale} max={120} inputRef={textRef} />
        <L10nField label={t("label")} tip={t("label_tip")} value={el.label} onChange={(label) => set({ label })} locale={locale} max={120} />
        {el.field === "custom" && (
          <Field label={t("field_key")} tip={t("field_key_tip")}>
            <Input value={el.key} maxLength={40} onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) })} className="h-9 font-mono text-sm" />
          </Field>
        )}
        <SwitchRow label={t("required")} hint={t("required_d")} checked={el.required} onChange={(required) => set({ required })} />
        <SwitchRow label={t("show_label")} hint={t("show_label_d")} checked={el.showLabel} onChange={(showLabel) => set({ showLabel })} />
      </Group>
      <Group title={t("g_field_look")}>
        <Row>
          <ColorPick label={t("color_fill")} value={el.bg} onChange={(bg) => set({ bg })} />
          <ColorPick label={t("color_text")} value={el.color} onChange={(color) => set({ color })} />
        </Row>
        <Row>
          <ColorPick label={t("border_color")} value={el.borderColor} onChange={(borderColor) => set({ borderColor })} />
          <ColorPick label={t("label_color")} value={el.labelColor} onChange={(labelColor) => set({ labelColor })} />
        </Row>
        <NumberSlider label={t("height")} tip={t("height_tip")} value={el.height} min={32} max={80} onChange={(height) => set({ height })} suffix="px" />
        <Row>
          <NumberSlider label={t("font_size")} value={el.size} min={12} max={24} onChange={(size) => set({ size })} suffix="px" />
          <NumberSlider label={t("radius")} value={el.radius} min={0} max={40} onChange={(radius) => set({ radius })} suffix="px" />
        </Row>
      </Group>
    </>
  );
}

function ButtonProps({ t, el, set, locale, textRef, step }: {
  t: PT; el: ButtonEl; set: (p: Partial<ButtonEl>) => void; locale: PopupLocale; textRef: React.Ref<HTMLTextAreaElement | HTMLInputElement>; step: StepId;
}) {
  return (
    <>
      <Group title={t("type_button")} tip={t("button_tip")}>
        <L10nField label={t("text")} value={el.text} onChange={(text) => set({ text })} locale={locale} max={120} inputRef={textRef} />
        <Field label={t("button_action")} tip={t("button_action_tip")}>
          <Select value={el.action} onValueChange={(v) => set({ action: v as ButtonEl["action"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {step === "form" && <SelectItem value="submit">{t("action_submit")}</SelectItem>}
              <SelectItem value="close">{t("action_close")}</SelectItem>
              <SelectItem value="link">{t("action_link")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {el.action === "link" && (
          <>
            <Field label={t("button_href")} tip={t("button_href_tip")}>
              <Input value={el.href} placeholder="/produtos" onChange={(e) => set({ href: e.target.value.trim() })} className="h-9 text-sm" aria-invalid={!el.href || undefined} />
            </Field>
            <SwitchRow label={t("new_tab")} checked={el.newTab} onChange={(newTab) => set({ newTab })} />
          </>
        )}
      </Group>
      <Group title={t("g_button_look")}>
        <Field label={t("variant")} tip={t("variant_tip")}>
          <Segmented label={t("variant")} full size="sm" value={el.variant} onChange={(variant) => set({ variant })} options={[
            { value: "solid", label: t("variant_solid") }, { value: "outline", label: t("variant_outline") }, { value: "text", label: t("variant_text") },
          ]} />
        </Field>
        <Row>
          <ColorPick label={t("color_button")} value={el.bg} onChange={(bg) => set({ bg })} />
          <ColorPick label={t("color_text")} value={el.color} onChange={(color) => set({ color })} />
        </Row>
        <NumberSlider label={t("height")} value={el.height} min={28} max={90} onChange={(height) => set({ height })} suffix="px" />
        <Row>
          <NumberSlider label={t("font_size")} value={el.size} min={11} max={30} onChange={(size) => set({ size })} suffix="px" />
          <NumberSlider label={t("radius")} value={el.radius} min={0} max={40} onChange={(radius) => set({ radius })} suffix="px" />
        </Row>
        <Row>
          <Field label={t("weight")}>
            <Select value={String(el.weight)} onValueChange={(v) => set({ weight: Number(v) })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{([400, 500, 600, 700, 800, 900] as const).map((w) => <SelectItem key={w} value={String(w)}>{t(`weight_${w}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <SwitchRow label={t("upper")} checked={el.upper} onChange={(upper) => set({ upper })} />
        </Row>
      </Group>
    </>
  );
}

/* ---------- Camadas ---------- */

function LayersPanel({ t, content, setContent, step, device, locale, selected, onSelect, onDelete }: {
  t: PT; content: PopupContent; setContent: SetContent; step: StepId; device: Device; locale: string; selected: string | null;
  onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  const list = [...content[step].elements].reverse();
  if (!list.length) return <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("layers_empty")}</p>;
  const move = (id: string, dir: 1 | -1) => setContent((c) => {
    const els = [...c[step].elements];
    const i = els.findIndex((e) => e.id === id);
    const j = i + dir;
    if (j < 0 || j >= els.length) return c;
    [els[i], els[j]] = [els[j], els[i]];
    return { ...c, [step]: { ...c[step], elements: els } };
  }, { checkpoint: true });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("layers_d")}</p>
      <ul className="space-y-1.5">
        {list.map((el) => {
          const Icon = el.type === "field" ? FIELD_ICON[el.field] : TYPE_ICON[el.type];
          const hidden = el.hidden[device];
          return (
            <li key={el.id} className={cn("flex items-center gap-1.5 rounded-xl border bg-card p-1.5 pl-2", selected === el.id && "border-primary ring-1 ring-primary")}>
              <button type="button" onClick={() => onSelect(el.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", hidden && "opacity-50")}>
                <Icon className="h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
                <span className="truncate text-[13px] font-medium">{elementLabel(t, el, locale)}</span>
              </button>
              <button type="button" onClick={() => setContent((c) => updateElement(c, step, el.id, (e) => ({ ...e, hidden: { ...e.hidden, [device]: !hidden } })), { checkpoint: true })}
                title={hidden ? t("layer_show") : t("layer_hide")} aria-label={hidden ? t("layer_show") : t("layer_hide")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
                {hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              <button type="button" onClick={() => move(el.id, 1)} title={t("order_up")} aria-label={t("order_up")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <button type="button" onClick={() => move(el.id, -1)} title={t("order_down")} aria-label={t("order_down")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <button type="button" onClick={() => onDelete(el.id)} title={t("delete_el")} aria-label={t("delete_el")} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Fundo e tamanho ---------- */

const PRESETS: { id: "square" | "portrait" | "landscape" | "wide" | "small"; d: { w: number; h: number }; m: { w: number; h: number } }[] = [
  { id: "square", d: { w: 520, h: 520 }, m: { w: 340, h: 340 } },
  { id: "portrait", d: { w: 480, h: 640 }, m: { w: 340, h: 520 } },
  { id: "landscape", d: { w: 760, h: 440 }, m: { w: 340, h: 480 } },
  { id: "wide", d: { w: 900, h: 300 }, m: { w: 340, h: 360 } },
  { id: "small", d: { w: 360, h: 300 }, m: { w: 340, h: 280 } },
];

function BoxPanel({ t, content, setContent, step, device }: { t: PT; content: PopupContent; setContent: SetContent; step: StepId; device: Device }) {
  const bg = content[step].bg;
  const setBg = (patch: Partial<typeof bg>) => setContent((c) => ({ ...c, [step]: { ...c[step], bg: { ...c[step].bg, ...patch } } }));
  const setC = (patch: Partial<PopupContent>) => setContent((c) => ({ ...c, ...patch }));
  const setSize = (d: Device, patch: Partial<{ w: number; h: number }>) => setContent((c) => ({ ...c, size: { ...c.size, [d]: { ...c.size[d], ...patch } } }));
  const fitTo = (natW: number, natH: number, d: Device) => setContent((c) => {
    const sized = { ...c, size: { ...c.size, [d]: { ...c.size[d], h: heightForImage(c.size[d].w, natW, natH, d) } } };
    return keepApart(keepApart(sized, "form", d), "success", d);
  }, { checkpoint: true });
  const [natural, setNatural] = useState<{ desktop?: [number, number]; mobile?: [number, number] }>({});
  const other: StepId = step === "form" ? "success" : "form";
  return (
    <div className="space-y-3">
      <Group title={t("g_size")} tip={t("g_size_tip")} icon={Scaling}>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => setContent((c) => ({ ...c, size: { desktop: p.d, mobile: p.m } }), { checkpoint: true })}
              className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-semibold hover:border-primary/50 hover:bg-accent">
              {t(`preset_${p.id}`)}
            </button>
          ))}
        </div>
        {(["desktop", "mobile"] as Device[]).map((d) => {
          const lim = SIZE_LIMITS[d];
          return (
            <div key={d} className={cn("space-y-2 rounded-xl border p-2.5", d === device && "border-primary/40 bg-accent/40")}>
              <p className="flex items-center gap-1.5 text-xs font-bold">
                {d === "desktop" ? <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> : <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
                {t(d === "desktop" ? "device_desktop" : "device_mobile")}
              </p>
              <NumberSlider label={t("width")} value={content.size[d].w} min={lim.minW} max={lim.maxW} onChange={(w) => setSize(d, { w })} suffix="px" />
              <NumberSlider label={t("height")} value={content.size[d].h} min={lim.minH} max={lim.maxH} onChange={(h) => setSize(d, { h })} suffix="px" />
              {((d === "mobile" ? bg.mobileImage || bg.image : bg.image) && natural[d]) && (
                <button type="button" onClick={() => { const n = natural[d]; if (n) fitTo(n[0], n[1], d); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted" title={t("fit_image_tip")}>
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />{t("fit_image")}
                </button>
              )}
            </div>
          );
        })}
      </Group>

      <Group title={t("g_background", { step: t(step === "form" ? "step_form" : "step_success") })} tip={t("g_background_tip")} icon={ImageIcon}>
        <ImagePick label={t("bg_image")} tip={t("bg_image_tip")} hint={t("bg_image_hint")} value={bg.image} onChange={(image) => setBg({ image })}
          onLoaded={(w, h) => setNatural((n) => ({ ...n, desktop: [w, h], ...(bg.mobileImage ? {} : { mobile: [w, h] }) }))} />
        <ImagePick label={t("bg_mobile")} tip={t("bg_mobile_tip")} value={bg.mobileImage} onChange={(mobileImage) => setBg({ mobileImage })}
          onLoaded={(w, h) => setNatural((n) => ({ ...n, mobile: [w, h] }))} />
        <Row>
          <Field label={t("bg_fit")} tip={t("bg_fit_tip")}>
            <Select value={bg.fit} onValueChange={(v) => setBg({ fit: v as typeof bg.fit })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">{t("fit_cover")}</SelectItem>
                <SelectItem value="contain">{t("fit_contain")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("bg_position")} tip={t("bg_position_tip")}>
            <Select value={bg.position} onValueChange={(v) => setBg({ position: v as typeof bg.position })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(["center", "top", "bottom", "left", "right"] as const).map((p) => <SelectItem key={p} value={p}>{t(`bgpos_${p}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </Row>
        <ColorPick label={t("bg_color")} tip={t("bg_color_tip")} value={bg.color} onChange={(color) => setBg({ color })} themeHint={t("color_theme_card")} />
        <Row>
          <ColorPick label={t("overlay_color")} tip={t("overlay_tip")} value={bg.overlay} allowEmpty={false} onChange={(overlay) => setBg({ overlay })} />
          <NumberSlider label={t("overlay_opacity")} value={bg.overlayOpacity} min={0} max={90} onChange={(overlayOpacity) => setBg({ overlayOpacity })} suffix="%" />
        </Row>
        <button type="button" onClick={() => setContent((c) => ({ ...c, [other]: { ...c[other], bg: { ...c[step].bg } } }), { checkpoint: true })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />{t(step === "form" ? "bg_copy_to_success" : "bg_copy_to_form")}
        </button>
      </Group>

      <Group title={t("g_frame")} tip={t("g_frame_tip")}>
        <NumberSlider label={t("radius")} tip={t("frame_radius_tip")} value={content.radius} min={0} max={48} onChange={(radius) => setC({ radius })} suffix="px" />
        <Field label={t("shadow")}>
          <Segmented label={t("shadow")} full size="sm" value={content.shadow} onChange={(shadow) => setC({ shadow })} options={[
            { value: "none", label: t("shadow_none") }, { value: "soft", label: t("shadow_soft") }, { value: "strong", label: t("shadow_strong") },
          ]} />
        </Field>
        <Row>
          <ColorPick label={t("border_color")} value={content.borderColor} onChange={(borderColor) => setC({ borderColor })} themeHint={t("none")} />
          <NumberSlider label={t("border_width")} value={content.borderWidth} min={0} max={12} onChange={(borderWidth) => setC({ borderWidth })} suffix="px" />
        </Row>
      </Group>

      <Group title={t("g_close")} tip={t("g_close_tip")} icon={X}>
        <SwitchRow label={t("close_show")} hint={t("close_show_d")} checked={content.close.show} onChange={(show) => setC({ close: { ...content.close, show } })} />
        <Row>
          <ColorPick label={t("close_color")} value={content.close.color} allowEmpty={false} onChange={(color) => setC({ close: { ...content.close, color } })} />
          <ColorPick label={t("close_bg")} value={content.close.bg} onChange={(bg) => setC({ close: { ...content.close, bg } })} themeHint={t("none")} />
        </Row>
        <Field label={t("close_size")}>
          <Segmented label={t("close_size")} full size="sm" value={content.close.size} onChange={(size) => setC({ close: { ...content.close, size } })} options={[
            { value: "sm", label: t("size_sm") }, { value: "md", label: t("size_md") }, { value: "lg", label: t("size_lg") },
          ]} />
        </Field>
        <NumberSlider label={t("close_delay")} tip={t("close_delay_tip")} value={content.close.delay} min={0} max={30} onChange={(delay) => setC({ close: { ...content.close, delay } })} suffix="s" />
      </Group>
    </div>
  );
}

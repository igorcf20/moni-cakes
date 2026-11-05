// =====================================================================================
// Desenho de um pop-up de captação (src/lib/leadPopups.ts): a mesma peça na loja (LeadPopups), no construtor do Admin
// (PopupBuilder, com seleção e alças para arrastar) e nas miniaturas da lista. Mede sempre o tamanho real em px do
// aparelho escolhido; quem usa reduz com transform quando não cabe.
// Cores vazias = cores do tema da loja (laranja do botão, texto escuro).
// =====================================================================================
import { useId, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mobileFont, pickText, type Box, type Device, type LeadError, type LeadValues, type PopupContent, type PopupElement, type StepId,
} from "@/lib/leadPopups";

export type Handle = "move" | "e" | "w" | "s" | "se";

export type SiteBindings = {
  values: LeadValues;
  setValue: (field: "email" | "phone" | "name" | "custom", key: string, v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  errors: Record<string, LeadError | "rate" | "closed" | "generic">;
  errorText: (code: string) => string;
  submitting: boolean;
  sendingText: string;
  coupon: string | null;
  copied: boolean;
  onCopy: () => void;
  onSubmit: () => void;
  onClose: () => void;
  closeVisible: boolean;
};

export type EditBindings = {
  selected: string | null;
  onPointerDown: (e: ReactPointerEvent, id: string, handle: Handle) => void;
  onCanvasPointerDown: (e: ReactPointerEvent) => void;
  guides?: { x: number[]; y: number[] };
};

/** #RRGGBB + opacidade 0-100 -> rgba() */
export function rgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
}

const SHADOW: Record<PopupContent["shadow"], string> = {
  none: "none",
  soft: "0 18px 50px -12px rgba(23, 23, 23, 0.28)",
  strong: "0 30px 80px -10px rgba(23, 23, 23, 0.5)",
};
const CLOSE_SIZE = { sm: 28, md: 36, lg: 44 } as const;
const POS: Record<string, string> = { center: "center", top: "top", bottom: "bottom", left: "left", right: "right" };

function boxStyle(b: Box, withH: boolean): CSSProperties {
  return { position: "absolute", left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: withH && b.h != null ? `${b.h}%` : undefined };
}

export default function PopupCanvas({
  content, step, device, locale, mode, site, edit, privacyHref = "/politica-privacidade", closeLabel, privacyLabel, previewCoupon, className, titleId,
}: {
  content: PopupContent;
  step: StepId;
  device: Device;
  locale: string;
  mode: "site" | "edit" | "thumb";
  site?: SiteBindings;
  edit?: EditBindings;
  privacyHref?: string;
  closeLabel: string;
  privacyLabel: string;
  /** cupom de exemplo no editor e no teste */
  previewCoupon?: string;
  className?: string;
  titleId?: string;
}) {
  const uid = useId();
  const size = content.size[device];
  const s = content[step];
  const bg = s.bg;
  const image = device === "mobile" ? bg.mobileImage || bg.image : bg.image;
  const interactive = mode === "site";
  const firstText = s.elements.find((e) => e.type === "text" && !e.hidden[device]);

  const root: CSSProperties = {
    width: size.w,
    height: size.h,
    borderRadius: content.radius,
    background: bg.color || "hsl(var(--card))",
    boxShadow: mode === "thumb" ? "none" : SHADOW[content.shadow],
    border: content.borderWidth && content.borderColor ? `${content.borderWidth}px solid ${content.borderColor}` : undefined,
  };

  // Fora da loja (editor e miniaturas) nada é clicável: divs no lugar de botões e campos (miniatura fica dentro de botões).
  const CloseTag = interactive ? "button" : "div";
  const els = s.elements.filter((e) => !e.hidden[device] || mode === "edit");

  const body = (
    <>
      {image && (
        <img
          src={image}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          style={{ objectFit: bg.fit, objectPosition: POS[bg.position] }}
        />
      )}
      {bg.overlayOpacity > 0 && <div className="pointer-events-none absolute inset-0" style={{ background: rgba(bg.overlay, bg.overlayOpacity) }} />}
      {els.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          content={content}
          device={device}
          locale={locale}
          mode={mode}
          site={site}
          edit={edit}
          uid={uid}
          privacyHref={privacyHref}
          privacyLabel={privacyLabel}
          previewCoupon={previewCoupon}
          titleId={el === firstText ? titleId : undefined}
        />
      ))}
      {edit?.guides && (
        <>
          {edit.guides.x.map((x) => <div key={`gx${x}`} className="pointer-events-none absolute inset-y-0 z-30 w-px bg-sky-500" style={{ left: `${x}%` }} />)}
          {edit.guides.y.map((y) => <div key={`gy${y}`} className="pointer-events-none absolute inset-x-0 z-30 h-px bg-sky-500" style={{ top: `${y}%` }} />)}
        </>
      )}
      {content.close.show && (mode !== "site" || site?.closeVisible) && (
        <CloseTag
          {...(interactive ? { type: "button" as const, "aria-label": closeLabel, title: closeLabel, onClick: site?.onClose } : { "aria-hidden": true })}
          className={cn(
            "absolute right-2.5 top-2.5 z-20 grid place-items-center rounded-full transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            interactive ? "hover:scale-105" : "pointer-events-none",
          )}
          style={{ width: CLOSE_SIZE[content.close.size], height: CLOSE_SIZE[content.close.size], color: content.close.color, background: content.close.bg || "transparent" }}
        >
          <X style={{ width: CLOSE_SIZE[content.close.size] * 0.5, height: CLOSE_SIZE[content.close.size] * 0.5 }} strokeWidth={2} aria-hidden="true" />
        </CloseTag>
      )}
    </>
  );

  const cls = cn("relative isolate overflow-hidden text-left", className);
  if (interactive && step === "form") {
    return (
      <form
        noValidate
        className={cls}
        style={root}
        onSubmit={(e) => { e.preventDefault(); site?.onSubmit(); }}
      >
        {body}
        {site?.errors._form && <p role="alert" className="absolute inset-x-3 bottom-2 z-20 rounded-lg bg-destructive px-3 py-1.5 text-center text-xs font-medium text-destructive-foreground">{site.errorText(site.errors._form)}</p>}
      </form>
    );
  }
  return (
    <div className={cls} style={root} onPointerDown={edit ? edit.onCanvasPointerDown : undefined}>
      {body}
    </div>
  );
}

function ElementView({ el, content, device, locale, mode, site, edit, uid, privacyHref, privacyLabel, previewCoupon, titleId }: {
  el: PopupElement;
  content: PopupContent;
  device: Device;
  locale: string;
  mode: "site" | "edit" | "thumb";
  site?: SiteBindings;
  edit?: EditBindings;
  uid: string;
  privacyHref: string;
  privacyLabel: string;
  previewCoupon?: string;
  titleId?: string;
}) {
  const b = el[device];
  const withH = el.type === "image" || el.type === "shape";
  const interactive = mode === "site";
  const selected = edit?.selected === el.id;
  const hiddenHere = el.hidden[device];
  const style: CSSProperties = { ...boxStyle(b, withH) };
  let inner: ReactNode = null;

  switch (el.type) {
    case "text": {
      const size = device === "mobile" ? el.mobileSize ?? mobileFont(el.size, content) : el.size;
      inner = (
        <div
          id={titleId}
          style={{
            fontSize: size, fontWeight: el.weight, color: el.color || "hsl(var(--foreground))", textAlign: el.align,
            fontStyle: el.italic ? "italic" : undefined, textTransform: el.upper ? "uppercase" : undefined, lineHeight: el.lineHeight,
            letterSpacing: el.letterSpacing ? `${el.letterSpacing / 100}em` : undefined, background: el.bg || undefined,
            padding: el.padding || undefined, borderRadius: el.radius || undefined, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          }}
        >
          {pickText(el.text, locale)}
        </div>
      );
      break;
    }
    case "image": {
      const img = el.src ? (
        <img src={el.src} alt={pickText(el.alt, locale)} draggable={false} className="h-full w-full select-none"
          style={{ objectFit: el.fit, borderRadius: el.radius, opacity: el.opacity / 100 }} />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/60 text-xs text-muted-foreground">IMG</div>
      );
      inner = interactive && el.href
        ? <a href={el.href} className="block h-full w-full" onClick={() => site?.onClose()}>{img}</a>
        : img;
      break;
    }
    case "shape":
      inner = (
        <div className="h-full w-full" style={{
          background: rgba(el.color || "#FFFFFF", el.opacity), borderRadius: el.radius,
          border: el.borderWidth && el.borderColor ? `${el.borderWidth}px solid ${el.borderColor}` : undefined,
        }} />
      );
      break;
    case "field": {
      const id = `${uid}-${el.id}`;
      const err = site?.errors[el.id];
      const value = el.field === "custom" ? site?.values.extra?.[el.key] ?? "" : site?.values[el.field] ?? "";
      const label = pickText(el.label, locale);
      inner = (
        <div className="relative">
          {el.showLabel && <label htmlFor={id} className="mb-1 block font-semibold" style={{ fontSize: Math.max(12, el.size - 2), color: el.labelColor || "hsl(var(--foreground))" }}>{label}{el.required ? " *" : ""}</label>}
          {!interactive ? (
            <div className="flex w-full items-center overflow-hidden whitespace-nowrap px-4" style={{
              height: el.height, fontSize: el.size, borderRadius: el.radius, background: el.bg || "hsl(var(--background))",
              color: el.color || "hsl(var(--foreground))", border: `1px solid ${el.borderColor || "hsl(var(--border))"}`,
            }}><span className="opacity-60">{pickText(el.placeholder, locale)}</span></div>
          ) : <input
            id={id}
            type={el.field === "email" ? "email" : el.field === "phone" ? "tel" : "text"}
            inputMode={el.field === "email" ? "email" : el.field === "phone" ? "tel" : undefined}
            autoComplete={el.field === "email" ? "email" : el.field === "phone" ? "tel" : el.field === "name" ? "name" : "off"}
            placeholder={pickText(el.placeholder, locale)}
            aria-label={el.showLabel ? undefined : label}
            aria-required={el.required || undefined}
            aria-invalid={!!err || undefined}
            aria-describedby={err ? `${id}-err` : undefined}
            readOnly={!interactive}
            tabIndex={interactive ? 0 : -1}
            value={interactive ? value : ""}
            maxLength={300}
            onChange={(e) => site?.setValue(el.field, el.key, e.target.value)}
            className={cn("block w-full px-4 outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring", !interactive && "pointer-events-none")}
            style={{
              height: el.height, fontSize: el.size, borderRadius: el.radius, background: el.bg || "hsl(var(--background))",
              color: el.color || "hsl(var(--foreground))", border: `1px solid ${err ? "hsl(var(--destructive))" : el.borderColor || "hsl(var(--border))"}`,
            }}
          />}
          {err && site && <p id={`${id}-err`} role="alert" className="absolute left-1 top-full z-10 mt-0.5 rounded-md bg-destructive px-2 py-0.5 text-[11px] font-medium text-destructive-foreground">{site.errorText(err)}</p>}
        </div>
      );
      break;
    }
    case "consent": {
      const id = `${uid}-${el.id}`;
      const err = site?.errors[el.id];
      inner = (
        <div className="relative">
          <label htmlFor={id} className={cn("flex items-start gap-2 leading-snug", interactive ? "cursor-pointer" : "pointer-events-none")} style={{ fontSize: el.size, color: el.color || "hsl(var(--muted-foreground))" }}>
            {!interactive ? <span className="mt-[0.15em] h-[1.1em] w-[1.1em] shrink-0 rounded-[3px] border border-current bg-white/80" /> : <input
              id={id}
              type="checkbox"
              checked={interactive ? !!site?.consent : false}
              readOnly={!interactive}
              tabIndex={interactive ? 0 : -1}
              aria-invalid={!!err || undefined}
              onChange={(e) => site?.setConsent(e.target.checked)}
              className="mt-[0.15em] h-[1.1em] w-[1.1em] shrink-0 accent-[hsl(var(--primary))]"
            />}
            <span>
              {pickText(el.text, locale)}
              {el.privacyLink && <>{" "}{interactive
                ? <a href={privacyHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">{privacyLabel}</a>
                : <span className="underline underline-offset-2">{privacyLabel}</span>}</>}
            </span>
          </label>
          {err && site && <p role="alert" className="absolute left-1 top-full z-10 mt-0.5 rounded-md bg-destructive px-2 py-0.5 text-[11px] font-medium text-destructive-foreground">{site.errorText(err)}</p>}
        </div>
      );
      break;
    }
    case "button": {
      const bgc = el.bg || "hsl(var(--primary))";
      const fg = el.color || (el.variant === "solid" ? "hsl(var(--primary-foreground))" : el.bg || "hsl(var(--primary))");
      const btnStyle: CSSProperties = {
        height: el.height, fontSize: el.size, fontWeight: el.weight, borderRadius: el.radius, textTransform: el.upper ? "uppercase" : undefined,
        background: el.variant === "solid" ? bgc : "transparent",
        color: fg,
        border: el.variant === "outline" ? `2px solid ${bgc}` : "none",
        textDecoration: el.variant === "text" ? "underline" : undefined,
        textUnderlineOffset: el.variant === "text" ? 3 : undefined,
      };
      const label = el.action === "submit" && site?.submitting ? site.sendingText : pickText(el.text, locale);
      const cls = cn(
        "flex w-full items-center justify-center px-4 text-center leading-tight transition-[transform,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        interactive ? "hover:brightness-95 active:scale-[0.98]" : "pointer-events-none",
      );
      if (!interactive) {
        inner = <div className={cls} style={btnStyle}>{label}</div>;
      } else if (el.action === "link") {
        inner = <a href={el.href} target={el.newTab ? "_blank" : undefined} rel={el.newTab ? "noreferrer" : undefined} onClick={() => site?.onClose()} className={cls} style={btnStyle}>{label}</a>;
      } else {
        inner = (
          <button
            type={el.action === "submit" ? "submit" : "button"}
            disabled={el.action === "submit" && site?.submitting}
            onClick={el.action === "close" ? site?.onClose : undefined}
            className={cls}
            style={btnStyle}
          >
            {label}
          </button>
        );
      }
      break;
    }
    case "coupon": {
      const code = site?.coupon ?? previewCoupon ?? "";
      inner = (
        <div className="flex flex-col items-center gap-1 border-2 border-dashed px-4 py-3 text-center" style={{
          background: el.bg || "hsl(var(--accent))", color: el.color || "hsl(var(--foreground))", borderColor: el.borderColor || "hsl(var(--primary))", borderRadius: el.radius,
        }}>
          <span className="text-xs font-semibold uppercase tracking-wider opacity-75">{pickText(el.label, locale)}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono font-bold tracking-wide" style={{ fontSize: el.size }}>{code}</span>
            {code && (interactive ? (
              <button type="button" onClick={site?.onCopy} className="inline-flex items-center gap-1 rounded-lg border border-current px-2 py-1 text-xs font-semibold">
                {site?.copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {pickText(el.copyText, locale)}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-current px-2 py-1 text-xs font-semibold">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />{pickText(el.copyText, locale)}
              </span>
            ))}
          </span>
        </div>
      );
      break;
    }
  }

  if (mode !== "edit") return <div style={style}>{inner}</div>;

  const handle = (h: Handle, cls: string) => (
    <span
      key={h}
      data-handle={h}
      onPointerDown={(e) => { e.stopPropagation(); edit?.onPointerDown(e, el.id, h); }}
      className={cn("absolute z-30 rounded-full border-2 border-white bg-sky-500 shadow", cls)}
    />
  );
  return (
    <div
      data-el={el.id}
      style={{ ...style, touchAction: "none" }}
      onPointerDown={(e) => { e.stopPropagation(); edit?.onPointerDown(e, el.id, "move"); }}
      className={cn(
        "cursor-move select-none",
        hiddenHere && "opacity-30",
        selected ? "z-20 outline outline-2 outline-offset-2 outline-sky-500" : "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-sky-400/70",
      )}
    >
      {inner}
      {selected && (
        <>
          {handle("w", "-left-[9px] top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize")}
          {handle("e", "-right-[9px] top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize")}
          {withH && handle("s", "-bottom-[9px] left-1/2 h-4 w-4 -translate-x-1/2 cursor-ns-resize")}
          {withH && handle("se", "-bottom-[9px] -right-[9px] h-4 w-4 cursor-nwse-resize")}
        </>
      )}
    </div>
  );
}

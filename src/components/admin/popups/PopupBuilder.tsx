// =====================================================================================
// Área de desenho do construtor de pop-ups (Admin > Pop-ups > pop-up > Desenho).
//   Barra       computador ou celular, formulário ou depois de enviar, editar ou ver na tela, idioma dos textos,
//               desfazer e refazer, arrumar o celular sozinho ou copiar do computador
//   Área        o pop-up no tamanho real (reduzido quando não cabe); arrastar move, as alças mudam a largura e a
//               altura; encaixa no centro, nas bordas e nos outros elementos (linhas azuis; Alt arrasta solto).
//               Teclado: setas movem (Shift = 5%), Delete apaga, Ctrl+D duplica, Ctrl+Z / Ctrl+Y, Esc tira a seleção.
//   Ver na tela a página da loja de mentira com o fundo escurecido e o pop-up no lugar escolhido.
// =====================================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eye, Gift, MousePointer2, Monitor, Redo2, Smartphone, Undo2, Wand2, Copy as CopyIcon } from "lucide-react";
import PopupCanvas, { rgba, type Handle } from "@/components/popups/PopupCanvas";
import { Segmented, type PT } from "./fields";
import { LOCALE_NAMES } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  copyDesktopToMobile, fitScale, pickText, POPUP_LOCALES, stackForMobile, type Box, type Device, type PopupContent, type PopupElement,
  type PopupLocale, type StepId,
} from "@/lib/leadPopups";
import { cn } from "@/lib/utils";

export type SetContent = (fn: (c: PopupContent) => PopupContent, opts?: { checkpoint?: boolean }) => void;

type Rect = { l: number; c: number; r: number; t: number; m: number; b: number };
type DragState = { id: string; handle: Handle; sx: number; sy: number; box: Box; hPct: number; others: Rect[]; moved: boolean; ratio: number };

const SNAP = 1.2;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function updateElement(c: PopupContent, step: StepId, id: string, fn: (e: PopupElement) => PopupElement): PopupContent {
  return { ...c, [step]: { ...c[step], elements: c[step].elements.map((e) => (e.id === id ? fn(e) : e)) } };
}

export default function PopupBuilder({
  t, content, setContent, device, setDevice, step, setStep, selected, setSelected, locale, setLocale, undo, redo, canUndo, canRedo,
  onDelete, onDuplicate, previewCoupon, onEditText,
}: {
  t: PT;
  content: PopupContent;
  setContent: SetContent;
  device: Device;
  setDevice: (d: Device) => void;
  step: StepId;
  setStep: (s: StepId) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  locale: PopupLocale;
  setLocale: (l: PopupLocale) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  previewCoupon: string;
  onEditText: (id: string) => void;
}) {
  const [view, setView] = useState<"edit" | "screen">("edit");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(800);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] } | null>(null);
  const drag = useRef<DragState | null>(null);
  const size = content.size[device];

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zoom = Math.min(1, Math.max(0.25, (stageW - 40) / size.w));

  /** Retângulos dos elementos em % da área (medidos no ecrã, valem para os de altura automática). */
  const measure = useCallback((): Map<string, Rect> => {
    const out = new Map<string, Rect>();
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-canvas-root]");
    if (!root) return out;
    const cr = root.getBoundingClientRect();
    root.querySelectorAll<HTMLElement>("[data-el]").forEach((n) => {
      const r = n.getBoundingClientRect();
      const l = ((r.left - cr.left) / cr.width) * 100, w = (r.width / cr.width) * 100;
      const tp = ((r.top - cr.top) / cr.height) * 100, h = (r.height / cr.height) * 100;
      out.set(n.dataset.el as string, { l, c: l + w / 2, r: l + w, t: tp, m: tp + h / 2, b: tp + h });
    });
    return out;
  }, []);

  const onMove = useCallback((ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((ev.clientX - d.sx) / (size.w * zoom)) * 100;
    const dy = ((ev.clientY - d.sy) / (size.h * zoom)) * 100;
    if (!d.moved) {
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return;
      d.moved = true;
      setContent((c) => c, { checkpoint: true });
    }
    const free = ev.altKey;
    const gx: number[] = [];
    const gy: number[] = [];
    const xs = [0, 50, 100, ...d.others.flatMap((o) => [o.l, o.c, o.r])];
    const ys = [0, 50, 100, ...d.others.flatMap((o) => [o.t, o.m, o.b])];
    const snap = (vals: number[], targets: number[], g: number[]) => {
      if (free) return 0;
      let best = SNAP + 1, shift = 0, at = 0;
      for (const v of vals) for (const tg of targets) {
        const diff = tg - v;
        if (Math.abs(diff) < Math.abs(best)) { best = diff; shift = diff; at = tg; }
      }
      if (Math.abs(best) <= SNAP) { g.push(at); return shift; }
      return 0;
    };
    const b = { ...d.box };
    if (d.handle === "move") {
      let x = d.box.x + dx, y = d.box.y + dy;
      x += snap([x, x + b.w / 2, x + b.w], xs, gx);
      y += snap([y, y + d.hPct / 2, y + d.hPct], ys, gy);
      b.x = r1(Math.min(100, Math.max(-20, x)));
      b.y = r1(Math.min(100, Math.max(-20, y)));
    } else {
      if (d.handle === "e" || d.handle === "se") {
        let right = d.box.x + d.box.w + dx;
        right += snap([right], xs, gx);
        b.w = r1(Math.max(4, Math.min(100 - b.x + 20, right - b.x)));
      }
      if (d.handle === "w") {
        let left = d.box.x + dx;
        left += snap([left], xs, gx);
        left = Math.min(left, d.box.x + d.box.w - 4);
        b.x = r1(left);
        b.w = r1(d.box.x + d.box.w - left);
      }
      if (d.handle === "s" || d.handle === "se") {
        if (d.handle === "se" && ev.shiftKey) b.h = r1(Math.max(2, b.w * d.ratio));
        else {
          let bottom = d.box.y + (d.box.h ?? 10) + dy;
          bottom += snap([bottom], ys, gy);
          b.h = r1(Math.max(2, bottom - d.box.y));
        }
      }
    }
    setGuides({ x: gx, y: gy });
    setContent((c) => updateElement(c, step, d.id, (e) => ({ ...e, [device]: b })), { checkpoint: false });
  }, [size.w, size.h, zoom, setContent, step, device]);

  const onUp = useCallback(() => {
    drag.current = null;
    setGuides(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }, [onMove]);

  useEffect(() => onUp, [onUp]);

  const onPointerDown = (e: ReactPointerEvent, id: string, handle: Handle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSelected(id);
    const el = content[step].elements.find((x) => x.id === id);
    if (!el) return;
    const rects = measure();
    const mine = rects.get(id);
    const others = [...rects.entries()].filter(([k]) => k !== id).map(([, r]) => r);
    const box = el[device];
    drag.current = {
      id, handle, sx: e.clientX, sy: e.clientY, box: { ...box }, hPct: mine ? mine.b - mine.t : box.h ?? 8, others, moved: false,
      ratio: box.h && box.w ? box.h / box.w : 1,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Teclado (fora de campos de texto).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.closest("input, textarea, select, [contenteditable=true], [role=combobox], [role=slider]"))) return;
      if (!stageRef.current?.closest("[data-popup-editor]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (!selected) return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); onDuplicate(selected); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDelete(selected); return; }
      if (e.key === "Escape") { setSelected(null); return; }
      const stepPct = e.shiftKey ? 5 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-stepPct, 0], ArrowRight: [stepPct, 0], ArrowUp: [0, -stepPct], ArrowDown: [0, stepPct] };
      const m = mv[e.key];
      if (!m) return;
      e.preventDefault();
      setContent((c) => updateElement(c, step, selected, (el) => ({ ...el, [device]: { ...el[device], x: r1(el[device].x + m[0]), y: r1(el[device].y + m[1]) } })), { checkpoint: true });
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [selected, step, device, setContent, undo, redo, onDelete, onDuplicate, setSelected]);

  const els = content[step].elements;
  const hiddenHere = els.filter((e) => e.hidden[device]).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2">
        <Segmented<Device> size="sm" label={t("device")} value={device} onChange={setDevice} options={[
          { value: "desktop", label: t("device_desktop"), icon: Monitor },
          { value: "mobile", label: t("device_mobile"), icon: Smartphone },
        ]} />
        <Segmented<StepId> size="sm" label={t("step")} value={step} onChange={(s) => { setStep(s); setSelected(null); }} options={[
          { value: "form", label: t("step_form") },
          { value: "success", label: t("step_success") },
        ]} />
        <Segmented<"edit" | "screen"> size="sm" label={t("view")} value={view} onChange={setView} options={[
          { value: "edit", label: t("view_edit"), icon: MousePointer2 },
          { value: "screen", label: t("view_screen"), icon: Eye },
        ]} />
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={locale} onValueChange={(v) => setLocale(v as PopupLocale)}>
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={t("texts_locale")} title={t("texts_locale_tip")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPUP_LOCALES.map((l) => <SelectItem key={l} value={l}>{LOCALE_NAMES[l]}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={undo} disabled={!canUndo} title={t("undo")} aria-label={t("undo")} className="grid h-8 w-8 place-items-center rounded-lg border text-foreground hover:bg-muted disabled:opacity-35"><Undo2 className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title={t("redo")} aria-label={t("redo")} className="grid h-8 w-8 place-items-center rounded-lg border text-foreground hover:bg-muted disabled:opacity-35"><Redo2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      {device === "mobile" && view === "edit" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-accent/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">{t("mobile_note")}</span>
          <button type="button" onClick={() => setContent((c) => stackForMobile(c, step, step === "form"), { checkpoint: true })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-card px-2.5 font-semibold text-foreground shadow-sm hover:bg-muted" title={t("mobile_stack_tip")}>
            <Wand2 className="h-3.5 w-3.5 text-brand-orange-text" aria-hidden="true" />{t("mobile_stack")}
          </button>
          <button type="button" onClick={() => setContent((c) => copyDesktopToMobile(c, step), { checkpoint: true })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-card px-2.5 font-semibold text-foreground shadow-sm hover:bg-muted" title={t("mobile_copy_tip")}>
            <CopyIcon className="h-3.5 w-3.5 text-brand-orange-text" aria-hidden="true" />{t("mobile_copy")}
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        data-stage
        className="relative overflow-hidden rounded-[20px] border bg-[length:20px_20px] p-5"
        style={{ backgroundColor: "hsl(var(--muted) / 0.55)", backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)" }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
      >
        {view === "edit" ? (
          <>
            <div className="flex justify-center" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
              <div ref={canvasRef} style={{ width: size.w * zoom, height: size.h * zoom }}>
                <div data-canvas-root style={{ width: size.w, height: size.h, transform: zoom < 1 ? `scale(${zoom})` : undefined, transformOrigin: "top left" }}
                  onDoubleClick={(e) => {
                    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-el]")?.dataset.el;
                    if (id) onEditText(id);
                  }}>
                  <PopupCanvas
                    content={content}
                    step={step}
                    device={device}
                    locale={locale}
                    mode="edit"
                    previewCoupon={previewCoupon}
                    closeLabel={t("close_btn")}
                    privacyLabel={t("privacy_link_text")}
                    edit={{ selected, onPointerDown, onCanvasPointerDown: (e) => { if (!(e.target as HTMLElement).closest("[data-el]")) setSelected(null); }, guides: guides ?? undefined }}
                  />
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {t("stage_info", { w: size.w, h: size.h, z: Math.round(zoom * 100) })}
              {hiddenHere > 0 && <> · {t("stage_hidden", { n: hiddenHere })}</>}
            </p>
          </>
        ) : (
          <ScreenPreview t={t} content={content} device={device} step={step} locale={locale} stageW={stageW - 40} previewCoupon={previewCoupon} />
        )}
      </div>
      {view === "edit" && <p className="text-xs text-muted-foreground">{t("stage_keys")}</p>}
    </div>
  );
}

/** A loja de mentira com o pop-up no lugar e do tamanho que vai ter. */
function ScreenPreview({ t, content, device, step, locale, stageW, previewCoupon }: {
  t: PT; content: PopupContent; device: Device; step: StepId; locale: PopupLocale; stageW: number; previewCoupon: string;
}) {
  const frame = device === "desktop" ? { w: 1280, h: 760 } : { w: 390, h: 780 };
  const s = Math.min(1, stageW / frame.w, device === "mobile" ? 1 : 2);
  const size = content.size[device];
  const pos = content.position[device];
  const bottomGap = device === "mobile" ? 72 : 24;
  const k = fitScale(size, frame.w, frame.h - (pos === "center" ? 0 : bottomGap), pos === "bottom" && device === "mobile" ? 16 : 32);
  const place: Record<string, string> = {
    center: "items-center justify-center", "bottom-right": "items-end justify-end", "bottom-left": "items-end justify-start",
    bottom: "items-end justify-center", top: "items-start justify-center",
  };
  const teaser = content.teaser;
  return (
    <div className="flex justify-center">
      <div style={{ width: frame.w * s, height: frame.h * s }}>
        <div
          className={cn("relative overflow-hidden border bg-background shadow-sm", device === "mobile" ? "rounded-[36px] border-[6px] border-foreground/85" : "rounded-xl")}
          style={{ width: frame.w, height: frame.h, transform: `scale(${s})`, transformOrigin: "top left" }}
          aria-label={t("view_screen")}
        >
          {/* página de mentira */}
          <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
            <div className="flex h-16 items-center gap-4 border-b bg-card px-6">
              <div className="h-7 w-28 rounded-lg bg-primary/80" />
              <div className="h-9 flex-1 rounded-xl bg-muted" />
              <div className="h-7 w-16 rounded-lg bg-muted" />
            </div>
            <div className="grid gap-4 p-6" style={{ gridTemplateColumns: device === "desktop" ? "1.1fr 1fr" : "1fr" }}>
              <div className="space-y-3">
                <div className="h-3 w-32 rounded bg-primary/40" />
                <div className="h-10 w-4/5 rounded-lg bg-foreground/15" />
                <div className="h-10 w-3/5 rounded-lg bg-foreground/15" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-5/6 rounded bg-muted" />
                <div className="flex gap-3 pt-2"><div className="h-11 w-36 rounded-xl bg-primary/80" /><div className="h-11 w-44 rounded-xl border bg-card" /></div>
              </div>
              <div className="h-64 rounded-3xl bg-muted" />
            </div>
            <div className="grid gap-4 px-6" style={{ gridTemplateColumns: `repeat(${device === "desktop" ? 4 : 2}, 1fr)` }}>
              {Array.from({ length: device === "desktop" ? 4 : 2 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-muted" />)}
            </div>
          </div>
          {content.backdrop.show && <div className={cn("absolute inset-0", content.backdrop.blur && "backdrop-blur-[3px]")} style={{ background: rgba(content.backdrop.color, content.backdrop.opacity) }} />}
          <div className={cn("absolute inset-0 flex", place[pos])} style={{
            padding: pos === "center" ? 12 : undefined, paddingBottom: pos.startsWith("bottom") ? bottomGap : undefined, paddingTop: pos === "top" ? 16 : undefined,
            paddingLeft: pos === "bottom-left" ? 20 : undefined, paddingRight: pos === "bottom-right" ? 20 : undefined,
          }}>
            <div style={{ width: size.w * k, height: size.h * k }}>
              <div style={{ width: size.w, height: size.h, transform: k < 1 ? `scale(${k})` : undefined, transformOrigin: "top left" }}>
                <PopupCanvas content={content} step={step} device={device} locale={locale} mode="thumb" previewCoupon={previewCoupon}
                  closeLabel={t("close_btn")} privacyLabel={t("privacy_link_text")} className="pointer-events-none" />
              </div>
            </div>
          </div>
          {teaser.enabled && (
            <div className={cn("absolute top-1/2 flex -translate-y-1/2 items-center gap-2 px-2.5 py-4 text-sm font-semibold opacity-60 [writing-mode:vertical-rl]",
              teaser.side === "left" ? "left-0 rotate-180 rounded-l-xl" : "right-0 rounded-l-xl")}
              style={{ background: teaser.bg || "hsl(var(--primary))", color: teaser.color || "hsl(var(--primary-foreground))" }}>
              <Gift className="h-4 w-4" aria-hidden="true" />{pickText(teaser.text, locale)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

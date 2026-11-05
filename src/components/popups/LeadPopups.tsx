// =====================================================================================
// Pop-ups de captação na loja (recurso lead_popups). Montado uma vez no App.
//   Escolha    pop-ups ativos de site_popups; o primeiro (por prioridade) que as regras deixam nesta página,
//              aparelho, público, país, idioma e frequência (popupBlocked em src/lib/leadPopups.ts)
//   Gatilho    logo, depois de N segundos na loja, ao rolar X% da página, ou ao levar o mouse para fora da
//              janela (no celular, que não tem mouse, vale o tempo). Por padrão espera o aviso de cookies.
//   Memória    o que já apareceu, foi fechado ou enviado: na aba (sessionStorage "loja3d-popups", essencial) e,
//              com consentimento de Preferências, no aparelho (localStorage "loja3d-popups")
//   Teste      ?popup_preview=<id> mostra qualquer pop-up a um administrador, já, sem contar nem gravar
// =====================================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Gift, X } from "lucide-react";
import PopupCanvas, { type SiteBindings } from "./PopupCanvas";
import { useMessages, useLocale } from "@/i18n";
import { popupsMessages } from "@/i18n/popups";
import { useAuth } from "@/hooks/useAuth";
import { useCountry } from "@/lib/countries";
import { getConsent, hasConsent, onConsentChange } from "@/lib/consent";
import { popupErrorCode, popupSeen, useSitePopups, useSubmitPopupLead } from "@/hooks/useLeadPopups";
import {
  choosePopup, fitScale, formFields, leadErrors, pickText, PREVIEW_PARAM, type Device, type LeadError, type LeadValues, type PopupMemory,
  type SitePopup, type StepId,
} from "@/lib/leadPopups";
import { rgba } from "./PopupCanvas";
import { cn } from "@/lib/utils";

export const POPUP_STORAGE_KEY = "loja3d-popups";
type Store = { mem: Record<string, PopupMemory>; tab: string[]; teaserOff: string[] };

const arrivedAt = Date.now();

function readJson(storage: Storage | undefined, key: string): Partial<Store> | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<Store>) : null;
  } catch {
    return null;
  }
}

function loadStore(): Store {
  const tab = readJson(typeof sessionStorage !== "undefined" ? sessionStorage : undefined, POPUP_STORAGE_KEY) ?? {};
  const dev = hasConsent("preferences") ? readJson(typeof localStorage !== "undefined" ? localStorage : undefined, POPUP_STORAGE_KEY) ?? {} : {};
  const mem: Record<string, PopupMemory> = { ...(dev.mem ?? {}) };
  for (const [id, m] of Object.entries(tab.mem ?? {})) {
    const d = mem[id] ?? {};
    mem[id] = { seen: Math.max(d.seen ?? 0, m.seen ?? 0) || undefined, closed: Math.max(d.closed ?? 0, m.closed ?? 0) || undefined, submitted: Math.max(d.submitted ?? 0, m.submitted ?? 0) || undefined };
  }
  return { mem, tab: Array.isArray(tab.tab) ? tab.tab : [], teaserOff: Array.isArray(tab.teaserOff) ? tab.teaserOff : [] };
}

function saveStore(s: Store) {
  try { sessionStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify(s)); } catch { /* armazenamento bloqueado */ }
  try { if (hasConsent("preferences")) localStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify({ mem: s.mem })); } catch { /* idem */ }
}

function useDevice(): Device {
  const q = "(max-width: 767px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMobile(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return mobile ? "mobile" : "desktop";
}

function useViewport() {
  const [v, setV] = useState(() => ({ w: typeof window !== "undefined" ? window.innerWidth : 1280, h: typeof window !== "undefined" ? window.innerHeight : 800 }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export default function LeadPopups() {
  const { t } = useMessages(popupsMessages);
  const locale = useLocale((s) => s.locale);
  const { pathname, search } = useLocation();
  const [preview] = useState(() => new URLSearchParams(window.location.search).get(PREVIEW_PARAM));
  const { data: popups = [] } = useSitePopups(preview);
  const { user, loading: authLoading } = useAuth();
  const country = useCountry();
  const device = useDevice();
  const viewport = useViewport();
  const submit = useSubmitPopupLead();
  const [store, setStore] = useState<Store>(loadStore);
  const [consentReady, setConsentReady] = useState(() => !!getConsent());
  const [active, setActive] = useState<SitePopup | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>("form");
  const [teaser, setTeaser] = useState<SitePopup | null>(null);
  const [values, setValues] = useState<LeadValues>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<SiteBindings["errors"]>({});
  const [coupon, setCoupon] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [closeVisible, setCloseVisible] = useState(true);
  // Um pop-up por página vista: depois de fechar, o próximo só numa outra página.
  const [shownPath, setShownPath] = useState<string | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => onConsentChange((c) => { setConsentReady(!!c); setStore(loadStore()); }), []);
  const update = useCallback((fn: (s: Store) => Store) => setStore((s) => { const n = fn(s); saveStore(n); return n; }), []);

  // Escolhe o pop-up desta página (só quando nenhum está aberto).
  const candidate = useMemo(() => {
    if (!popups.length || authLoading) return null;
    if (preview) return popups[0] ?? null;
    return choosePopup(popups, (p) => ({
      path: pathname, device, loggedIn: !!user, country: country?.code ?? null, locale, now: Date.now(),
      seenThisSession: store.tab.includes(p.id), memory: store.mem[p.id],
    }));
  }, [popups, authLoading, preview, pathname, device, user, country?.code, locale, store]);

  const show = useCallback((p: SitePopup) => {
    lastFocus.current = document.activeElement as HTMLElement | null;
    setActive(p);
    setShownPath(window.location.pathname);
    setStep("form");
    setErrors({});
    setCoupon(null);
    setCopied(false);
    setTeaser(null);
    setOpen(true);
    const delay = p.content.close.delay;
    setCloseVisible(delay <= 0);
    if (delay > 0) window.setTimeout(() => setCloseVisible(true), delay * 1000);
    if (!preview) {
      popupSeen(p.id);
      update((s) => ({ ...s, tab: [...new Set([...s.tab, p.id])], mem: { ...s.mem, [p.id]: { ...s.mem[p.id], seen: Date.now() } } }));
    }
  }, [preview, update]);

  // Gatilho do candidato.
  useEffect(() => {
    if (open || !candidate || shownPath === pathname) return;
    const r = candidate.rules;
    if (!preview && r.waitConsent && !consentReady) return;
    if (preview) { show(candidate); return; }
    let done = false;
    const fire = () => { if (!done) { done = true; show(candidate); } };
    const timers: number[] = [];
    const offs: (() => void)[] = [];
    const after = (ms: number) => timers.push(window.setTimeout(fire, Math.max(0, ms)));
    const trigger = r.trigger === "exit" && device === "mobile" ? "delay" : r.trigger;
    if (trigger === "immediate") after(400);
    else if (trigger === "delay") after(r.delay * 1000 - (Date.now() - arrivedAt));
    else if (trigger === "scroll") {
      const check = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 40 || (window.scrollY / max) * 100 >= r.scroll) fire();
      };
      window.addEventListener("scroll", check, { passive: true });
      offs.push(() => window.removeEventListener("scroll", check));
      timers.push(window.setTimeout(check, 1500));
    } else if (trigger === "exit") {
      const out = (e: MouseEvent) => { if (!e.relatedTarget && e.clientY <= 4) fire(); };
      document.addEventListener("mouseout", out);
      offs.push(() => document.removeEventListener("mouseout", out));
    }
    return () => { done = true; timers.forEach((x) => clearTimeout(x)); offs.forEach((f) => f()); };
  }, [candidate, open, consentReady, device, preview, show, shownPath, pathname]);

  const close = useCallback(() => {
    if (!active) return;
    setOpen(false);
    if (!preview) update((s) => ({ ...s, mem: { ...s.mem, [active.id]: { ...s.mem[active.id], closed: Date.now() } } }));
    if (active.content.teaser.enabled && step === "form" && !store.teaserOff.includes(active.id)) setTeaser(active);
    window.setTimeout(() => lastFocus.current?.focus?.(), 50);
  }, [active, preview, update, step, store.teaserOff]);

  // Escape fecha; foco no primeiro campo ao abrir.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && closeVisible) close(); };
    document.addEventListener("keydown", key);
    const f = window.setTimeout(() => {
      const el = boxRef.current?.querySelector<HTMLElement>("input, button, a[href]");
      el?.focus({ preventScroll: true });
    }, 250);
    return () => { document.removeEventListener("keydown", key); clearTimeout(f); };
  }, [open, close, closeVisible]);

  // Fecha sozinho depois de enviar, se o pop-up pedir.
  useEffect(() => {
    if (!open || step !== "success" || !active?.content.successAutoClose) return;
    const x = window.setTimeout(close, active.content.successAutoClose * 1000);
    return () => clearTimeout(x);
  }, [open, step, active, close]);

  // Troca de página com o pop-up aberto numa página onde ele já não vale: fecha sem marcar.
  useEffect(() => { if (open && !preview && pathname.startsWith("/admin")) setOpen(false); }, [pathname, open, preview]);

  const onSubmit = async () => {
    if (!active || submit.isPending) return;
    const errs = leadErrors(active.content, values, consent);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const done = (code: string | null) => {
      setCoupon(code);
      if (!preview) update((s) => ({ ...s, mem: { ...s.mem, [active.id]: { ...s.mem[active.id], submitted: Date.now() } } }));
      if (active.content.success.elements.length) setStep("success");
      else close();
    };
    if (preview) { done(t("preview_coupon")); return; }
    try {
      const res = await submit.mutateAsync({
        popupId: active.id, values, consent, locale, country: country?.code ?? null, path: `${pathname}${search}`.slice(0, 300),
      });
      done(res.coupon ?? null);
    } catch (e) {
      const code = popupErrorCode(e);
      const m = code.match(/^invalid:([a-z0-9_]+):([a-z_]+)$/);
      if (m) {
        const field = formFields(active.content).find((f) => (f.field === "custom" ? f.key : f.field) === m[1]);
        setErrors({ [field?.id ?? "_form"]: m[2] as LeadError });
      } else if (code === "consent") {
        const c = active.content.form.elements.find((x) => x.type === "consent");
        setErrors({ [c?.id ?? "_form"]: "consent" });
      } else if (code === "empty") setErrors({ _form: "empty" });
      else if (code === "rate_limited") setErrors({ _form: "rate" });
      else if (code === "not_found" || code === "feature_off") setErrors({ _form: "closed" });
      else setErrors({ _form: "generic" });
    }
  };

  const errorText = (code: string) => t(({
    required: "err_required", email: "err_email", phone: "err_phone", consent: "err_consent", empty: "err_empty", too_long: "err_too_long",
    rate: "err_rate", closed: "err_closed",
  } as Record<string, Parameters<typeof t>[0]>)[code] ?? "err_generic");

  const onCopy = async () => {
    if (!coupon) return;
    try { await navigator.clipboard.writeText(coupon); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* sem área de transferência */ }
  };

  const c = active?.content;
  const pos = c ? c.position[device] : "center";
  const size = c ? c.size[device] : { w: 0, h: 0 };
  const bottomGap = device === "mobile" ? 72 : 24;
  const k = c ? fitScale(size, viewport.w, viewport.h - (pos === "center" ? 0 : bottomGap), pos === "bottom" && device === "mobile" ? 16 : 32) : 1;
  const variants = {
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
    zoom: { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 } },
    slide: { initial: { opacity: 0, y: pos === "top" ? -24 : 24 }, animate: { opacity: 1, y: 0 } },
    none: { initial: { opacity: 1 }, animate: { opacity: 1 } },
  }[c?.animation ?? "fade"];
  const place: Record<string, string> = {
    center: "items-center justify-center",
    "bottom-right": "items-end justify-end",
    "bottom-left": "items-end justify-start",
    bottom: "items-end justify-center",
    top: "items-start justify-center",
  };
  const titleId = "lead-popup-title";

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && c && active && (
          <motion.div
            key={active.id}
            className={cn("fixed inset-0 z-[65] flex", place[pos], !c.backdrop.show && "pointer-events-none")}
            style={{ padding: pos === "center" ? 12 : undefined, paddingBottom: pos.startsWith("bottom") ? bottomGap : undefined, paddingTop: pos === "top" ? 16 : undefined, paddingLeft: pos === "bottom-left" ? 20 : undefined, paddingRight: pos === "bottom-right" ? 20 : undefined }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {c.backdrop.show && (
              <div
                aria-hidden="true"
                className={cn("absolute inset-0", c.backdrop.blur && "backdrop-blur-[3px]")}
                style={{ background: rgba(c.backdrop.color, c.backdrop.opacity) }}
                onClick={c.backdrop.closeOnClick && closeVisible ? close : undefined}
              />
            )}
            <motion.div
              ref={boxRef}
              role="dialog"
              aria-modal={c.backdrop.show || undefined}
              aria-label={c[step].elements.some((e) => e.type === "text") ? undefined : t("dialog")}
              aria-labelledby={c[step].elements.some((e) => e.type === "text") ? titleId : undefined}
              className="pointer-events-auto relative"
              style={{ width: size.w * k, height: size.h * k }}
              initial={variants.initial}
              animate={variants.animate}
              exit={variants.initial}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {preview && <p className="absolute -top-9 left-0 right-0 mx-auto w-max max-w-[92vw] rounded-full bg-foreground px-3 py-1.5 text-center text-xs font-semibold text-background">{t("preview_badge")}</p>}
              <div style={{ transform: k < 1 ? `scale(${k})` : undefined, transformOrigin: "top left", width: size.w, height: size.h }}>
                <PopupCanvas
                  content={c}
                  step={step}
                  device={device}
                  locale={locale}
                  mode="site"
                  titleId={titleId}
                  closeLabel={t("close")}
                  privacyLabel={t("privacy")}
                  site={{
                    values,
                    setValue: (field, key, v) => {
                      setValues((o) => (field === "custom" ? { ...o, extra: { ...o.extra, [key]: v } } : { ...o, [field]: v }));
                      setErrors({});
                    },
                    consent,
                    setConsent: (v) => { setConsent(v); setErrors({}); },
                    errors,
                    errorText,
                    submitting: submit.isPending,
                    sendingText: t("sending"),
                    coupon,
                    copied,
                    onCopy,
                    onSubmit,
                    onClose: close,
                    closeVisible,
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!open && teaser && (
          <motion.div
            key="teaser"
            className={cn("fixed top-1/2 z-[45] flex -translate-y-1/2 items-center", teaser.content.teaser.side === "left" ? "left-0" : "right-0")}
            initial={{ opacity: 0, x: teaser.content.teaser.side === "left" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              onClick={() => show(teaser)}
              aria-label={`${t("reopen")}: ${pickText(teaser.content.teaser.text, locale)}`}
              className={cn(
                "flex items-center gap-2 px-2.5 py-4 text-sm font-semibold shadow-[0_10px_30px_-12px_rgba(23,23,23,0.45)] transition-transform duration-150 [writing-mode:vertical-rl] hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                teaser.content.teaser.side === "left" ? "rotate-180 rounded-l-xl" : "rounded-l-xl",
              )}
              style={{ background: teaser.content.teaser.bg || "hsl(var(--primary))", color: teaser.content.teaser.color || "hsl(var(--primary-foreground))" }}
            >
              <Gift className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {pickText(teaser.content.teaser.text, locale)}
            </button>
            <button
              type="button"
              onClick={() => { update((s) => ({ ...s, teaserOff: [...new Set([...s.teaserOff, teaser.id])] })); setTeaser(null); }}
              aria-label={t("hide_teaser")}
              title={t("hide_teaser")}
              className={cn("absolute -top-3 grid h-6 w-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground", teaser.content.teaser.side === "left" ? "-right-3" : "-left-3")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

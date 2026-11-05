// =====================================================================================
// Campo de leitura de código de barras do Admin (Entradas e conferência, Etiquetas).
// Leitor USB = teclado: digita o código e aperta Enter. O campo procura nas peças já carregadas (findUnitByCode),
// sem ida ao servidor, por isso dá para ler um código atrás do outro. Sem código igual, procura pelo nome;
// várias peças = lista para escolher (na página, sem janela). Câmera do celular quando o navegador tem
// BarcodeDetector (Chrome no Android), num painel na própria página.
// =====================================================================================
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanBarcode, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HelpTip from "../HelpTip";
import { InlinePanel } from "../shell/AdminPageParts";
import { useMessages } from "@/i18n";
import { adminBarcodeStockMessages } from "@/i18n/adminBarcodeStock";
import { findUnitByCode, searchUnits, type StockUnit } from "@/lib/productLabels";
import { cleanScan } from "@/lib/stockEntries";
import { cn } from "@/lib/utils";

/** Bipe curto (ok) ou grave (não achou), sem ficheiros de som. */
function beep(ok: boolean) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 1320 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => ctx.close();
  } catch {
    // sem áudio: segue sem som
  }
}

const hasDetector = () => typeof window !== "undefined" && "BarcodeDetector" in window;

function CameraPanel({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useMessages(adminBarcodeStockMessages);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!open) return;
    if (!hasDetector()) { setError(t("camera_unsupported")); return; }
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let last = "";
    let lastAt = 0;
    let stopped = false;
    setError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const value = found?.[0]?.rawValue as string | undefined;
            // O mesmo código seguido só conta de novo depois de 1,5 s (a câmera vê o código várias vezes por segundo).
            if (value && (value !== last || Date.now() - lastAt > 1500)) { last = value; lastAt = Date.now(); cb.current(value); }
          } catch {
            // quadro sem leitura: tenta no próximo
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError(t("camera_error"));
      }
    })();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, t]);

  return (
    <InlinePanel open={open} onClose={onClose} title={t("camera_title")} description={t("camera_hint")}>
      {error ? (
        <p className="rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : (
        <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-[14px] bg-foreground">
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
        </div>
      )}
    </InlinePanel>
  );
}

export default function ScanField({ units, loading, onUnit, placeholder, sound, onSound, autoFocus = true, className }: {
  units: StockUnit[] | undefined;
  loading?: boolean;
  onUnit: (u: StockUnit) => void;
  placeholder?: string;
  sound: boolean;
  onSound: (v: boolean) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useMessages(adminBarcodeStockMessages);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pick, setPick] = useState<{ q: string; list: StockUnit[] } | null>(null);
  const [camera, setCamera] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => { if (autoFocus && !loading) input.current?.focus(); }, [autoFocus, loading]);

  const accept = (u: StockUnit) => {
    onUnit(u);
    if (sound) beep(true);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
    setMsg({ tone: "ok", text: u.variant ? `${u.name} · ${u.variant}` : u.name });
    setPick(null);
    setValue("");
    input.current?.focus();
  };

  const submit = (raw: string) => {
    const code = cleanScan(raw);
    if (!code || !units) return;
    const hit = findUnitByCode(units, code);
    if (hit) { accept(hit); return; }
    const list = searchUnits(units, code, 12);
    if (list.length === 1) { accept(list[0]); return; }
    if (sound) beep(false);
    if (list.length > 1) { setPick({ q: code, list }); setMsg(null); return; }
    setPick(null);
    setMsg({ tone: "error", text: t("not_found", { code }) });
    input.current?.select();
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-1">
        <label htmlFor="scan-field" className="text-sm font-semibold">{t("scan_label")}</label>
        <HelpTip label={t("help")} text={t("scan_tip")} />
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); submit(value); }}>
        <div className="relative min-w-0 flex-1 basis-60">
          <ScanBarcode className={cn("pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors duration-200", flash ? "text-primary" : "text-muted-foreground")} strokeWidth={1.8} aria-hidden="true" />
          <Input
            id="scan-field"
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? t("scan_ph")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            disabled={loading}
            className={cn("h-12 pl-11 text-base transition-shadow duration-200", flash && "ring-2 ring-primary/60")}
          />
        </div>
        <Button type="submit" className="h-12" disabled={loading || !value.trim()}>
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{t("scan_go")}
        </Button>
        {hasDetector() && (
          <Button type="button" variant="outline" className="h-12" onClick={() => setCamera((v) => !v)} aria-expanded={camera}>
            <Camera className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("camera")}
          </Button>
        )}
        <Button type="button" variant="ghost" className="h-12 px-3" onClick={() => onSound(!sound)} aria-pressed={sound} title={t("sound_tip")}>
          {sound ? <Volume2 className="h-5 w-5" strokeWidth={1.8} /> : <VolumeX className="h-5 w-5" strokeWidth={1.8} />}
          <span className="ml-1.5 hidden text-sm sm:inline">{t("sound")}</span>
        </Button>
      </form>
      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("units_loading")}</p>}
      <p aria-live="polite" className={cn("min-h-5 text-sm", msg?.tone === "error" ? "text-destructive" : "text-emerald-700")}>{msg?.text}</p>
      {pick && (
        <div className="rounded-[14px] border bg-card">
          <p className="border-b px-3 py-2 text-sm font-semibold">{t("pick_title")} <span className="font-normal text-muted-foreground">{t("pick_hint", { q: pick.q })}</span></p>
          <ul className="max-h-72 divide-y overflow-auto">
            {pick.list.map((u) => (
              <li key={u.key}>
                <button type="button" onClick={() => accept(u)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">{[u.variant, u.sku ?? u.gtin].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{u.stock == null ? t("no_stock_control") : t("stock_now", { n: u.stock })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <CameraPanel open={camera} onClose={() => setCamera(false)} onCode={(c) => submit(c)} />
    </div>
  );
}

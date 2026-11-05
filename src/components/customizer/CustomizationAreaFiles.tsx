// Arquivos enviados por área de personalização (checkout, minhas compras e Admin). Textos em src/i18n/payments.ts,
// valores na moeda mostrada ao cliente e números e datas pelo idioma. `locale` força um idioma (ex.: Admin em pt-BR).
import { Download, FileImage, FileText } from "lucide-react";
import { verifyArtworkOriginal, type ArtworkMetadata } from "@/lib/artworkSizing";
import { toast } from "sonner";
import { DEFAULT_LOCALE, interpolate, useLocale, type Locale } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";
import { useCurrency } from "@/hooks/use-currency";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import { formatPrice } from "@/utils/currency";

export type CustomizationAreaFile = {
  areaId?: string;
  areaLabel?: string;
  fileDataUrl?: string;
  fileName?: string;
  originalFileName?: string;
  fileType?: string;
  widthCm?: number;
  heightCm?: number;
  notes?: string;
  technique?: string;
  materialName?: string;
  materialPriceAdjustment?: number;
  materialPricingMode?: "fixed" | "per_linear_meter";
  materialPricePerMeter?: number;
  materialCalculationDimension?: "width" | "height" | "longest_side";
  materialLengthCm?: number;
  addonPrice?: number;
  artwork?: ArtworkMetadata;
  quality?: { status: string; dpi: number | null; message: string };
  maxWidthCm?: number;
  maxHeightCm?: number;
  acceptedSizing?: string;
  acceptedQuality?: string;
  confirmedAt?: string;
};

type Props = {
  areas?: Record<string, CustomizationAreaFile> | null;
  compact?: boolean;
  /** idioma dos textos; sem ele, o idioma atual do site */
  locale?: Locale;
};

type MessageKey = keyof (typeof paymentsMessages)["pt-BR"];

export default function CustomizationAreaFiles({ areas, compact = false, locale: forcedLocale }: Props) {
  const uiLocale = useLocale((s) => s.locale);
  const locale = forcedLocale ?? uiLocale;
  const currentCurrency = useCurrency((s) => s.currentCurrency);
  const convert = useCurrency((s) => s.convert);
  // Nome do método como no carrinho e no personalizador (tabela print_methods, com a reserva de usePrintMethods).
  const { labels: methodLabels } = usePrintMethods();
  const files = Object.values(areas ?? {}).filter((area) => area.fileDataUrl || area.fileName);
  if (!files.length) return null;

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    interpolate(paymentsMessages[locale]?.[key] ?? paymentsMessages[DEFAULT_LOCALE][key], vars);
  const money = (v: number | undefined) => formatPrice(convert(Number(v) || 0), currentCurrency);
  const num = (n: number, digits = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  const cm = (n: number) => num(n, 2);
  const meters = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n);
  const dateTime = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(d);
  };

  return (
    <div className={compact ? "mt-2 space-y-2" : "mt-3 grid gap-2 sm:grid-cols-2"}>
      {files.map((area, index) => {
        const label = area.areaLabel || t("areaFallback", { n: index + 1 });
        const fileName = area.fileName || label;
        const isImage = !!area.fileDataUrl && area.fileType !== "application/pdf";
        return (
          <article key={area.areaId || `${label}-${index}`} className="flex min-w-0 gap-3 rounded-lg border bg-background p-2.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
              {isImage ? (
                <img src={area.fileDataUrl} alt={t("areaImageAlt", { area: label })} className="h-full w-full object-contain" />
              ) : area.fileType === "application/pdf" ? (
                <FileText className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileImage className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{fileName}</p>
              {Number.isFinite(area.widthCm) && Number.isFinite(area.heightCm) && (
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{t("areaSize", { width: cm(area.widthCm!), height: cm(area.heightCm!) })}</p>
              )}
              {area.technique && <p className="mt-0.5 text-[11px] text-muted-foreground">
                {[
                  t("areaMethod", { name: methodLabels[area.technique] ?? area.technique }),
                  area.materialName ? t("areaMaterial", { name: area.materialName }) : "",
                  Number.isFinite(area.addonPrice) ? t("areaExtra", { amount: money(area.addonPrice) }) : "",
                ].filter(Boolean).join(" · ")}
              </p>}
              {area.materialPricingMode === "per_linear_meter" && Number.isFinite(area.materialLengthCm) && <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {t("areaMaterialLength", {
                  length: cm(area.materialLengthCm!),
                  meters: meters(area.materialLengthCm! / 100),
                  price: money(area.materialPricePerMeter),
                  total: money(area.materialPriceAdjustment),
                })}
              </p>}
              {area.artwork && <div className="mt-1 space-y-1 break-words text-[11px] text-muted-foreground">
                <p>{t("areaOriginal", { name: area.artwork.originalFileName, bytes: num(area.artwork.originalBytes, 0) })}</p>
                {area.artwork.widthPx && area.artwork.heightPx && <p>{area.artwork.widthPx} × {area.artwork.heightPx} px</p>}
                {area.artwork.sourceWidthCm && area.artwork.sourceHeightCm && <p>{t(area.artwork.dimensionSource === "embedded" ? "areaSizeFromFile" : "areaSizeRequested")}: {cm(area.artwork.sourceWidthCm)} × {cm(area.artwork.sourceHeightCm)} cm</p>}
                {area.maxWidthCm && area.maxHeightCm && <p>{t("areaLimit", { width: cm(area.maxWidthCm), height: cm(area.maxHeightCm) })}</p>}
                {area.quality && <p>{area.quality.message}</p>}
                {area.confirmedAt && area.acceptedSizing && <p>{t(area.acceptedQuality ? "areaConfirmedQuality" : "areaConfirmed", { date: dateTime(area.confirmedAt) })}</p>}
                {!compact && <details><summary className="cursor-pointer py-2">{t("areaIntegrity")}</summary><p className="break-all font-mono">SHA-256: {area.artwork.sha256}</p></details>}
              </div>}
              {area.notes && <p className="mt-1 break-words text-[11px] text-muted-foreground">{t("areaNotes", { text: area.notes })}</p>}
              {area.fileDataUrl && (
                <a href={area.fileDataUrl} download={fileName} onClick={async event => {
                  if (!area.artwork) return;
                  event.preventDefault();
                  try {
                    await verifyArtworkOriginal(area.fileDataUrl!, area.artwork);
                    const link = document.createElement("a");
                    link.href = area.fileDataUrl!;
                    link.download = fileName;
                    link.click();
                  } catch {
                    toast.error(t("areaIntegrityError"));
                  }
                }} className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                  <Download className="h-3 w-3" aria-hidden="true" /> {t("areaDownload")}
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

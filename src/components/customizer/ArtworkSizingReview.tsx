import { useState } from "react";
import { artworkQuality, fitArtwork, formatCm, positive, sizingSignature, type ArtworkMetadata } from "@/lib/artworkSizing";

export type ArtworkReviewState = {
  artwork?: ArtworkMetadata;
  acceptedSizing?: string;
  acceptedQuality?: string;
  widthCm: number;
  heightCm: number;
  aspect: number;
};

type Props = {
  label: string;
  value: ArtworkReviewState;
  maxWidth: number;
  maxHeight: number;
  onChange: (patch: Partial<ArtworkReviewState> & { scaleMul?: number }) => void;
};

export default function ArtworkSizingReview({ label, value, maxWidth, maxHeight, onChange }: Props) {
  const [requestedWidth, setRequestedWidth] = useState("");
  const meta = value.artwork;
  if (!meta) return <p role="alert">Volte a enviar a arte para verificar medidas e qualidade.</p>;
  const known = positive(meta.sourceWidthCm) && positive(meta.sourceHeightCm);
  const quality = artworkQuality(meta, value.widthCm, value.heightCm);
  const signature = sizingSignature(meta, value.widthCm, value.heightCm);
  const setRequestedSize = () => {
    const width = Number(requestedWidth.replace(",", "."));
    if (!positive(width) || width > 10000) return;
    const height = width / value.aspect;
    const fit = fitArtwork(width, height, maxWidth, maxHeight);
    onChange({
      artwork: { ...meta, sourceWidthCm: width, sourceHeightCm: height, dimensionSource: "customer" },
      widthCm: fit.widthCm, heightCm: fit.heightCm,
      scaleMul: fit.widthCm / Math.min(maxWidth, maxHeight * value.aspect),
      acceptedSizing: undefined, acceptedQuality: undefined,
    });
  };
  return (
    <section className="space-y-3 rounded-xl border border-primary/20 bg-muted/20 p-3 text-xs" aria-label={`Medidas e qualidade de ${label}`}>
      <h3 className="font-semibold">Medidas e qualidade da arte</h3>
      <p className="break-words">Original: {meta.originalFileName} · {meta.originalBytes.toLocaleString("pt-PT")} bytes{meta.widthPx && meta.heightPx ? ` · ${meta.widthPx} × ${meta.heightPx} px` : ""}</p>
      {known ? (
        <p>{meta.dimensionSource === "embedded" ? "Medida indicada no ficheiro" : "Medida pretendida indicada por si"}: {formatCm(meta.sourceWidthCm!)} × {formatCm(meta.sourceHeightCm!)} cm.{meta.dimensionSource === "embedded" ? " A medida inclui todo o ficheiro, não apenas os elementos visíveis." : ""}</p>
      ) : (
        <div className="space-y-2">
          <p>O ficheiro não indica uma medida física verificável. Indique a largura pretendida; a altura acompanha a proporção, sem achatar a arte.</p>
          <label className="block">Largura pretendida de {label} (cm)
            <input inputMode="decimal" value={requestedWidth} onChange={e => setRequestedWidth(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3" />
          </label>
          <button type="button" onClick={setRequestedSize} disabled={!positive(Number(requestedWidth.replace(",", "."))) || Number(requestedWidth.replace(",", ".")) > 10000} className="min-h-11 rounded-lg border px-3 font-semibold disabled:opacity-40">Calcular tamanho proporcional</button>
        </div>
      )}
      <p>Limite desta área: {formatCm(maxWidth)} × {formatCm(maxHeight)} cm.</p>
      <p className="font-semibold" aria-live="polite">Tamanho a aplicar no produto: {formatCm(value.widthCm)} × {formatCm(value.heightCm)} cm, sem distorção.</p>
      {known && (value.widthCm < meta.sourceWidthCm! - 0.001 || value.heightCm < meta.sourceHeightCm! - 0.001) && <p>A arte será reduzida proporcionalmente para estas medidas. O original enviado não é alterado.</p>}
      <p role="status">{quality.message}</p>
      {known && <label className="flex min-h-11 items-start gap-2 py-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={value.acceptedSizing === signature} onChange={e => onChange({ acceptedSizing: e.target.checked ? signature : undefined })} />
        Confirmo aplicar a arte de {label} com {formatCm(value.widthCm)} × {formatCm(value.heightCm)} cm.
      </label>}
      {(quality.status === "low" || quality.status === "unverified") && <label className="flex min-h-11 items-start gap-2 py-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={value.acceptedQuality === signature} onChange={e => onChange({ acceptedQuality: e.target.checked ? signature : undefined })} />
        Li o aviso de qualidade de {label} e aceito prosseguir para revisão do original.
      </label>}
    </section>
  );
}

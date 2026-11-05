/** Physical dimensions are never inferred from pixels without a density. */
export type ArtworkMetadata = {
  originalFileName: string;
  originalBytes: number;
  sha256: string;
  widthPx?: number;
  heightPx?: number;
  sourceWidthCm?: number;
  sourceHeightCm?: number;
  dimensionSource: "embedded" | "customer" | "unknown";
};

export const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
export const formatCm = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

export function fitArtwork(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (![width, height, maxWidth, maxHeight].every(positive)) throw new Error("Dimensões inválidas.");
  const factor = Math.min(1, maxWidth / width, maxHeight / height);
  return { widthCm: width * factor, heightCm: height * factor, reduced: factor < 1 - 1e-8 };
}

export function artworkQuality(meta: ArtworkMetadata, width: number, height: number) {
  if (!positive(meta.widthPx) || !positive(meta.heightPx) || !positive(width) || !positive(height)) {
    return { status: "unverified" as const, dpi: null, message: "Qualidade não verificável automaticamente. O painel receberá o original para revisão; um PDF pode conter imagens de baixa resolução." };
  }
  const dpi = Math.min(meta.widthPx * 2.54 / width, meta.heightPx * 2.54 / height);
  const status = dpi < 150 ? "low" as const : dpi < 300 ? "acceptable" as const : "recommended" as const;
  return { status, dpi, message: `${Math.floor(dpi)} ppp no tamanho final: ${status === "low" ? "resolução baixa; pode pixelizar" : status === "acceptable" ? "resolução aceitável; recomendado 300 ppp" : "resolução recomendada"}. Esta avaliação não verifica conteúdo, nitidez ou cores.` };
}

export function sizingSignature(meta: ArtworkMetadata, width: number, height: number) {
  return JSON.stringify([meta.sha256, meta.sourceWidthCm, meta.sourceHeightCm, meta.dimensionSource, width, height]);
}

export function artworkReviewComplete(value: {
  artwork?: ArtworkMetadata; widthCm: number; heightCm: number;
  acceptedSizing?: string; acceptedQuality?: string;
}) {
  const m = value.artwork;
  if (!m || !positive(m.sourceWidthCm) || !positive(m.sourceHeightCm) || !positive(value.widthCm) || !positive(value.heightCm)) return false;
  const signature = sizingSignature(m, value.widthCm, value.heightCm);
  const quality = artworkQuality(m, value.widthCm, value.heightCm);
  return value.acceptedSizing === signature &&
    ((quality.status !== "low" && quality.status !== "unverified") || value.acceptedQuality === signature);
}

/** PNG pHYs and JPEG JFIF/EXIF resolution. Missing/relative units are unknown. */
export function imageDensity(bytes: Uint8Array): { x: number; y: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = (x: number, y: number) => positive(x) && positive(y) ? { x, y } : null;
  if (bytes.length > 8 && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a) {
    for (let p = 8; p + 12 <= bytes.length;) {
      const length = v.getUint32(p);
      if (length > bytes.length - p - 12) break;
      if (v.getUint32(p + 4) === 0x70485973 && length === 9 && bytes[p + 16] === 1) {
        return valid(v.getUint32(p + 8) * 0.0254, v.getUint32(p + 12) * 0.0254);
      }
      p += length + 12;
    }
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let jfif: { x: number; y: number } | null = null;
  for (let p = 2; p + 4 <= bytes.length;) {
    if (bytes[p] !== 0xff) break;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = v.getUint16(p + 2);
    const d = p + 4, end = p + 2 + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe0 && length >= 16 && v.getUint32(d) === 0x4a464946) {
      const unit = bytes[d + 7], multiplier = unit === 1 ? 1 : unit === 2 ? 2.54 : 0;
      jfif = valid(v.getUint16(d + 8) * multiplier, v.getUint16(d + 10) * multiplier);
    }
    if (marker === 0xe1 && length >= 16 && v.getUint32(d) === 0x45786966 && v.getUint16(d + 4) === 0) {
      const t = d + 6, little = v.getUint16(t) === 0x4949;
      if (v.getUint16(t + 2, little) === 42) {
        const ifd = t + v.getUint32(t + 4, little);
        if (ifd >= t && ifd + 2 <= end) {
          let x = 0, y = 0, unit = 2;
          const count = v.getUint16(ifd, little);
          for (let i = 0; i < count && ifd + 2 + (i + 1) * 12 <= end; i++) {
            const entry = ifd + 2 + i * 12, tag = v.getUint16(entry, little), type = v.getUint16(entry + 2, little);
            if (v.getUint32(entry + 4, little) !== 1) continue;
            if (tag === 0x128 && type === 3) unit = v.getUint16(entry + 8, little);
            if ((tag === 0x11a || tag === 0x11b) && type === 5) {
              const r = t + v.getUint32(entry + 8, little);
              if (r >= t && r + 8 <= end && v.getUint32(r + 4, little)) {
                const n = v.getUint32(r, little) / v.getUint32(r + 4, little);
                if (tag === 0x11a) x = n; else y = n;
              }
            }
          }
          const multiplier = unit === 2 ? 1 : unit === 3 ? 2.54 : 0;
          const exif = valid(x * multiplier, y * multiplier);
          if (exif) return exif;
        }
      }
    }
    p = end;
  }
  return jfif;
}

export async function inspectArtwork(file: File, widthPx?: number, heightPx?: number): Promise<ArtworkMetadata> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const meta: ArtworkMetadata = {
    originalFileName: file.name, originalBytes: file.size,
    sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""),
    widthPx, heightPx, dimensionSource: "unknown",
  };
  if (file.type === "application/pdf") {
    const { PDFDocument, PDFName, PDFNumber } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer);
    if (pdf.getPageCount() !== 1) throw new Error("Envie um PDF de uma página por área, para identificar medidas sem ambiguidade.");
    const page = pdf.getPage(0), box = page.getCropBox();
    const userUnit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
    if (!positive(userUnit)) throw new Error("PDF com unidade física inválida.");
    const rotated = Math.abs(page.getRotation().angle) % 180 === 90;
    meta.sourceWidthCm = (rotated ? box.height : box.width) * 2.54 / 72 * userUnit;
    meta.sourceHeightCm = (rotated ? box.width : box.height) * 2.54 / 72 * userUnit;
    meta.dimensionSource = "embedded";
  } else {
    const density = imageDensity(new Uint8Array(buffer));
    if (density && positive(widthPx) && positive(heightPx)) {
      meta.sourceWidthCm = widthPx * 2.54 / density.x;
      meta.sourceHeightCm = heightPx * 2.54 / density.y;
      meta.dimensionSource = "embedded";
    }
  }
  return meta;
}

export async function verifyArtworkOriginal(dataUrl: string, meta: ArtworkMetadata) {
  if (!dataUrl.startsWith("data:")) throw new Error("Original da arte indisponível.");
  const buffer = await (await fetch(dataUrl)).arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), b => b.toString(16).padStart(2, "0")).join("");
  if (buffer.byteLength !== meta.originalBytes || hash !== meta.sha256) throw new Error("O original da arte não corresponde ao ficheiro enviado. Volte a enviar a arte.");
}

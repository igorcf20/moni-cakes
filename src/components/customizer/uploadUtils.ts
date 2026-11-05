// Shared validation + progress-aware file reading for customizer uploads.
// Keeps rules centralized so QuickUpload and the full 3D customizer behave
// consistently.

export type UploadValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type ReadResult = {
  dataUrl: string;
  aspect: number; // width / height (1 for PDFs)
  widthPx?: number;
  heightPx?: number;
};

export const ACCEPTED_MIME =
  "image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,application/postscript,application/illustrator,application/x-coreldraw,.svg,.pdf,.ai,.eps,.cdr";

export const ACCEPTED_LABEL = "PNG, JPG, WEBP, SVG, PDF, AI, EPS ou CDR";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MIN_IMAGE_SIDE = 600; // px — anything smaller pixelates when printed
const REC_IMAGE_SIDE = 1500; // px — recommended minimum for print quality

export function validateFile(file: File): UploadValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const type = file.type || "";
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf";

  if (!isImage && !isPdf) {
    errors.push(`Formato não suportado. Use ${ACCEPTED_LABEL}.`);
  }
  if (file.size > MAX_BYTES) {
    errors.push(
      `Ficheiro demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`,
    );
  }
  if (file.size < 5 * 1024) {
    warnings.push("Ficheiro muito pequeno — verifique se contém a arte final.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function readFileWithProgress(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ReadResult> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    fr.onload = async () => {
      const dataUrl = String(fr.result);
      onProgress?.(100);
      if (file.type.startsWith("image/")) {
        try {
          const dims = await readImageDimensions(dataUrl);
          resolve({
            dataUrl,
            aspect: dims.w / dims.h,
            widthPx: dims.w,
            heightPx: dims.h,
          });
        } catch {
          reject(new Error("Não foi possível verificar as dimensões desta imagem. Envie uma imagem válida."));
        }
      } else {
        resolve({ dataUrl, aspect: 1 });
      }
    };
    fr.onerror = () =>
      reject(new Error("Não foi possível ler o ficheiro. Tente novamente."));
    fr.readAsDataURL(file);
  });
}

export function readImageDimensions(
  dataUrl: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve({ w: img.naturalWidth, h: img.naturalHeight });
      else reject(new Error("Imagem sem dimensões válidas."));
    };
    img.onerror = () => reject(new Error("Imagem inválida."));
    img.src = dataUrl;
  });
}

export const PRINT_DPI = 300;

export function pxToCm(px: number, dpi = PRINT_DPI): number {
  return (px / dpi) * 2.54;
}

export function qualityWarnings(result: ReadResult, file: File): string[] {
  const w: string[] = [];
  if (file.type.startsWith("image/") && result.widthPx && result.heightPx) {
    const minSide = Math.min(result.widthPx, result.heightPx);
    if (minSide < MIN_IMAGE_SIDE) {
      w.push(
        `Resolução baixa (${result.widthPx}×${result.heightPx}px). A impressão pode ficar pixelada.`,
      );
    } else if (minSide < REC_IMAGE_SIDE) {
      w.push(
        `Resolução aceitável (${result.widthPx}×${result.heightPx}px). Recomendado ≥ 1500px para melhor qualidade.`,
      );
    }
    if (file.type === "image/jpeg") {
      w.push("JPG não suporta transparência. Prefira PNG com fundo transparente.");
    }
  }
  return w;
}

export function hasLowResWarning(result: ReadResult, file: File): boolean {
  if (!file.type.startsWith("image/") || !result.widthPx || !result.heightPx) return false;
  return Math.min(result.widthPx, result.heightPx) < MIN_IMAGE_SIDE;
}

/**
 * Fit the art inside a max area (in cm), preserving aspect ratio.
 * Also returns the natural size at PRINT_DPI (for images) so we can tell the
 * user whether the file must be scaled down (fine) or scaled up (loses quality).
 */
export function computeFit(
  result: ReadResult,
  maxWidthCm: number,
  maxHeightCm: number,
): {
  widthCm: number;
  heightCm: number;
  naturalWidthCm?: number;
  naturalHeightCm?: number;
  fitsAtDpi: boolean; // true when the art at 300 DPI is <= the area
  upscaled: boolean;  // true when we had to enlarge above natural size
} {
  const aspect = result.aspect || 1;
  const areaAspect = maxWidthCm / maxHeightCm;
  let widthCm: number;
  let heightCm: number;
  if (aspect > areaAspect) {
    widthCm = maxWidthCm;
    heightCm = maxWidthCm / aspect;
  } else {
    heightCm = maxHeightCm;
    widthCm = maxHeightCm * aspect;
  }
  let naturalWidthCm: number | undefined;
  let naturalHeightCm: number | undefined;
  let fitsAtDpi = true;
  let upscaled = false;
  if (result.widthPx && result.heightPx) {
    naturalWidthCm = pxToCm(result.widthPx);
    naturalHeightCm = pxToCm(result.heightPx);
    fitsAtDpi =
      naturalWidthCm <= maxWidthCm + 0.05 &&
      naturalHeightCm <= maxHeightCm + 0.05;
    upscaled = widthCm > naturalWidthCm + 0.05 || heightCm > naturalHeightCm + 0.05;
  }
  return {
    widthCm: Number(widthCm.toFixed(1)),
    heightCm: Number(heightCm.toFixed(1)),
    naturalWidthCm: naturalWidthCm != null ? Number(naturalWidthCm.toFixed(1)) : undefined,
    naturalHeightCm: naturalHeightCm != null ? Number(naturalHeightCm.toFixed(1)) : undefined,
    fitsAtDpi,
    upscaled,
  };
}

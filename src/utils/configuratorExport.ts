import { setPngDpi } from "./pngDpi";
import { PDFDocument, degrees } from "pdf-lib";
import { Zlib } from "fflate";

/* ------------------------------------------------------------------ */
/* Device-aware rendering limits                                       */
/* ------------------------------------------------------------------ */

export function detectRenderLimits() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in (globalThis as any).document);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const memory = (navigator as any)?.deviceMemory as number | undefined;
  const lowMem = (typeof memory === "number" && memory <= 4) || isIOS;

  if (lowMem) {
    return { maxAxis: 8192, maxTotal: 40_000_000, previewMax: 1600, isMobile: true, isIOS, isSafari };
  }
  // Desktop: raise limits so tall planos (e.g. 57×286 cm) can export at
  // the declared 300 dpi instead of being downsampled to ~147 dpi by the
  // old 16 000 px axis cap. The tiled renderer below streams horizontal
  // stripes when the full canvas doesn't fit — width is the only hard
  // limit that can't be worked around.
  if (typeof memory === "number" && memory >= 8) {
    return { maxAxis: 65535, maxTotal: 400_000_000, previewMax: 2400, isMobile: false, isIOS, isSafari };
  }
  if (typeof memory === "number" && memory >= 6) {
    return { maxAxis: 32767, maxTotal: 260_000_000, previewMax: 2400, isMobile: false, isIOS, isSafari };
  }
  return { maxAxis: 32767, maxTotal: 240_000_000, previewMax: 2400, isMobile: false, isIOS, isSafari };
}

/**
 * Compute the effective DPI that a plano will render at, matching the
 * capping logic used by `renderPlanoFile` (targetDpi vs dpiCap vs dpiCapArea).
 * Used by the UI to warn the customer before add-to-cart when a plano's
 * final print resolution will fall below the recommended minimum because of
 * its physical size — even when the individual arts declare ≥ 300 dpi.
 */
export function computePlanoEffectiveDpi(opts: {
  rollWidthCm: number;
  planoHeightCm: number;
  maxUsedHeightCm: number;
  designDpis: Array<number | null | undefined>;
}): number {
  const limits = detectRenderLimits();
  const MAX_CANVAS_PX = limits.maxAxis;
  const renderW = Math.max(0.1, opts.rollWidthCm);
  const declared = opts.designDpis.map((n) => Number(n) || 0).filter((n) => n > 0);
  const targetDpi = Math.max(300, ...(declared.length ? declared : [0]));
  // Only width is a hard limit (a scanline must fit in one canvas axis).
  // The tiled renderer streams horizontal stripes so plano height no
  // longer bounds the achievable DPI.
  const widthDpiCap = Math.floor((MAX_CANVAS_PX * 2.54) / renderW);
  return Math.max(96, Math.min(targetDpi, widthDpiCap));
}

/** Yield to the browser event loop periodically so long renders don't freeze the UI. */
async function maybeYield(lastYieldMs: { t: number }) {
  const now = performance.now();
  if (now - lastYieldMs.t > 16) {
    lastYieldMs.t = now;
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Renders a single plano into a high-resolution PNG matching the print layout:
 * full roll width and only the used height. It uses the same active artwork
 * URL as the configurator preview, so trimmed/visible-area PNGs are not
 * stretched back to the original transparent canvas.
 */

export type ExportDesignInput = {
  id: string;
  originalUrl: string;
  originalWidthPx: number;
  originalHeightPx: number;
  dpi: number | null;
};

export type ExportItem = {
  designId: string;
  x: number; // cm (top-left of bbox, excluding border)
  y: number;
  widthCm: number;
  heightCm: number;
  rotation: number; // 0/90/180/270
  /** Contour/border width in mm. 0 / undefined = no contour. */
  borderMm?: number;
  /** Contour colour hex. Defaults to white when not provided. */
  borderColor?: string;
};

export type ExportPlanoOptions = {
  rollWidthCm: number;
  planoHeightCm: number;
  items: ExportItem[];
  designs: ExportDesignInput[];
  /** Optional forced DPI cap (used by the retry wrapper on OOM). */
  dpiOverride?: number;
};

export type ExportPlanoResult = {
  png: Blob;
  preview: Blob;
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Real rendered area (cm). The PNG corresponds exactly to this rectangle. */
  bboxCm: { widthCm: number; heightCm: number };
};

const loadImg = (url: string, timeoutMs = 30000) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    (img as any).decoding = "async";
    (img as any).loading = "eager";
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      rej(new Error("img load timeout"));
    }, timeoutMs);
    img.onload = async () => {
      try {
        if (typeof (img as any).decode === "function") await (img as any).decode();
      } catch { /* decode() may reject even when the image is usable */ }
      if (done) return;
      done = true;
      clearTimeout(t);
      if (!img.naturalWidth || !img.naturalHeight) {
        rej(new Error("img decode: dimensões inválidas"));
        return;
      }
      res(img);
    };
    img.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      rej(new Error("img load"));
    };
    img.src = url;
  });

/**
 * Build an offscreen canvas containing the artwork with a coloured contour
 * (dilated alpha) underneath. The output canvas is larger than the original
 * by `borderPx` on every side; the art is drawn centred at (borderPx, borderPx).
 *
 * Uses many radial draws of the source alpha to approximate `feMorphology`
 * dilate(radius=borderPx), then colours that with `source-in`, and finally
 * stamps the unaltered art on top.
 */
function renderContourCanvas(
  img: HTMLImageElement,
  widthPx: number,
  heightPx: number,
  borderPx: number,
  color: string,
): HTMLCanvasElement {
  const W = Math.max(1, Math.round(widthPx + 2 * borderPx));
  const H = Math.max(1, Math.round(heightPx + 2 * borderPx));
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d")!;

  // 1) Build the dilated alpha by stamping the art at every offset on a ring
  //    of radius=borderPx (plus a denser inner fill to avoid gaps).
  const stroke = document.createElement("canvas");
  stroke.width = W;
  stroke.height = H;
  const sctx = stroke.getContext("2d")!;
  // Slightly fewer stamps than before — visual impact is imperceptible and
  // saves ~40 % of canvas work per contour item on mobile.
  const steps = Math.max(12, Math.ceil(borderPx * 1.2));
  // Outer ring
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dx = Math.cos(a) * borderPx;
    const dy = Math.sin(a) * borderPx;
    sctx.drawImage(img, borderPx + dx, borderPx + dy, widthPx, heightPx);
  }
  // Fill ring interior (smaller radius) to ensure solid dilation
  const innerR = Math.max(1, borderPx * 0.5);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    sctx.drawImage(
      img,
      borderPx + Math.cos(a) * innerR,
      borderPx + Math.sin(a) * innerR,
      widthPx,
      heightPx,
    );
  }
  // Replace the rgb of the dilated alpha with the contour colour.
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, W, H);
  sctx.globalCompositeOperation = "source-over";

  // 2) Compose: contour first, then original art on top, centred.
  octx.drawImage(stroke, 0, 0);
  octx.drawImage(img, borderPx, borderPx, widthPx, heightPx);
  return out;
}

export async function renderPlanoFile(opts: ExportPlanoOptions): Promise<ExportPlanoResult> {
  // Canvas limits vary massively per device (~4–5k px on old iOS Safari,
  // ~32k on desktop Chrome). Pick a conservative cap per device to avoid
  // `convertToBlob` silently returning null and shipping a blank print file.
  // When the full canvas doesn't fit we fall back to a streaming tiled
  // renderer that keeps the same DPI without ever allocating the full
  // plano in memory.
  const limits = detectRenderLimits();
  const MAX_CANVAS_PX = limits.maxAxis;
  const MAX_TOTAL_PIXELS = limits.maxTotal;
  if (opts.items.length === 0) {
    throw new Error("Plano sem artes — nada para exportar.");
  }
  // Render the print width and the height actually used by the plano. Keeping
  // x/y in plano coordinates preserves the left/top placement seen by the user,
  // while avoiding a huge blank page down to max_length_cm.
  let maxY = -Infinity;
  for (const it of opts.items) {
    const borderCm = it.borderMm && it.borderMm > 0 ? it.borderMm / 10 : 0;
    maxY = Math.max(maxY, it.y + it.heightCm + borderCm);
  }
  const renderW = Math.max(0.1, opts.rollWidthCm);
  const renderH = Math.max(0.1, Math.min(opts.planoHeightCm, maxY));

  const targetDpi = Math.max(
    300,
    ...opts.designs.map((d) => d.dpi || 0).filter((n) => n > 0)
  );
  // Only width caps the DPI (one full scanline must fit in one axis).
  // Height is chunked by the tiled path when needed.
  const widthDpiCap = Math.floor((MAX_CANVAS_PX * 2.54) / renderW);
  const dpiCandidates = [targetDpi, widthDpiCap];
  if (typeof opts.dpiOverride === "number" && opts.dpiOverride > 0) {
    dpiCandidates.push(opts.dpiOverride);
  }
  const dpi = Math.max(96, Math.min(...dpiCandidates));
  const cmToPx = (cm: number) => Math.round((cm / 2.54) * dpi);
  const widthPx = cmToPx(renderW);
  const heightPx = cmToPx(renderH);

  // Preload every used design once — both single-pass and tiled paths need it.
  const imgCache = new Map<string, HTMLImageElement>();
  const usedIds = new Set(opts.items.map((it) => it.designId));
  for (const d of opts.designs) {
    if (!usedIds.has(d.id)) continue;
    if (!imgCache.has(d.id)) {
      try {
        imgCache.set(d.id, await loadImg(d.originalUrl));
      } catch (err) {
        throw new Error(
          `Não foi possível carregar a arte "${(d as any).name || d.id}". Reenvia o ficheiro e tenta novamente.`,
        );
      }
    }
  }

  // Route: single-pass when the full canvas fits both axis + area budget;
  // otherwise stream horizontal stripes into a single PNG. Tiling is used
  // ONLY for the rasterised print PNG — the vectorial PDF pipeline
  // (`renderOrderPdfFromOriginals`) is untouched.
  const fitsSinglePass =
    heightPx <= MAX_CANVAS_PX && widthPx * heightPx <= MAX_TOTAL_PIXELS;
  if (!fitsSinglePass) {
    return renderPlanoTiled({
      items: opts.items,
      widthPx,
      heightPx,
      dpi,
      renderW,
      renderH,
      cmToPx,
      imgCache,
      previewMax: limits.previewMax,
      maxAxis: MAX_CANVAS_PX,
      maxTotalPixels: MAX_TOTAL_PIXELS,
    });
  }

  // Print canvas (full DPI, transparent bg)
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(widthPx, heightPx)
      : Object.assign(document.createElement("canvas"), { width: widthPx, height: heightPx });
  const ctx = (canvas as any).getContext("2d") as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, widthPx, heightPx);
  // High-quality resampling so the print composite doesn't introduce grey
  // halos around anti-aliased white edges (visible as faint "shadows" on the
  // final PDF viewer's white background).
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";

  // Cache contour composites: many orders stamp the exact same design+border+
  // size dozens of times (e.g. small logo grids). We only need to compute it
  // once per (design, size, borderPx, colour).
  const contourCache = new Map<string, HTMLCanvasElement>();
  const yielder = { t: performance.now() };

  for (const it of opts.items) {
    await maybeYield(yielder);
    const img = imgCache.get(it.designId);
    if (!img) continue;
    const dx = cmToPx(it.x);
    const dy = cmToPx(it.y);
    const dw = cmToPx(it.widthCm);
    const dh = cmToPx(it.heightCm);
    const rot = ((it.rotation % 360) + 360) % 360;
    const borderCm = it.borderMm && it.borderMm > 0 ? it.borderMm / 10 : 0;
    const borderPx = borderCm > 0 ? cmToPx(borderCm) : 0;
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate((rot * Math.PI) / 180);
    const sw = rot === 90 || rot === 270 ? dh : dw;
    const sh = rot === 90 || rot === 270 ? dw : dh;
    if (borderPx > 0) {
      const color = it.borderColor || "#ffffff";
      const key = `${it.designId}|${sw}|${sh}|${borderPx}|${color}`;
      let composite = contourCache.get(key);
      if (!composite) {
        composite = renderContourCanvas(img, sw, sh, borderPx, color);
        contourCache.set(key, composite);
      }
      ctx.drawImage(composite, -sw / 2 - borderPx, -sh / 2 - borderPx);
    } else {
      ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    }
    ctx.restore();
  }

  const canvasToBlob = async (): Promise<Blob | null> => {
    if ("convertToBlob" in canvas) {
      try { return await (canvas as any).convertToBlob({ type: "image/png" }); }
      catch { return null; }
    }
    return await new Promise<Blob | null>((res) =>
      (canvas as HTMLCanvasElement).toBlob((b) => res(b), "image/png"),
    );
  };
  const pngBlob = await canvasToBlob();
  if (!pngBlob || pngBlob.size === 0) {
    // Signal upstream so the caller can retry with a smaller DPI.
    const e = new Error(
      "Falha ao gerar PNG (memória insuficiente no navegador). A tentar novamente com resolução reduzida…",
    );
    (e as any).retryable = true;
    throw e;
  }
  // Detect a silently-empty render: a canvas with items should never encode
  // to a near-zero byte-per-pixel ratio. If it does, one of the artworks
  // failed to draw and we must abort instead of shipping a blank plano.
  if (opts.items.length > 0) {
    const bytesPerPixel = pngBlob.size / Math.max(1, widthPx * heightPx);
    if (bytesPerPixel < 0.02) {
      throw new Error(
        "O plano ficou em branco ao gerar o ficheiro de impressão. Reenvia as artes e tenta novamente.",
      );
    }
  }
  const pngWithDpi = await setPngDpi(pngBlob, dpi);

  // Preview JPG — larger and higher quality for admin identification.
  // Lower cap on memory-constrained devices to avoid a second big canvas OOM.
  const PREVIEW_MAX = limits.previewMax;
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(widthPx, heightPx));
  const previewW = Math.max(1, Math.round(widthPx * previewScale));
  const previewH = Math.max(1, Math.round(heightPx * previewScale));
  const pCanvas = document.createElement("canvas");
  pCanvas.width = previewW;
  pCanvas.height = previewH;
  const pCtx = pCanvas.getContext("2d")!;
  // High-quality downscale
  (pCtx as any).imageSmoothingEnabled = true;
  (pCtx as any).imageSmoothingQuality = "high";
  pCtx.fillStyle = "#ffffff";
  pCtx.fillRect(0, 0, previewW, previewH);
  // Draw the print canvas scaled
  // Build a temporary HTMLImageElement from PNG blob for compatibility
  const url = URL.createObjectURL(pngBlob);
  try {
    const im = await loadImg(url);
    pCtx.drawImage(im, 0, 0, previewW, previewH);
  } finally {
    URL.revokeObjectURL(url);
  }
  const previewBlob = await new Promise<Blob>((res) =>
    pCanvas.toBlob((b) => res(b!), "image/jpeg", 0.92)
  );

  return {
    png: pngWithDpi,
    preview: previewBlob,
    widthPx,
    heightPx,
    dpi,
    bboxCm: { widthCm: renderW, heightCm: renderH },
  };
}

/**
 * Wrapper around `renderPlanoFile` that retries with progressively lower DPI
 * when the browser returns a null blob (typical Safari OOM on giant canvases).
 */
export async function renderPlanoFileWithRetry(
  opts: ExportPlanoOptions,
): Promise<ExportPlanoResult> {
  let dpiOverride: number | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await renderPlanoFile({ ...opts, dpiOverride });
    } catch (err) {
      lastErr = err;
      if (!(err as any)?.retryable) throw err;
      // Reduce DPI by 20 % from whatever the last attempt actually used.
      // First retry pushes DPI down aggressively; subsequent retries chip away.
      const baseline = dpiOverride ?? 300;
      dpiOverride = Math.max(96, Math.floor(baseline * 0.8));
      // Give the browser a moment to release memory before the next attempt.
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Não foi possível gerar o PNG do plano. Reduz o tamanho ou tenta novamente.");
}

/* ------------------------------------------------------------------ */
/* Tiled PNG renderer — streams horizontal stripes into a single PNG  */
/* ------------------------------------------------------------------ */

// CRC32 (PNG polynomial), inlined to avoid depending on pngDpi internals.
const _PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const _crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const _u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
};
const _concat = (parts: Uint8Array[]) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const _PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function _pngChunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const crc = _crc32(_concat([t, data]));
  return _concat([_u32(data.length), t, data, _u32(crc)]);
}
function _buildPngRgba(widthPx: number, heightPx: number, dpi: number, idatZlib: Uint8Array): Uint8Array {
  // IHDR
  const ihdr = _concat([
    _u32(widthPx), _u32(heightPx),
    new Uint8Array([8, 6, 0, 0, 0]), // bit depth, colour type RGBA, comp, filter, interlace
  ]);
  // pHYs — encode DPI as pixels per metre (unit 1)
  const dpm = Math.round(dpi * 39.3701);
  const phys = _concat([_u32(dpm), _u32(dpm), new Uint8Array([1])]);
  return _concat([
    _PNG_SIG,
    _pngChunk("IHDR", ihdr),
    _pngChunk("pHYs", phys),
    _pngChunk("IDAT", idatZlib),
    _pngChunk("IEND", new Uint8Array(0)),
  ]);
}

async function renderPlanoTiled(opts: {
  items: ExportItem[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  renderW: number;
  renderH: number;
  cmToPx: (cm: number) => number;
  imgCache: Map<string, HTMLImageElement>;
  previewMax: number;
  maxAxis: number;
  maxTotalPixels: number;
}): Promise<ExportPlanoResult> {
  const {
    items, widthPx, heightPx, dpi, renderW, renderH, cmToPx, imgCache,
    previewMax, maxAxis, maxTotalPixels,
  } = opts;

  // Stripe height: obey the axis limit and cap pixels per stripe so
  // getImageData doesn't allocate more than ~240 MB at a time.
  const perStripeBudget = Math.min(maxTotalPixels, 60_000_000);
  const tileH = Math.max(
    1,
    Math.min(heightPx, maxAxis, Math.floor(perStripeBudget / Math.max(1, widthPx))),
  );

  const rowBytes = widthPx * 4;
  const zlibChunks: Uint8Array[] = [];
  const zlib = new Zlib({ level: 6 }, (chunk /*, final*/) => {
    if (chunk.length) zlibChunks.push(chunk);
  });

  // Preview canvas — small raster of the full plano for admin display.
  const previewScale = Math.min(1, previewMax / Math.max(widthPx, heightPx));
  const previewW = Math.max(1, Math.round(widthPx * previewScale));
  const previewH = Math.max(1, Math.round(heightPx * previewScale));
  const pCanvas = document.createElement("canvas");
  pCanvas.width = previewW;
  pCanvas.height = previewH;
  const pCtx = pCanvas.getContext("2d")!;
  (pCtx as any).imageSmoothingEnabled = true;
  (pCtx as any).imageSmoothingQuality = "high";
  pCtx.fillStyle = "#ffffff";
  pCtx.fillRect(0, 0, previewW, previewH);

  const contourCache = new Map<string, HTMLCanvasElement>();
  const yielder = { t: performance.now() };

  for (let y0 = 0; y0 < heightPx; y0 += tileH) {
    const th = Math.min(tileH, heightPx - y0);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(widthPx, th)
        : Object.assign(document.createElement("canvas"), { width: widthPx, height: th });
    const ctx = (canvas as any).getContext("2d") as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, widthPx, th);
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    // Shift world so absolute plano coords land inside this stripe.
    ctx.translate(0, -y0);

    for (const it of items) {
      const img = imgCache.get(it.designId);
      if (!img) continue;
      const dx = cmToPx(it.x);
      const dy = cmToPx(it.y);
      const dw = cmToPx(it.widthCm);
      const dh = cmToPx(it.heightCm);
      const rot = ((it.rotation % 360) + 360) % 360;
      const borderCm = it.borderMm && it.borderMm > 0 ? it.borderMm / 10 : 0;
      const borderPx = borderCm > 0 ? cmToPx(borderCm) : 0;
      // Skip items that don't intersect this stripe (perf).
      const itemTop = dy - borderPx;
      const itemBottom = dy + dh + borderPx;
      if (itemBottom < y0 || itemTop > y0 + th) continue;
      await maybeYield(yielder);
      ctx.save();
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.rotate((rot * Math.PI) / 180);
      const sw = rot === 90 || rot === 270 ? dh : dw;
      const sh = rot === 90 || rot === 270 ? dw : dh;
      if (borderPx > 0) {
        const color = it.borderColor || "#ffffff";
        const key = `${it.designId}|${sw}|${sh}|${borderPx}|${color}`;
        let composite = contourCache.get(key);
        if (!composite) {
          composite = renderContourCanvas(img, sw, sh, borderPx, color);
          contourCache.set(key, composite);
        }
        ctx.drawImage(composite, -sw / 2 - borderPx, -sh / 2 - borderPx);
      } else {
        ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
      }
      ctx.restore();
    }

    // Extract stripe pixels and feed each scanline (filter type 0) to zlib.
    const imgData = ctx.getImageData(0, 0, widthPx, th);
    const data = new Uint8Array(
      imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength,
    );
    // Feed row-by-row so the zlib stream sees prepended filter bytes.
    const rowWithFilter = new Uint8Array(rowBytes + 1);
    for (let r = 0; r < th; r++) {
      rowWithFilter[0] = 0; // filter: None
      rowWithFilter.set(data.subarray(r * rowBytes, (r + 1) * rowBytes), 1);
      zlib.push(rowWithFilter, false);
    }

    // Blit stripe into the preview (scaled).
    pCtx.drawImage(
      canvas as any,
      0, y0 * previewScale,
      widthPx * previewScale, th * previewScale,
    );

    // Free the stripe canvas before allocating the next one.
    try { (canvas as any).width = 0; (canvas as any).height = 0; } catch { /* no-op */ }
    await maybeYield(yielder);
  }

  zlib.push(new Uint8Array(0), true);
  const idat = _concat(zlibChunks);
  const pngBytes = _buildPngRgba(widthPx, heightPx, dpi, idat);
  const pngBlob = new Blob([pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength) as ArrayBuffer], { type: "image/png" });

  const previewBlob = await new Promise<Blob>((res) =>
    pCanvas.toBlob((b) => res(b!), "image/jpeg", 0.92),
  );

  return {
    png: pngBlob,
    preview: previewBlob,
    widthPx,
    heightPx,
    dpi,
    bboxCm: { widthCm: renderW, heightCm: renderH },
  };
}

/* ------------------------------------------------------------------ */
/* Multi-page print PDF                                               */
/* ------------------------------------------------------------------ */

export type OrderPdfPage = {
  /** 1-based page label shown in the footer. */
  index: number;
  name: string;
  copies: number;
  png: Blob;
  widthCm: number;
  heightCm: number;
  dpi: number;
};

const CM_TO_PT = 28.346456693;

export async function renderOrderPdf(pages: OrderPdfPage[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Ficheiro de impressão (${pages.length} página${pages.length === 1 ? "" : "s"})`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const buf = await p.png.arrayBuffer();
    const png = await pdf.embedPng(buf);
    // Page = exact printable area in cm. The embedded PNG is already rendered
    // at the desired print DPI, so drawing it at this physical size makes PDF
    // DPI checkers report the real effective DPI instead of the default 72dpi.
    const wPt = Math.max(1, p.widthCm * CM_TO_PT);
    const hPt = Math.max(1, p.heightCm * CM_TO_PT);
    const page = pdf.addPage([wPt, hPt]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: wPt,
      height: hPt,
    });
    try {
      (page as any).setLabel?.(
        `P${p.index}_${p.name}_${p.widthCm.toFixed(1)}x${p.heightCm.toFixed(1)}cm_${p.copies}x_${p.dpi}dpi`,
      );
    } catch { /* setLabel optional */ }
  }
  const bytes = await pdf.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ */
/* High-fidelity print PDF — embeds each customer file at native res  */
/* ------------------------------------------------------------------ */

export type FidelityDesignInput = {
  id: string;
  /** Original file uploaded by the customer (PNG/JPG/PDF). Embedded as-is. */
  file: Blob;
  /** Original pixel dimensions (used to compute effective DPI in the footer). */
  originalWidthPx: number;
  originalHeightPx: number;
};

export type FidelityPage = {
  index: number;
  name: string;
  copies: number;
  /**
   * Full plano size in cm — this is exactly what the customer sees in the
   * configurator and what the page in the PDF must match. We DO NOT shrink
   * the page to the bbox of items, so the printed layout keeps the same
   * empty margins (and same item positions) as the on-screen canvas.
   */
  planoCm: { widthCm: number; heightCm: number };
  items: Array<{
    designId: string;
    /** cm — top-left within the plano (NOT bbox-relative). */
    x: number;
    y: number;
    widthCm: number;
    heightCm: number;
    rotation: number;
    /** Contour width in mm — 0 / undefined for none. */
    borderMm?: number;
    /** Contour colour hex. Defaults to white when not provided. */
    borderColor?: string;
  }>;
};

/**
 * Produces a multi-page PDF where every customer art is embedded at its
 * native resolution — no intermediate raster, so the printable file keeps
 * the same effective DPI the customer uploaded.
 *
 * - PNG / JPEG → embedded as image
 * - PDF        → first page embedded as a PDF form XObject (preserves vectors)
 */
export async function renderOrderPdfFromOriginals(
  pages: FidelityPage[],
  designs: FidelityDesignInput[],
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `Ficheiro de impressão (${pages.length} página${pages.length === 1 ? "" : "s"})`,
  );

  // Pre-embed each unique design only once, indexed by id.
  type Embed =
    | { kind: "img"; w: number; h: number; obj: any }
    | { kind: "pdf"; w: number; h: number; obj: any };
  const embeds = new Map<string, Embed>();

  for (const d of designs) {
    const buf = new Uint8Array(await d.file.arrayBuffer());
    const type = (d.file as any).type || "";
    const head = String.fromCharCode(...buf.slice(0, 4));
    try {
      if (type.includes("pdf") || head === "%PDF") {
        const [page] = await pdf.embedPdf(buf, [0]);
        embeds.set(d.id, { kind: "pdf", w: page.width, h: page.height, obj: page });
      } else if (type.includes("jpeg") || type.includes("jpg") || buf[0] === 0xff && buf[1] === 0xd8) {
        const img = await pdf.embedJpg(buf);
        embeds.set(d.id, { kind: "img", w: img.width, h: img.height, obj: img });
      } else {
        const img = await pdf.embedPng(buf);
        embeds.set(d.id, { kind: "img", w: img.width, h: img.height, obj: img });
      }
    } catch (err) {
      console.warn("[renderOrderPdfFromOriginals] failed to embed", d.id, err);
    }
  }

  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    // Page = exact printable area in cm (no footer, no padding). The printer
    // expects the PDF page size to equal the configured plano so nothing is
    // resized/cropped at print time.
    const wPt = Math.max(1, p.planoCm.widthCm * CM_TO_PT);
    const hContent = Math.max(1, p.planoCm.heightCm * CM_TO_PT);
    const hPt = hContent;
    const page = pdf.addPage([wPt, hPt]);

    let minEffDpi = Infinity;

    for (const it of p.items) {
      const embed = embeds.get(it.designId);
      if (!embed) continue;
      // Effective DPI computed from the longest axis (in cm) vs original px.
      const design = designs.find((d) => d.id === it.designId);
      if (design) {
        const longCm = Math.max(it.widthCm, it.heightCm);
        const longPx = Math.max(design.originalWidthPx, design.originalHeightPx);
        if (longCm > 0 && longPx > 0) {
          minEffDpi = Math.min(minEffDpi, Math.round((longPx / longCm) * 2.54));
        }
      }

      const hasBorder = !!(it.borderMm && it.borderMm > 0);
      const borderCm = hasBorder ? (it.borderMm as number) / 10 : 0;
      // widthCm/heightCm store the POST-rotation bbox (what the user sees on
      // canvas). pdf-lib's drawImage() expects PRE-rotation (native) width
      // and height, and it rotates counter-clockwise around the anchor
      // (bottom-left) — not around the image centre. We therefore compute
      // (a) the pre-rotation dimensions and (b) an anchor offset so that
      // the drawn image ends up centred on the intended target point.
      const rot = ((it.rotation % 360) + 360) % 360;
      const rotated = rot === 90 || rot === 270;

      // Outer rect (includes the contour ring), in post-rotation cm — used
      // only to compute the centre of the item on the page.
      const outerWcm = it.widthCm + 2 * borderCm;
      const outerHcm = it.heightCm + 2 * borderCm;
      const outerWPt = outerWcm * CM_TO_PT;
      const outerHPt = outerHcm * CM_TO_PT;
      const xPt = (it.x - borderCm) * CM_TO_PT;
      const yPt = hContent - (it.y - borderCm) * CM_TO_PT - outerHPt;
      const cx = xPt + outerWPt / 2;
      const cy = yPt + outerHPt / 2;

      // Pre-rotation dimensions of the outer (art+contour) rect.
      const preOuterW = rotated ? outerHPt : outerWPt;
      const preOuterH = rotated ? outerWPt : outerHPt;

      // Anchor (bottom-left) that places the pre-rotation centre at (cx, cy)
      // after pdf-lib rotates CCW around the anchor.
      // NOTE: HTML canvas (used by the preview) rotates CLOCKWISE for positive
      // angles because its Y axis points down. pdf-lib rotates COUNTER-CLOCKWISE
      // for positive angles (Y axis points up). To make the printed PDF match
      // what the customer sees in the configurator preview we must apply the
      // opposite sign in the PDF world — otherwise items rotated 90° in the
      // preview come out as 270° in the PDF (mirror orientation) which is
      // exactly the "camisões desconfigurados" symptom.
      const pdfRot = (360 - rot) % 360;
      const angle = (pdfRot * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const anchorForCenter = (w: number, h: number, cxT: number, cyT: number) => {
        const offX = (w / 2) * cosA - (h / 2) * sinA;
        const offY = (w / 2) * sinA + (h / 2) * cosA;
        return { x: cxT - offX, y: cyT - offY };
      };

      if (hasBorder && embed.kind === "img") {
        // Build a per-item composite raster (art + contour) at native res and
        // embed it. We cannot use embed.obj directly because pdf-lib has no
        // dilate primitive.
        try {
          const img = await blobToImage(designs.find((d) => d.id === it.designId)?.file);
          if (img) {
            const ratio = embed.h / Math.max(1, embed.w);
            const baseW = embed.w;
            const baseH = embed.h;
            // borderPx in the composite's pixel space (use art native res).
            const borderPxComposite = Math.max(
              1,
              Math.round((borderCm / Math.max(0.001, it.widthCm)) * baseW),
            );
            void ratio;
            const composite = renderContourCanvas(
              img,
              baseW,
              baseH,
              borderPxComposite,
              it.borderColor || "#ffffff",
            );
            const blob: Blob = await new Promise((res) =>
              composite.toBlob((b) => res(b as Blob), "image/png"),
            );
            const buf = new Uint8Array(await blob.arrayBuffer());
            const png = await pdf.embedPng(buf);
            const anchor = anchorForCenter(preOuterW, preOuterH, cx, cy);
            page.drawImage(png, {
              x: anchor.x,
              y: anchor.y,
              width: preOuterW,
              height: preOuterH,
              rotate: degrees(pdfRot),
            } as any);
            continue;
          }
        } catch (err) {
          console.warn("[renderOrderPdfFromOriginals] contour failed, falling back", err);
        }
      }

      // No-border path (or PDF embed, or contour failure fallback):
      // draw the original at the visible-art rect (no contour expansion).
      const wPtItem = it.widthCm * CM_TO_PT;
      const hPtItem = it.heightCm * CM_TO_PT;
      const xPtNoB = it.x * CM_TO_PT;
      const yPtNoB = hContent - it.y * CM_TO_PT - hPtItem;
      const cxN = xPtNoB + wPtItem / 2;
      const cyN = yPtNoB + hPtItem / 2;
      // Pre-rotation dims for pdf-lib.
      const preW = rotated ? hPtItem : wPtItem;
      const preH = rotated ? wPtItem : hPtItem;
      const anchor = anchorForCenter(preW, preH, cxN, cyN);
      const opts = {
        x: anchor.x,
        y: anchor.y,
        width: preW,
        height: preH,
        rotate: degrees(pdfRot),
      } as any;
      if (embed.kind === "img") page.drawImage(embed.obj, opts);
      else page.drawPage(embed.obj, opts);
    }

    // Encode metadata in the page label only — keep the print area clean.
    const dpiLabel = Number.isFinite(minEffDpi) ? `${minEffDpi}dpi` : "n/a";
    try {
      (page as any).setLabel?.(
        `P${pi + 1}_${p.planoCm.widthCm.toFixed(1)}x${p.planoCm.heightCm.toFixed(1)}cm_${p.copies}x_${dpiLabel}`,
      );
    } catch { /* setLabel optional */ }
  }

  const bytes = await pdf.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

async function blobToImage(blob?: Blob): Promise<HTMLImageElement | null> {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("img load"));
      img.src = url;
    });
  } catch {
    return null;
  } finally {
    // Defer revoke so pdf-lib's encoder has time to read.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
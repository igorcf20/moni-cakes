 
import { pgValue } from "@/lib/postgrestFilter";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Upload, Trash2, Plus, Lock, Unlock, RotateCw, Copy as CopyIcon,
  ChevronUp, ChevronDown, ZoomIn, ZoomOut, Maximize2, Wand2, ShoppingCart, FileWarning,
  CheckCircle2, AlertTriangle, X, FileImage, Layers, ArrowLeftRight, FileText, ClipboardPaste,
  Settings2, LayoutGrid, Sliders,
} from "lucide-react";
import { Minimize2, Pencil, Info, HelpCircle, BookOpen, MousePointer2, Sparkles, Minus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  renderPlanoFileWithRetry,
  renderOrderPdf,
  renderOrderPdfFromOriginals,
  computePlanoEffectiveDpi,
} from "@/utils/configuratorExport";
import { putPending, getPending } from "@/utils/pendingDesigns";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import PrintQualityGuard from "@/components/configurator/PrintQualityGuard";
import GeneratingFileDialog from "@/components/configurator/GeneratingFileDialog";
import RollVerificationDialog, { type RollVerificationDecision } from "@/components/configurator/RollVerificationDialog";
import { Checkbox } from "@/components/ui/checkbox";

/* ============================================================
 * Domain types
 * ============================================================ */
type Tier = { min_meters: number; price_per_meter: number; label: string | null };
type Status = "approved" | "warning" | "blocked";
type BorderMode = "none" | "white" | "black";
type AlphaMask = { cols: number; rows: number; data: Uint8Array };

/** Curated border colors — kept in sync with the picker UI. */
const BORDER_PRESETS: { name: string; value: string }[] = [
  { name: "Branco",   value: "#ffffff" },
  { name: "Preto",    value: "#0a0a0a" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja",  value: "#f97316" },
  { name: "Amarelo",  value: "#facc15" },
  { name: "Verde",    value: "#22c55e" },
  { name: "Azul",     value: "#3b82f6" },
  { name: "Rosa",     value: "#ec4899" },
];

interface Design {
  id: string;
  name: string;
  url: string;              // active preview (trimmed or original depending on useVisibleArea)
  originalUrl: string;
  trimmedUrl?: string;
  file: File;
  /** Untransformed original upload — preserved for high-fidelity print PDF & "originais do cliente". Never re-encoded. */
  originalFile?: File;
  // Active px (matches url)
  widthPx: number;
  heightPx: number;
  // Originals (untrimmed)
  originalWidthPx: number;
  originalHeightPx: number;
  trimmedWidthPx?: number;
  trimmedHeightPx?: number;
  dpi: number | null;
  hasAlpha: boolean;
  status: Status;
  reasons: string[];
  // Editable controls
  cmW: number;
  cmH: number;
  keepAspect: boolean;
  desiredQty: number;
  allowAutoRotate: boolean;
  borderMode: BorderMode;
  borderMm: number;
  /** Optional explicit border color (hex). Falls back to borderMode color when absent. */
  borderColor?: string;
  alphaMask?: AlphaMask;
  originalMask?: AlphaMask;
  trimmedMask?: AlphaMask;
  /** When true, the file was auto-blocked but is eligible for paid manual review. */
  reviewable?: boolean;
  /** When true, the customer paid the manual review fee and the design proceeds despite warnings. */
  manualReviewRequested?: boolean;
  /** Fee in EUR snapshotted when the customer requested manual review. */
  manualReviewFee?: number;
}

interface PlacedItem {
  id: string;
  designId: string;
  x: number;       // cm — top-left of bbox excluding border
  y: number;       // cm
  widthCm: number; // bbox (excluding border)
  heightCm: number;
  rotation: number; // 0/90/180/270
  z: number;
  locked: boolean;
}

interface Plano {
  id: string;
  name: string;
  items: PlacedItem[];
  /** Visual-only background color for this plano's preview canvas. Not included in the printed file. */
  viewBg?: "gray" | "white" | "black";
  /** When true, this plano is exclusively dedicated to a single design that paid manual review. */
  manualReview?: boolean;
  /** Design id this plano is reserved for (only when manualReview === true). */
  reviewDesignId?: string;
  /** Snapshot of the manual review fee (EUR) charged for THIS plano. */
  manualReviewFee?: number;
  /** How many printed copies of this plano the customer wants. Default 1. */
  copies?: number;
}

interface Settings {
  spacingMm: number;        // gap between artes
  marginMm: number;         // safety margin inside roll
  defaultCmW: number;       // default size when adding to roll
  defaultCmH: number;
  defaultKeepAspect: boolean;
  useVisibleArea: boolean;  // toggle trimmed vs original
}

interface State {
  designs: Design[];
  planos: Plano[];
  activeId: string;
  selectedItemId: string | null;
  zoom: number;
  zCounter: number;
  settings: Settings;
}

type Action =
  | { type: "ADD_DESIGNS"; designs: Design[] }
  | { type: "REMOVE_DESIGN"; id: string }
  | { type: "UPDATE_DESIGN"; id: string; patch: Partial<Design> }
  | { type: "ADD_ITEM"; designId: string; rollWidthCm: number; planoHeightCm: number }
  | { type: "ADD_ITEM_QTY"; designId: string; qty: number; rollWidthCm: number; planoHeightCm: number }
  | { type: "FILL_ROLL"; designId: string; rollWidthCm: number; planoHeightCm: number }
  | { type: "DISTRIBUTE_PAGES"; designId: string; qty: number; rollWidthCm: number; planoHeightCm: number }
  | { type: "MOVE_ITEM"; id: string; x: number; y: number }
  | { type: "RESIZE_ITEM"; id: string; widthCm: number; heightCm: number }
  | { type: "ROTATE_ITEM"; id: string }
  | { type: "DUP_ITEM"; id: string }
  | { type: "DELETE_ITEM"; id: string }
  | { type: "TOGGLE_LOCK"; id: string }
  | { type: "BRING_FORWARD"; id: string }
  | { type: "SEND_BACK"; id: string }
  | { type: "SELECT"; id: string | null }
  | { type: "ADD_PLANO" }
  | { type: "ADD_REVIEW_PLANO"; designId: string; fee: number; rollWidthCm: number; planoHeightCm: number }
  | { type: "ADD_PDF"; designId: string; rollWidthCm: number; planoHeightCm: number }
  | { type: "SET_PLANO_COPIES"; id: string; copies: number }
  | { type: "SWITCH_PLANO"; id: string }
  | { type: "REMOVE_PLANO"; id: string }
  | { type: "RENAME_PLANO"; id: string; name: string }
  | { type: "SET_PLANO_BG"; id: string; viewBg: "gray" | "white" | "black" }
  | { type: "CLEAR_PLANO" }
  | { type: "PACK_PLANO"; rollWidthCm: number; planoHeightCm: number }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "UPDATE_SETTINGS"; patch: Partial<Settings> }
  | { type: "PASTE_ITEM"; source: PlacedItem; rollWidthCm: number; planoHeightCm: number }
  | { type: "RESET_DRAFT" }
  | { type: "LOAD_DRAFT"; designs: Design[]; planos: Plano[]; activeId: string; zoom: number; zCounter: number; settings?: Settings };

/* ============================================================
 * Helpers
 * ============================================================ */
const fmtEUR = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const uid = () => Math.random().toString(36).slice(2, 10);
const pxToCm = (px: number, dpi: number) => (px / dpi) * 2.54;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const effectiveDpi = (px: number, cm: number) => (cm > 0 ? Math.round((px / cm) * 2.54) : 0);
const mmToCm = (mm: number) => mm / 10;

const getBorderCm = (d?: Design) => (d && d.borderMode !== "none" ? mmToCm(d.borderMm) : 0);

// Clamp a placed item's (x,y) so its bbox stays inside the roll's usable area
// (i.e. respects the safety margin on every side). If the art is bigger than
// the usable area on an axis, the position is pinned to the margin.
const clampPos = (
  x: number, y: number, w: number, h: number,
  marginCm: number, rollW: number, planoH: number,
) => {
  const maxX = rollW - marginCm - w;
  const maxY = planoH - marginCm - h;
  const nx = maxX < marginCm ? marginCm : clamp(x, marginCm, maxX);
  const ny = maxY < marginCm ? marginCm : clamp(y, marginCm, maxY);
  return { x: nx, y: ny };
};

// Same as clampPos, but accounts for a printed border (contour) that
// extends `bb` cm beyond the item's bbox on every side.
const clampPosWithBorder = (
  x: number, y: number, w: number, h: number, bb: number,
  marginCm: number, rollW: number, planoH: number,
) => {
  const r = clampPos(x - bb, y - bb, w + 2 * bb, h + 2 * bb, marginCm, rollW, planoH);
  return { x: r.x + bb, y: r.y + bb };
};

/**
 * Find the top-left-most free slot for a new rect of size (newW × newH) in a
 * plano of size (rollW × planoH), respecting the inner margin and a minimum
 * gap to every existing item. `existing` is the list of already-placed
 * bounding boxes in the same plano. Returns `null` when nothing fits.
 * Coordinates are in cm and treat the visible artwork bbox (borders ignored
 * — `spacingMm` already separates artworks).
 */
const findFreeSlotCm = (
  newW: number, newH: number,
  existing: Array<{ x: number; y: number; w: number; h: number }>,
  rollW: number, planoH: number,
  marginCm: number, gapCm: number,
): { x: number; y: number } | null => {
  if (newW <= 0 || newH <= 0) return null;
  if (newW + 2 * marginCm > rollW + 1e-6) return null;
  if (newH + 2 * marginCm > planoH + 1e-6) return null;
  const xs = new Set<number>([marginCm]);
  const ys = new Set<number>([marginCm]);
  for (const e of existing) {
    xs.add(e.x + e.w + gapCm);
    ys.add(e.y + e.h + gapCm);
  }
  const xsSorted = [...xs].sort((a, b) => a - b);
  const ysSorted = [...ys].sort((a, b) => a - b);
  const maxX = rollW - marginCm - newW;
  const maxY = planoH - marginCm - newH;
  for (const y of ysSorted) {
    if (y > maxY + 1e-6) continue;
    for (const x of xsSorted) {
      if (x > maxX + 1e-6) continue;
      const ny = Math.max(marginCm, y);
      const nx = Math.max(marginCm, x);
      let overlap = false;
      for (const e of existing) {
        if (
          nx < e.x + e.w + gapCm - 1e-6 &&
          nx + newW + gapCm > e.x + 1e-6 &&
          ny < e.y + e.h + gapCm - 1e-6 &&
          ny + newH + gapCm > e.y + 1e-6
        ) {
          overlap = true; break;
        }
      }
      if (!overlap) return { x: nx, y: ny };
    }
  }
  return null;
};

const defaultSettings = (): Settings => ({
  spacingMm: 3,
  marginMm: 5,
  defaultCmW: 15, // legacy — não editável pelo cliente
  defaultCmH: 15,
  defaultKeepAspect: true,
  useVisibleArea: true,
});

/* ============================================================
 * Trim transparent borders so the bounding box matches real art
 * ============================================================ */
async function trimTransparent(
  source: Blob | string,
  alphaThreshold = 24,
): Promise<{ blob: Blob; url: string; widthPx: number; heightPx: number; trimmed: boolean } | null> {
  try {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("img load")); });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return null;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    let data: Uint8ClampedArray;
    try { data = ctx.getImageData(0, 0, W, H).data; } catch { return null; }
    const colCount = new Uint32Array(W);
    const rowCount = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > alphaThreshold) {
          colCount[x]++;
          rowCount[y]++;
        }
      }
    }
    const minCol = Math.max(2, Math.floor(H * 0.005));
    const minRow = Math.max(2, Math.floor(W * 0.005));
    let minX = -1, maxX = -1, minY = -1, maxY = -1;
    for (let x = 0; x < W; x++) if (colCount[x] >= minCol) { minX = x; break; }
    for (let x = W - 1; x >= 0; x--) if (colCount[x] >= minCol) { maxX = x; break; }
    for (let y = 0; y < H; y++) if (rowCount[y] >= minRow) { minY = y; break; }
    for (let y = H - 1; y >= 0; y--) if (rowCount[y] >= minRow) { maxY = y; break; }
    if (minX < 0 || minY < 0 || maxX < 0 || maxY < 0) return null;
    const pad = 1;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    const nw = maxX - minX + 1, nh = maxY - minY + 1;
    const trimmed = nw < W || nh < H;
    if (!trimmed) return { blob: typeof source === "string" ? await (await fetch(source)).blob() : source, url, widthPx: W, heightPx: H, trimmed: false };
    const out = document.createElement("canvas");
    out.width = nw; out.height = nh;
    out.getContext("2d")!.drawImage(c, minX, minY, nw, nh, 0, 0, nw, nh);
    const blob: Blob | null = await new Promise((res) => out.toBlob((b) => res(b), "image/png"));
    if (!blob) return null;
    return { blob, url: URL.createObjectURL(blob), widthPx: nw, heightPx: nh, trimmed: true };
  } catch (e) {
    console.warn("trimTransparent failed", e);
    return null;
  }
}

async function createAlphaMask(source: Blob | string, cols = 48, rows = 48, alphaThreshold = 24): Promise<AlphaMask | undefined> {
  try {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("mask load")); });
    const c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.clearRect(0, 0, cols, rows);
    ctx.drawImage(img, 0, 0, cols, rows);
    const pixels = ctx.getImageData(0, 0, cols, rows).data;
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3] > alphaThreshold ? 1 : 0;
    return { cols, rows, data };
  } catch (e) {
    console.warn("alpha mask failed", e);
    return undefined;
  }
}

const maskHasVisibleOverlap = (
  a: { x: number; y: number; w: number; h: number; rotation: number; mask?: AlphaMask; hasAlpha?: boolean },
  b: { x: number; y: number; w: number; h: number; rotation: number; mask?: AlphaMask; hasAlpha?: boolean },
) => {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right - left <= 0.01 || bottom - top <= 0.01) return false;
  // Without reliable alpha masks we must keep the conservative rectangular
  // collision behaviour. With masks, only actual visible pixels count.
  if (!a.mask || !b.mask) return true;

  const isOpaqueAt = (r: typeof a, x: number, y: number) => {
    const mask = r.mask!;
    const nx = clamp((x - r.x) / r.w, 0, 1);
    const ny = clamp((y - r.y) / r.h, 0, 1);
    const rot = ((r.rotation % 360) + 360) % 360;
    const u = rot === 90 ? ny : rot === 180 ? 1 - nx : rot === 270 ? 1 - ny : nx;
    const v = rot === 90 ? 1 - nx : rot === 180 ? 1 - ny : rot === 270 ? nx : ny;
    const mx = clamp(Math.floor(u * mask.cols), 0, mask.cols - 1);
    const my = clamp(Math.floor(v * mask.rows), 0, mask.rows - 1);
    return !!mask.data[my * mask.cols + mx];
  };

  const sampleX = Math.max(8, Math.ceil((right - left) / Math.min(a.w / a.mask.cols, b.w / b.mask.cols)));
  const sampleY = Math.max(8, Math.ceil((bottom - top) / Math.min(a.h / a.mask.rows, b.h / b.mask.rows)));
  const cols = Math.min(96, sampleX);
  const rows = Math.min(96, sampleY);
  for (let yy = 0; yy < rows; yy++) {
    const y = top + ((yy + 0.5) / rows) * (bottom - top);
    for (let xx = 0; xx < cols; xx++) {
      const x = left + ((xx + 0.5) / cols) * (right - left);
      if (isOpaqueAt(a, x, y) && isOpaqueAt(b, x, y)) return true;
    }
  }
  return false;
};

const itemCollisionShape = (it: PlacedItem, d?: Design) => ({
  x: it.x,
  y: it.y,
  w: it.widthCm,
  h: it.heightCm,
  rotation: it.rotation,
  mask: d?.alphaMask,
  hasAlpha: d?.hasAlpha,
});

const hasRealArtOverlap = (
  a: PlacedItem,
  b: PlacedItem,
  designs: Design[],
  paddingCm = 0,
) => {
  const da = designs.find((x) => x.id === a.designId);
  const db = designs.find((x) => x.id === b.designId);
  const aa = itemCollisionShape(a, da);
  const bb = itemCollisionShape(b, db);
  const pairPaddingCm = paddingCm + Math.max(getBorderCm(da), getBorderCm(db));
  const left = Math.max(aa.x - pairPaddingCm, bb.x - pairPaddingCm);
  const top = Math.max(aa.y - pairPaddingCm, bb.y - pairPaddingCm);
  const right = Math.min(aa.x + aa.w + pairPaddingCm, bb.x + bb.w + pairPaddingCm);
  const bottom = Math.min(aa.y + aa.h + pairPaddingCm, bb.y + bb.h + pairPaddingCm);
  if (right - left <= 0.01 || bottom - top <= 0.01) return false;
  return maskHasVisibleOverlap(
    { ...aa, x: aa.x - pairPaddingCm, y: aa.y - pairPaddingCm, w: aa.w + pairPaddingCm * 2, h: aa.h + pairPaddingCm * 2 },
    { ...bb, x: bb.x - pairPaddingCm, y: bb.y - pairPaddingCm, w: bb.w + pairPaddingCm * 2, h: bb.h + pairPaddingCm * 2 },
  );
};

const findMaskAwareSlotCm = (
  candidate: PlacedItem,
  existing: PlacedItem[],
  designs: Design[],
  rollW: number,
  planoH: number,
  marginCm: number,
  gapCm: number,
): { x: number; y: number } | null => {
  if (candidate.widthCm <= 0 || candidate.heightCm <= 0) return null;
  if (candidate.widthCm + 2 * marginCm > rollW + 1e-6) return null;
  if (candidate.heightCm + 2 * marginCm > planoH + 1e-6) return null;

  // First respect the visible rectangular footprint of each art. This keeps
  // the automatic add/organize behaviour predictable: if a normal top-left
  // slot exists (for example the second art beside the first), use it before
  // trying alpha-mask holes inside/around existing artwork.
  const rectangularSlot = findFreeSlotCm(
    candidate.widthCm,
    candidate.heightCm,
    existing.map((e) => ({ x: e.x, y: e.y, w: e.widthCm, h: e.heightCm })),
    rollW,
    planoH,
    marginCm,
    gapCm,
  );
  if (rectangularSlot) return rectangularSlot;

  const xs = new Set<number>([marginCm]);
  const ys = new Set<number>([marginCm]);
  for (const e of existing) {
    xs.add(e.x + e.widthCm + gapCm);
    ys.add(e.y + e.heightCm + gapCm);
    // Also test starts inside the rectangular bbox so transparent holes can be
    // reused instead of only trying after the whole rectangle.
    xs.add(e.x + gapCm);
    xs.add(e.x + e.widthCm / 2);
    ys.add(e.y + gapCm);
    ys.add(e.y + e.heightCm / 2);
  }

  const xsSorted = [...xs].sort((a, b) => a - b);
  const ysSorted = [...ys].sort((a, b) => a - b);
  const maxX = rollW - marginCm - candidate.widthCm;
  const maxY = planoH - marginCm - candidate.heightCm;
  for (const y of ysSorted) {
    if (y > maxY + 1e-6) continue;
    for (const x of xsSorted) {
      if (x > maxX + 1e-6) continue;
      const trial = { ...candidate, x: Math.max(marginCm, x), y: Math.max(marginCm, y) };
      const overlaps = existing.some((e) => hasRealArtOverlap(trial, e, designs, gapCm));
      if (!overlaps) return { x: trial.x, y: trial.y };
    }
  }
  return null;
};

const usedPlanoHeightCm = (items: PlacedItem[], designs: Design[], fallbackHeightCm: number) => {
  if (!items.length) return 0;
  const maxBottom = Math.max(
    0.1,
    ...items.map((it) => {
      const d = designs.find((x) => x.id === it.designId);
      const bb = d && d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      return it.y + it.heightCm + bb;
    }),
  );
  return Math.max(0.1, Math.min(fallbackHeightCm, maxBottom));
};

const packItemsMaskAware = (
  items: PlacedItem[],
  designs: Design[],
  rollW: number,
  planoH: number,
  marginCm: number,
  gapCm: number,
) => {
  const placed: PlacedItem[] = [];
  const unplaced: PlacedItem[] = [];
  let rotatedCount = 0;
  const ordered = [...items].sort((a, b) =>
    Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm) || b.widthCm * b.heightCm - a.widthCm * a.heightCm,
  );

  for (const it of ordered) {
    const d = designs.find((x) => x.id === it.designId);
    const canRotate = d?.allowAutoRotate ?? true;
    const variants: PlacedItem[] = [
      { ...it, x: marginCm, y: marginCm },
      ...(canRotate
        ? [{ ...it, x: marginCm, y: marginCm, widthCm: it.heightCm, heightCm: it.widthCm, rotation: (it.rotation + 90) % 360 }]
        : []),
    ];
    let best: PlacedItem | null = null;
    for (const variant of variants) {
      const slot = findMaskAwareSlotCm(variant, placed, designs, rollW, planoH, marginCm, gapCm);
      if (!slot) continue;
      const candidate = { ...variant, x: slot.x, y: slot.y };
      if (!best || candidate.y < best.y - 1e-6 || (Math.abs(candidate.y - best.y) <= 1e-6 && candidate.x < best.x)) {
        best = candidate;
      }
    }
    if (best) {
      if (best.rotation !== it.rotation) rotatedCount++;
      placed.push(best);
    } else {
      unplaced.push(it);
    }
  }
  return { placed, unplaced, rotatedCount };
};

type StoredDesignDraft = Omit<Design, "url" | "originalUrl" | "trimmedUrl" | "file" | "originalFile"> & {
  file: File | Blob;
  fileType: string;
  lastModified: number;
  /** Keep the untouched upload for print fidelity when it differs from the working file. */
  originalFile?: File | Blob;
  originalFileType?: string;
  originalFileLastModified?: number;
};

type ConfiguratorDraft = {
  designs: StoredDesignDraft[];
  planos: Plano[];
  activeId: string;
  zoom: number;
  zCounter: number;
  settings?: Settings;
  savedAt: string;
};

const DRAFT_DB_NAME = "bom-dtf-configurator-drafts";
const DRAFT_STORE_NAME = "drafts";

/* ============================================================
 * Regenerate a PNG preview URL for a PDF file (transparent bg)
 * Used after draft restore — the previewUrl blob URLs from the
 * original session are gone, so without this PDFs disappear.
 * ============================================================ */
async function renderPdfPreviewBlobUrl(file: File): Promise<{ url?: string; widthPx?: number; heightPx?: number }> {
  try {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    const v = pdfjs.version || "4.6.82";
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const doc: any = await pdfjs.getDocument({ data: buf, disableWorker: false, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const maxSide = 2400;
    const scale = Math.min(maxSide / vp.width, maxSide / vp.height, 4);
    const rvp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.ceil(rvp.width);
    c.height = Math.ceil(rvp.height);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: rvp, background: "rgba(0,0,0,0)" }).promise;
    const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), "image/png"));
    if (!blob) return {};
    return { url: URL.createObjectURL(blob), widthPx: c.width, heightPx: c.height };
  } catch (e) {
    console.warn("renderPdfPreviewBlobUrl failed", e);
    return {};
  }
}

const openDraftDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("IndexedDB indisponível"));
    return;
  }
  const req = indexedDB.open(DRAFT_DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
      req.result.createObjectStore(DRAFT_STORE_NAME);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function readConfiguratorDraft(key: string): Promise<ConfiguratorDraft | null> {
  const db = await openDraftDb();
  return await new Promise<ConfiguratorDraft | null>((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, "readonly");
    const req = tx.objectStore(DRAFT_STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as ConfiguratorDraft | undefined) || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function writeConfiguratorDraft(key: string, state: State) {
  const payload: ConfiguratorDraft = {
    designs: state.designs.map((d) => ({
      id: d.id,
      name: d.name,
      file: d.file,
      fileType: d.file.type,
      lastModified: d.file.lastModified,
      ...(d.originalFile && d.originalFile !== d.file ? {
        originalFile: d.originalFile,
        originalFileType: d.originalFile.type,
        originalFileLastModified: d.originalFile.lastModified,
      } : {}),
      widthPx: d.widthPx,
      heightPx: d.heightPx,
      originalWidthPx: d.originalWidthPx,
      originalHeightPx: d.originalHeightPx,
      trimmedWidthPx: d.trimmedWidthPx,
      trimmedHeightPx: d.trimmedHeightPx,
      dpi: d.dpi,
      hasAlpha: d.hasAlpha,
      status: d.status,
      reasons: d.reasons,
      cmW: d.cmW,
      cmH: d.cmH,
      keepAspect: d.keepAspect,
      desiredQty: d.desiredQty,
      allowAutoRotate: d.allowAutoRotate,
      borderMode: d.borderMode,
      borderMm: d.borderMm,
      borderColor: d.borderColor,
      alphaMask: d.alphaMask,
      originalMask: d.originalMask,
      trimmedMask: d.trimmedMask,
    })),
    planos: state.planos,
    activeId: state.activeId,
    zoom: state.zoom,
    zCounter: state.zCounter,
    settings: state.settings,
    savedAt: new Date().toISOString(),
  };

  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
    tx.objectStore(DRAFT_STORE_NAME).put(payload, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteConfiguratorDraft(key: string) {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
      tx.objectStore(DRAFT_STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("draft delete", e);
  }
}

function restoreDraftDesigns(designs: StoredDesignDraft[] = []): Design[] {
  return designs.filter((d) => d.file).map((d) => {
    const file = d.file instanceof File
      ? d.file
      : new File([d.file], d.name, { type: d.fileType || "application/octet-stream", lastModified: d.lastModified || Date.now() });
    const originalFile = d.originalFile
      ? d.originalFile instanceof File
        ? d.originalFile
        : new File([d.originalFile], d.name, {
          type: d.originalFileType || d.fileType || "application/octet-stream",
          lastModified: d.originalFileLastModified || d.lastModified || Date.now(),
        })
      : undefined;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    // For PDFs we cannot use the raw file blob URL as an <img> source.
    // Leave URLs empty so the post-restore effect regenerates a PNG preview.
    const url = isPdf ? "" : URL.createObjectURL(file);
    return {
      id: d.id,
      name: d.name,
      file,
      originalFile,
      url,
      originalUrl: url,
      trimmedUrl: undefined,
      widthPx: d.widthPx,
      heightPx: d.heightPx,
      originalWidthPx: d.originalWidthPx ?? d.widthPx,
      originalHeightPx: d.originalHeightPx ?? d.heightPx,
      trimmedWidthPx: d.trimmedWidthPx,
      trimmedHeightPx: d.trimmedHeightPx,
      dpi: d.dpi,
      hasAlpha: d.hasAlpha,
      status: d.status,
      reasons: d.reasons,
      cmW: d.cmW ?? 15,
      cmH: d.cmH ?? 15,
      keepAspect: d.keepAspect ?? true,
      desiredQty: d.desiredQty ?? 1,
      allowAutoRotate: d.allowAutoRotate ?? true,
      borderMode: (d.borderMode ?? "none") as BorderMode,
      borderMm: d.borderMm ?? 2,
      borderColor: d.borderColor,
      alphaMask: d.alphaMask,
      originalMask: d.originalMask,
      trimmedMask: d.trimmedMask,
    };
  });
}

/* ============================================================
 * PNG validation (DPI via pHYs, alpha via sample)
 * ============================================================ */
async function validatePng(file: File): Promise<{ widthPx: number; heightPx: number; dpi: number | null; hasAlpha: boolean; status: Status; reasons: string[]; reviewable?: boolean }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const reasons: string[] = [];
  const widthPx = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
  const heightPx = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];

  let dpi: number | null = null;
  for (let i = 8; i < buf.length - 12; ) {
    const len = (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    if (type === "pHYs") {
      const ppx = (buf[i + 8] << 24) | (buf[i + 9] << 16) | (buf[i + 10] << 8) | buf[i + 11];
      const unit = buf[i + 16];
      if (unit === 1) dpi = Math.round(ppx * 0.0254);
      break;
    }
    if (type === "IDAT" || type === "IEND") break;
    i += 12 + len;
  }

  let hasAlpha = false;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { hasAlpha = true; break; }

  let status: Status = "approved";
  const reviewable = false;
  reasons.push(`Resolução do ficheiro: ${widthPx}×${heightPx}px${dpi ? ` · ${dpi} dpi declarado` : " · DPI não declarado no ficheiro"}.`);
  if (dpi == null) {
    // Allow but require explicit acceptance of the reduced-quality term — the
    // file may print fine if the underlying resolution is high enough, but the
    // customer assumes responsibility for the final quality.
    status = "warning";
    reasons.push("⚠️ O ficheiro não tem informação de DPI declarada. É necessário aceitar o termo de qualidade de impressão para continuar.");
  } else if (dpi < 299) {
    // Allow but require an explicit acceptance term (handled by
    // PrintQualityGuard) — the customer can proceed assuming the
    // potential loss of quality.
    status = "warning";
    reasons.push(`⚠️ ${dpi} dpi é inferior ao mínimo recomendado (300 dpi). É necessário aceitar o termo de qualidade reduzida para continuar.`);
  } else {
    reasons.push("O DPI efetivo depende do tamanho final no plano — mantém a arte dentro do tamanho recomendado para garantir 300 dpi.");
  }
  if (!hasAlpha) {
    reasons.push("⚠️ Sem fundo transparente — exporta como PNG-24 com canal alpha.");
    status = "warning";
  }
  return { widthPx, heightPx, dpi, hasAlpha, status, reasons, reviewable };
}

async function validatePdf(
  file: File,
  limits?: { maxWidthCm?: number; maxHeightCm?: number },
  alphaThresholds?: { block: number; warn: number },
): Promise<{ widthPx: number; heightPx: number; dpi: number | null; hasAlpha: boolean; status: Status; reasons: string[]; previewUrl?: string; reviewable?: boolean }> {
  try {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    const v = pdfjs.version || "4.6.82";
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: buf, disableWorker: false, isEvalSupported: false });
    const doc: any = await Promise.race([
      loadingTask.promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout ao ler PDF (15s)")), 15000)),
    ]);
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    // Inspect all available page boxes — some PDFs (e.g. Illustrator exports)
    // have a crop/trim box smaller than the media box. Use the largest so we
    // measure the full page the user sees in their PDF viewer.
    const userUnit = page.userUnit || 1;
    const view = page.view || [];
    const info: any = (page as any)._pageInfo || {};
    const candidates: Array<[number, number]> = [];
    if (view.length === 4) candidates.push([(view[2] - view[0]) * userUnit, (view[3] - view[1]) * userUnit]);
    for (const key of ["mediaBox", "cropBox", "bleedBox", "trimBox", "artBox"]) {
      const b = info[key];
      if (Array.isArray(b) && b.length === 4) {
        candidates.push([(b[2] - b[0]) * userUnit, (b[3] - b[1]) * userUnit]);
      }
    }
    // pick the largest area
    let bestW = vp.width, bestH = vp.height, bestArea = vp.width * vp.height;
    for (const [w, h] of candidates) {
      const area = w * h;
      if (area > bestArea) { bestArea = area; bestW = w; bestH = h; }
    }
    // Honor page rotation if present
    const rotate = ((page.rotate || 0) % 360 + 360) % 360;
    if (rotate === 90 || rotate === 270) { const t = bestW; bestW = bestH; bestH = t; }
    const widthCm = (bestW / 72) * 2.54;
    const heightCm = (bestH / 72) * 2.54;
    console.info("[PDF dims]", { name: file.name, userUnit, rotate, view, info_keys: Object.keys(info), candidates, chosenPt: [bestW, bestH], cm: [widthCm, heightCm] });
    const widthPx = Math.round((widthCm / 2.54) * 300);
    const heightPx = Math.round((heightCm / 2.54) * 300);

    if (limits && (limits.maxWidthCm || limits.maxHeightCm)) {
      const overW = limits.maxWidthCm && widthCm > limits.maxWidthCm + 0.5;
      const overH = limits.maxHeightCm && heightCm > limits.maxHeightCm + 0.5;
      if (overW || overH) {
        return {
          widthPx, heightPx, dpi: 300, hasAlpha: true,
          status: "blocked",
          reasons: [
            `❌ O PDF tem ${widthCm.toFixed(1)}×${heightCm.toFixed(1)} cm e ultrapassa a página de impressão (${limits.maxWidthCm} × ${limits.maxHeightCm} cm).`,
            "Reexporta o PDF com tamanho de página igual ou inferior ao da impressão, ou divide a arte em partes.",
          ],
        };
      }
    }

    let previewUrl: string | undefined;
    let hasAlpha = false;
    let opaquePct = 0;
    let alphaVariance = false;
    try {
      // Render the PDF preview at (or above) the target print resolution so the
      // downstream print PNG doesn't upscale a low-res raster — upscaling
      // creates faint gray/coloured halos around white/anti-aliased edges that
      // show up as "shadows" against the PDF viewer's white background.
      const targetDpi = 400; // supersample vs 300 dpi print target
      const neededW = (widthCm / 2.54) * targetDpi;
      const neededH = (heightCm / 2.54) * targetDpi;
      const maxSide = Math.min(6000, Math.max(2400, neededW, neededH));
      const scale = Math.min(maxSide / vp.width, maxSide / vp.height, 8);
      const renderVp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.ceil(renderVp.width);
      c.height = Math.ceil(renderVp.height);
      const ctx = c.getContext("2d")!;
      // Make sure we start with a transparent canvas, otherwise the sample
      // will always look opaque even when the PDF has transparent regions.
      ctx.clearRect(0, 0, c.width, c.height);
      // Force a fully transparent background. pdf.js defaults to opaque white
      // when no background is provided, which masks transparent PDFs.
      await page.render({
        canvasContext: ctx,
        viewport: renderVp,
        background: "rgba(0,0,0,0)",
      }).promise;
      try {
        const sw = Math.min(256, c.width);
        const sh = Math.min(256, c.height);
        const sample = document.createElement("canvas");
        sample.width = sw; sample.height = sh;
        const sctx = sample.getContext("2d")!;
        sctx.clearRect(0, 0, sw, sh);
        sctx.drawImage(c, 0, 0, sw, sh);
        const data = sctx.getImageData(0, 0, sw, sh).data;
        let opaque = 0;
        let firstAlpha = -1;
        const total = data.length / 4;
        for (let i = 3; i < data.length; i += 4) {
          const a = data[i];
          if (a >= 250) opaque++;
          else if (!hasAlpha) hasAlpha = true;
          if (firstAlpha === -1) firstAlpha = a;
          else if (!alphaVariance && a !== firstAlpha) alphaVariance = true;
        }
        opaquePct = total > 0 ? opaque / total : 1;
      } catch {}
      const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), "image/png"));
      if (blob) previewUrl = URL.createObjectURL(blob);
    } catch (renderErr) {
      console.warn("PDF preview render falhou", renderErr);
    }

    const blockThreshold = alphaThresholds?.block ?? 0.99;
    const warnThreshold = alphaThresholds?.warn ?? 0.92;

    if (previewUrl && opaquePct >= blockThreshold && !alphaVariance) {
      return {
        widthPx, heightPx, dpi: 300, hasAlpha: false,
        status: "blocked",
        reviewable: true,
        reasons: [
          `❌ O PDF parece ter fundo opaco (${(opaquePct * 100).toFixed(0)}% dos pixels analisados estão totalmente preenchidos).`,
          "Reexporta o PDF removendo o fundo branco/colorido, ou pede uma análise manual à equipa.",
        ],
        previewUrl,
      };
    }

    const reasons = [
      `Ficheiro vetorial — ${widthCm.toFixed(1)}×${heightCm.toFixed(1)} cm na escala original.`,
      "Vetores escalam sem perda; a equipa verificará cor e transparência antes da impressão.",
    ];
    if (previewUrl && opaquePct >= warnThreshold) {
      reasons.push(`⚠️ ${(opaquePct * 100).toFixed(0)}% da arte parece preenchida — confirma que exportaste sem fundo branco. Se for arte preenchida (ex.: ilustração de fundo) ignora este aviso.`);
    }
    if (!previewUrl) {
      reasons.push("⚠️ Não conseguimos gerar uma pré-visualização do PDF — vamos usar um marcador. O ficheiro original será impresso normalmente.");
    }
    return { widthPx, heightPx, dpi: 300, hasAlpha: hasAlpha || opaquePct < blockThreshold, status: "warning", reasons, previewUrl };
  } catch (e: any) {
    const raw = e?.message?.toLowerCase() || "";
    const cause = /timeout/.test(raw)
      ? "O ficheiro demorou demasiado a abrir (timeout)."
      : /password|encrypt/.test(raw)
        ? "O PDF está protegido por palavra-passe."
        : /invalid|corrupt|format/.test(raw)
          ? "O ficheiro parece corrompido ou não é um PDF válido."
          : `Erro técnico: ${e?.message?.slice(0, 120) || "desconhecido"}.`;
    return {
      widthPx: 0, heightPx: 0, dpi: null, hasAlpha: false,
      status: "blocked",
      reasons: [`❌ Não foi possível ler o PDF.`, cause, "Tenta exportar como PDF/X-1a ou PNG-24 a 300 dpi com fundo transparente."],
    };
  }
}

/* ============================================================
 * Packing algorithm (skyline-style, supports rotation + border)
 * Returns positions for each input rect; rects that didn't fit have null pos.
 * ============================================================ */
type PackRect = { id: string; w: number; h: number; rotatable: boolean };
type Packed = { id: string; x: number; y: number; w: number; h: number; rotated: boolean };

function packRects(
  rects: PackRect[],
  binW: number,
  binH: number,
  gap: number,
  marginX: number,
  marginY: number,
): { placed: Packed[]; unplaced: PackRect[]; usedHeight: number } {
  type Free = { x: number; y: number; w: number; h: number };
  let free: Free[] = [{ x: marginX, y: marginY, w: binW - 2 * marginX, h: binH - 2 * marginY }];
  const placed: Packed[] = [];
  const unplaced: PackRect[] = [];
  const usableRight = binW - marginX;
  const usableBottom = binH - marginY;

  const intersects = (a: Free, b: Free) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const pruneFree = (list: Free[]) => {
    const clean = list.filter((f) => f.w > 0.1 && f.h > 0.1);
    for (let i = clean.length - 1; i >= 0; i--) {
      for (let j = 0; j < clean.length; j++) {
        if (i === j) continue;
        const a = clean[i], b = clean[j];
        if (a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6) {
          clean.splice(i, 1);
          break;
        }
      }
    }
    return clean.sort((a, b) => a.y - b.y || a.x - b.x || a.h - b.h);
  };

  // Sort by max(w,h) desc for better packing
  const sorted = [...rects].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  for (const r of sorted) {
    let best: { idx: number; rotated: boolean; score: number; tie: number } | null = null;
    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      const tryFit = (w: number, h: number, rotated: boolean) => {
        if (w <= f.w + 1e-6 && h <= f.h + 1e-6) {
          // Prefer the most compact top-left placement, then the least waste.
          const score = f.y + h;
          const tie = f.x + Math.min(f.w - w, f.h - h) + (f.w * f.h - w * h) / 1000;
          if (!best || score < best.score || (score === best.score && tie < best.tie)) best = { idx: i, rotated, score, tie };
        }
      };
      tryFit(r.w, r.h, false);
      if (r.rotatable) tryFit(r.h, r.w, true);
    }
    if (!best) { unplaced.push(r); continue; }
    const f = free[best.idx];
    const W = best.rotated ? r.h : r.w;
    const H = best.rotated ? r.w : r.h;
    placed.push({ id: r.id, x: f.x, y: f.y, w: W, h: H, rotated: best.rotated });

    // Split EVERY free rectangle touched by this placement. This prevents the
    // second click on “Organizar” from reusing stale overlapping free areas.
    const occX = Math.max(marginX, f.x - gap);
    const occY = Math.max(marginY, f.y - gap);
    const occRight = Math.min(usableRight, f.x + W + gap);
    const occBottom = Math.min(usableBottom, f.y + H + gap);
    const occupied: Free = { x: occX, y: occY, w: occRight - occX, h: occBottom - occY };
    const next: Free[] = [];
    for (const fr of free) {
      if (!intersects(fr, occupied)) { next.push(fr); continue; }
      const frRight = fr.x + fr.w;
      const frBottom = fr.y + fr.h;
      const splitRight = occupied.x + occupied.w;
      const splitBottom = occupied.y + occupied.h;
      if (occupied.x > fr.x) next.push({ x: fr.x, y: fr.y, w: occupied.x - fr.x, h: fr.h });
      if (splitRight < frRight) next.push({ x: splitRight, y: fr.y, w: frRight - splitRight, h: fr.h });
      if (occupied.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: occupied.y - fr.y });
      if (splitBottom < frBottom) next.push({ x: fr.x, y: splitBottom, w: fr.w, h: frBottom - splitBottom });
    }
    free = pruneFree(next);
  }

  const usedHeight = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  return { placed, unplaced, usedHeight };
}

/* ============================================================
 * Reducer
 * ============================================================ */
const initialState = (): State => {
  const id = uid();
  return { designs: [], planos: [{ id, name: "Página 1", items: [] }], activeId: id, selectedItemId: null, zoom: 1, zCounter: 1, settings: defaultSettings() };
};

function reducer(s: State, a: Action): State {
  const activePlano = s.planos.find((p) => p.id === s.activeId)!;
  const updateActive = (items: PlacedItem[]): State => ({
    ...s,
    planos: s.planos.map((p) => (p.id === s.activeId ? { ...p, items } : p)),
  });

  // Guards for the manual-review-dedicated planos:
  // - A plano flagged manualReview only accepts items whose designId === reviewDesignId.
  // - A design with manualReviewRequested can only be placed in its dedicated plano(s).
  const reviewBlocked = (plano: Plano, designId: string): string | null => {
    if (plano.manualReview && plano.reviewDesignId !== designId) {
      return "Este rolo é exclusivo da arte em análise manual.";
    }
    const d = s.designs.find((x) => x.id === designId);
    if (d?.manualReviewRequested && !(plano.manualReview && plano.reviewDesignId === d.id)) {
      return "Esta arte só pode ser colocada no seu rolo dedicado de análise manual.";
    }
    return null;
  };

  switch (a.type) {
    case "RESET_DRAFT":
      return initialState();
    case "ADD_DESIGNS":
      return { ...s, designs: [...s.designs, ...a.designs] };
    case "REMOVE_DESIGN":
      return {
        ...s,
        designs: s.designs.filter((d) => d.id !== a.id),
        planos: s.planos.map((p) => ({ ...p, items: p.items.filter((i) => i.designId !== a.id) })),
      };
    case "UPDATE_DESIGN":
      return {
        ...s,
        designs: s.designs.map((d) => d.id === a.id ? { ...d, ...a.patch } : d),
      };
    case "ADD_ITEM": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d) return s;
      const block = reviewBlocked(activePlano, d.id);
      if (block) { setTimeout(() => toast.error(block), 0); return s; }
      const w = +d.cmW.toFixed(2);
      const h = +d.cmH.toFixed(2);
      const margin = mmToCm(s.settings.marginMm);
      const gap = mmToCm(s.settings.spacingMm);
      const z = s.zCounter + 1;
      // Try to fit in the active plano without disturbing existing items.
      // Manual-review planos are exclusive — never auto-fit into them.
      const canTryActive = !activePlano.manualReview;
      const candidate: PlacedItem = {
        id: "__candidate__", designId: d.id, x: margin, y: margin,
        widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
      };
      const slot = canTryActive
        ? (activePlano.items.length === 0
            ? { x: margin, y: margin }
            : findMaskAwareSlotCm(candidate, activePlano.items, s.designs, a.rollWidthCm, a.planoHeightCm, margin, gap))
        : null;
      if (slot) {
        const item: PlacedItem = {
          id: uid(), designId: d.id, x: slot.x, y: slot.y,
          widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
        };
        return { ...updateActive([...activePlano.items, item]), selectedItemId: item.id, zCounter: z };
      }
      // Doesn't fit (or active plano is exclusive): create a new plano with the item at top-left.
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      const { x, y } = clampPosWithBorder(margin, margin, w, h, bb, margin, a.rollWidthCm, a.planoHeightCm);
      const item: PlacedItem = {
        id: uid(), designId: d.id, x, y,
        widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
      };
      const newId = uid();
      const newPlano: Plano = { id: newId, name: `Página ${s.planos.length + 1}`, items: [item] };
      setTimeout(() => toast.success(`${newPlano.name} criado — sem espaço no plano anterior.`), 0);
      return { ...s, planos: [...s.planos, newPlano], activeId: newId, selectedItemId: item.id, zCounter: z };
    }
    case "ADD_ITEM_QTY": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d || a.qty <= 0) return s;
      const block = reviewBlocked(activePlano, d.id);
      if (block) { setTimeout(() => toast.error(block), 0); return s; }
      const w = +d.cmW.toFixed(2);
      const h = +d.cmH.toFixed(2);
      const margin = mmToCm(s.settings.marginMm);
      const gap = mmToCm(s.settings.spacingMm);
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;

      let z = s.zCounter;
      const planos = [...s.planos];
      let activeIdx = planos.findIndex((p) => p.id === s.activeId);
      if (activeIdx < 0) activeIdx = 0;
      let createdPages = 0;
      let placedTotal = 0;

      for (let n = 0; n < a.qty; n++) {
        // Try to fit in the current active plano without disturbing existing items.
        const target = planos[activeIdx];
        if (!target.manualReview) {
          const candidate: PlacedItem = {
            id: "__candidate__", designId: d.id, x: margin, y: margin,
            widthCm: w, heightCm: h, rotation: 0, z: z + 1, locked: d.keepAspect,
          };
          const slot = target.items.length === 0
            ? { x: margin, y: margin }
            : findMaskAwareSlotCm(candidate, target.items, s.designs, a.rollWidthCm, a.planoHeightCm, margin, gap);
          if (slot) {
            z += 1;
            const item: PlacedItem = {
              id: uid(), designId: d.id, x: slot.x, y: slot.y,
              widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
            };
            planos[activeIdx] = { ...target, items: [...target.items, item] };
            placedTotal += 1;
            continue;
          }
        }
        // Overflow: create a new plano and place item at the safe top-left.
        const { x, y } = clampPosWithBorder(margin, margin, w, h, bb, margin, a.rollWidthCm, a.planoHeightCm);
        z += 1;
        const item: PlacedItem = {
          id: uid(), designId: d.id, x, y,
          widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
        };
        const newPlano: Plano = { id: uid(), name: `Página ${planos.length + 1}`, items: [item] };
        // If even the new (empty) plano can't fit this item, abort.
        if (w + 2 * margin > a.rollWidthCm + 1e-6 || h + 2 * margin > a.planoHeightCm + 1e-6) {
          setTimeout(() => toast.error("A arte é maior que o rolo. Reduz o tamanho."), 0);
          break;
        }
        planos.push(newPlano);
        activeIdx = planos.length - 1;
        createdPages += 1;
        placedTotal += 1;
      }

      const newActiveId = planos[activeIdx].id;
      if (createdPages > 0) {
        setTimeout(() => toast.success(`Aplicado ${placedTotal} unidade(s) · +${createdPages} plano(s) criado(s).`), 0);
      } else if (placedTotal > 0) {
        setTimeout(() => toast.success(`Aplicado ${placedTotal} unidade(s) no plano atual.`), 0);
      }
      return { ...s, planos, activeId: newActiveId, zCounter: z };
    }
    case "FILL_ROLL": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d) return s;
      const block = reviewBlocked(activePlano, d.id);
      if (block) { setTimeout(() => toast.error(block), 0); return s; }
      const border = d.borderMode !== "none" ? mmToCm(d.borderMm) * 2 : 0;
      // try increasing qty until it stops fitting
      const gap = mmToCm(s.settings.spacingMm);
      const margin = mmToCm(s.settings.marginMm);
      let lastGood = 0;
      let qty = Math.max(1, Math.floor(((a.rollWidthCm - 2 * margin) / (d.cmW + border + gap)) * ((a.planoHeightCm - 2 * margin) / (d.cmH + border + gap)) * 1.2)) + 5;
      qty = Math.max(qty, 5);
      // binary-search style: try qty, if fits → try qty+5, else reduce
      let lo = 1, hi = qty;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rects: PackRect[] = Array.from({ length: mid }, (_, i) => ({
          id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
        }));
        const { unplaced } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
        if (unplaced.length === 0) { lastGood = mid; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      const finalQty = lastGood;
      if (finalQty <= 0) {
        setTimeout(() => toast.error("Não cabe nenhuma unidade — reduz o tamanho ou a margem."), 0);
        return s;
      }
      setTimeout(() => toast.success(`Preenchido com ${finalQty} unidades.`), 0);
      const rects: PackRect[] = Array.from({ length: finalQty }, (_, i) => ({
        id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
      }));
      const { placed } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
      let z = s.zCounter;
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      const newItems: PlacedItem[] = placed.map((p) => {
        z += 1;
        return {
          id: uid(), designId: d.id,
          x: p.x + bb, y: p.y + bb,
          widthCm: p.rotated ? d.cmH : d.cmW,
          heightCm: p.rotated ? d.cmW : d.cmH,
          rotation: p.rotated ? 90 : 0,
          z, locked: d.keepAspect,
        };
      });
      return { ...updateActive([...activePlano.items, ...newItems]), zCounter: z };
    }
    case "DISTRIBUTE_PAGES": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d || a.qty <= 0) return s;
      const block = reviewBlocked(activePlano, d.id);
      if (block) { setTimeout(() => toast.error(block), 0); return s; }
      const border = d.borderMode !== "none" ? mmToCm(d.borderMm) * 2 : 0;
      const gap = mmToCm(s.settings.spacingMm);
      const margin = mmToCm(s.settings.marginMm);
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;

      // perPage capacity via binary search
      let perPage = 0;
      let lo = 1, hi = 500;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rects: PackRect[] = Array.from({ length: mid }, (_, i) => ({
          id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
        }));
        const { unplaced } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
        if (unplaced.length === 0) { perPage = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (perPage <= 0) {
        setTimeout(() => toast.error("Não cabe nenhuma unidade — reduz o tamanho ou a margem."), 0);
        return s;
      }

      let remaining = a.qty;
      let z = s.zCounter;
      const planos = [...s.planos];
      let activeIdx = planos.findIndex((p) => p.id === s.activeId);
      if (activeIdx < 0) activeIdx = 0;

      // Fill current page first (preserve existing items but try to fit some more next to them — keep simple: add to a fresh page if current has items)
      while (remaining > 0) {
        const targetIdx = activeIdx;
        const targetPlano = planos[targetIdx];
        const inThisPage = Math.min(perPage, remaining);

        if (targetPlano.items.length === 0) {
          const rects: PackRect[] = Array.from({ length: inThisPage }, (_, i) => ({
            id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
          }));
          const { placed } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
          const items: PlacedItem[] = placed.map((p) => {
            z += 1;
            return {
              id: uid(), designId: d.id,
              x: p.x + bb, y: p.y + bb,
              widthCm: p.rotated ? d.cmH : d.cmW,
              heightCm: p.rotated ? d.cmW : d.cmH,
              rotation: p.rotated ? 90 : 0,
              z, locked: d.keepAspect,
            };
          });
          planos[targetIdx] = { ...targetPlano, items: [...targetPlano.items, ...items] };
          remaining -= placed.length;
        }

        if (remaining > 0) {
          // create new page
          const newPlano: Plano = { id: uid(), name: `Página ${planos.length + 1}`, items: [] };
          planos.push(newPlano);
          activeIdx = planos.length - 1;
        }
      }
      setTimeout(() => toast.success(`Distribuído ${a.qty} unidades em ${planos.length} plano(s).`), 0);
      return { ...s, planos, activeId: planos[activeIdx].id, zCounter: z };
    }
    case "MOVE_ITEM":
      return updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, x: a.x, y: a.y } : i)));
    case "RESIZE_ITEM":
      return updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, widthCm: Math.max(1, a.widthCm), heightCm: Math.max(1, a.heightCm) } : i)));
    case "ROTATE_ITEM":
      return updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, rotation: (i.rotation + 90) % 360, widthCm: i.heightCm, heightCm: i.widthCm } : i)));
    case "DUP_ITEM": {
      const src = activePlano.items.find((i) => i.id === a.id); if (!src) return s;
      const block = reviewBlocked(activePlano, src.designId);
      if (block) { setTimeout(() => toast.error(block), 0); return s; }
      const z = s.zCounter + 1;
      return { ...updateActive([...activePlano.items, { ...src, id: uid(), x: src.x + 1, y: src.y + 1, z }]), zCounter: z };
    }
    case "DELETE_ITEM":
      return { ...updateActive(activePlano.items.filter((i) => i.id !== a.id)), selectedItemId: null };
    case "TOGGLE_LOCK":
      return updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, locked: !i.locked } : i)));
    case "BRING_FORWARD": {
      const z = s.zCounter + 1;
      return { ...updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, z } : i))), zCounter: z };
    }
    case "SEND_BACK": {
      const minZ = Math.min(...activePlano.items.map((i) => i.z));
      return updateActive(activePlano.items.map((i) => (i.id === a.id ? { ...i, z: minZ - 1 } : i)));
    }
    case "SELECT":
      return { ...s, selectedItemId: a.id };
    case "ADD_PLANO": {
      const id = uid();
      return { ...s, planos: [...s.planos, { id, name: `Página ${s.planos.length + 1}`, items: [] }], activeId: id };
    }
    case "ADD_PDF": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d) return s;
      const margin = mmToCm(s.settings.marginMm);
      const gap = mmToCm(s.settings.spacingMm);
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      const w = +d.cmW.toFixed(2);
      const h = +d.cmH.toFixed(2);
      const z = s.zCounter + 1;

      // Try to fit in the active plano (unless it's exclusive to manual review).
      const canTryActive = !activePlano.manualReview && !d.manualReviewRequested;
      const candidate: PlacedItem = {
        id: "__candidate__", designId: d.id, x: margin, y: margin,
        widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
      };
      const slot = canTryActive
        ? (activePlano.items.length === 0
            ? { x: margin, y: margin }
            : findMaskAwareSlotCm(candidate, activePlano.items, s.designs, a.rollWidthCm, a.planoHeightCm, margin, gap))
        : null;
      if (slot) {
        const item: PlacedItem = {
          id: uid(), designId: d.id, x: slot.x, y: slot.y,
          widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
        };
        return { ...updateActive([...activePlano.items, item]), selectedItemId: item.id, zCounter: z };
      }
      // No room (or restricted plano): create a dedicated plano for the PDF.
      const { x, y } = clampPosWithBorder(margin, margin, w, h, bb, margin, a.rollWidthCm, a.planoHeightCm);
      const item: PlacedItem = {
        id: uid(), designId: d.id, x, y, widthCm: w, heightCm: h, rotation: 0, z, locked: d.keepAspect,
      };
      const id = uid();
      const baseName = d.name.replace(/\.[^.]+$/, "");
      const planoName = `PDF · ${baseName}`.slice(0, 32);
      const newPlano: Plano = { id, name: planoName, items: [item] };
      return { ...s, planos: [...s.planos, newPlano], activeId: id, selectedItemId: item.id, zCounter: z };
    }
    case "ADD_REVIEW_PLANO": {
      const d = s.designs.find((x) => x.id === a.designId);
      if (!d) return s;
      const qty = Math.max(1, d.desiredQty || 1);
      const border = d.borderMode !== "none" ? mmToCm(d.borderMm) * 2 : 0;
      const bb = d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      const gap = mmToCm(s.settings.spacingMm);
      const margin = mmToCm(s.settings.marginMm);

      // Capacity of a single empty page for this design
      let perPage = 0;
      let lo = 1, hi = 500;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rects: PackRect[] = Array.from({ length: mid }, (_, i) => ({
          id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
        }));
        const { unplaced } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
        if (unplaced.length === 0) { perPage = mid; lo = mid + 1; } else { hi = mid - 1; }
      }

      const take = Math.min(perPage, qty);
      let z = s.zCounter;
      let items: PlacedItem[] = [];
      if (take > 0) {
        const rects: PackRect[] = Array.from({ length: take }, (_, i) => ({
          id: `r${i}`, w: d.cmW + border, h: d.cmH + border, rotatable: d.allowAutoRotate,
        }));
        const { placed } = packRects(rects, a.rollWidthCm, a.planoHeightCm, gap, margin, margin);
        items = placed.map((p) => {
          z += 1;
          return {
            id: uid(), designId: d.id,
            x: p.x + bb, y: p.y + bb,
            widthCm: p.rotated ? d.cmH : d.cmW,
            heightCm: p.rotated ? d.cmW : d.cmH,
            rotation: p.rotated ? 90 : 0,
            z, locked: d.keepAspect,
          };
        });
      }

      const id = uid();
      // Count existing manual-review planos for this design to name the new one.
      const reviewSeq = s.planos.filter((p) => p.manualReview && p.reviewDesignId === d.id).length + 1;
      const baseName = d.name.replace(/\.[^.]+$/, "");
      const planoName = `Análise · ${baseName}${reviewSeq > 1 ? ` (${reviewSeq})` : ""}`.slice(0, 32);
      const newPlano: Plano = {
        id, name: planoName, items,
        manualReview: true,
        reviewDesignId: d.id,
        manualReviewFee: a.fee,
      };

      const designs = s.designs.map((x) => x.id === d.id ? {
        ...x,
        status: "warning" as Status,
        manualReviewRequested: true,
        manualReviewFee: a.fee,
        reasons: x.manualReviewRequested ? x.reasons : [
          `✅ Análise manual paga — a equipa vai rever este ficheiro.`,
          ...x.reasons,
        ],
      } : x);

      if (take < qty) {
        setTimeout(() => toast.warning(`Cabe(m) ${take}/${qty} cópia(s) neste rolo. Cria outro rolo de análise se precisares de mais.`), 0);
      } else {
        setTimeout(() => toast.success(`Rolo de análise manual criado · taxa ${a.fee.toFixed(2).replace(".", ",")} €`), 0);
      }

      return { ...s, planos: [...s.planos, newPlano], designs, activeId: id, selectedItemId: null, zCounter: z };
    }
    case "SWITCH_PLANO":
      return { ...s, activeId: a.id, selectedItemId: null };
    case "SET_PLANO_COPIES": {
      const copies = Math.max(1, Math.min(99, Math.floor(a.copies || 1)));
      return { ...s, planos: s.planos.map((p) => (p.id === a.id ? { ...p, copies } : p)) };
    }
    case "REMOVE_PLANO": {
      if (s.planos.length <= 1) return s;
      const removed = s.planos.find((p) => p.id === a.id);
      const next = s.planos.filter((p) => p.id !== a.id);
      // If we removed the last manual-review plano for a design, clear its review flags.
      let designs = s.designs;
      if (removed?.manualReview && removed.reviewDesignId) {
        const stillHas = next.some((p) => p.manualReview && p.reviewDesignId === removed.reviewDesignId);
        if (!stillHas) {
          designs = designs.map((d) =>
            d.id === removed.reviewDesignId
              ? { ...d, manualReviewRequested: false, manualReviewFee: 0 }
              : d,
          );
        }
      }
      return { ...s, planos: next, designs, activeId: next[0].id, selectedItemId: null };
    }
    case "RENAME_PLANO":
      return { ...s, planos: s.planos.map((p) => (p.id === a.id ? { ...p, name: a.name.slice(0, 24) || p.name } : p)) };
    case "SET_PLANO_BG":
      return { ...s, planos: s.planos.map((p) => (p.id === a.id ? { ...p, viewBg: a.viewBg } : p)) };
    case "CLEAR_PLANO":
      return updateActive([]);
    case "PACK_PLANO": {
      const gap = mmToCm(s.settings.spacingMm);
      const margin = mmToCm(s.settings.marginMm);
      const { placed, unplaced, rotatedCount } = packItemsMaskAware(activePlano.items, s.designs, a.rollWidthCm, a.planoHeightCm, margin, gap);
      let newItems: PlacedItem[] = activePlano.items.map((it) => placed.find((pp) => pp.id === it.id) || it);
      // Compact towards the top so "Organizar" never leaves a gap at the top of the roll.
      if (newItems.length) {
        const minY = Math.min(...newItems.map((it) => it.y));
        const offsetY = minY - margin;
        if (offsetY > 1e-3) {
          newItems = newItems.map((it) => ({ ...it, y: it.y - offsetY }));
        }
      }
      if (unplaced.length) setTimeout(() => toast.warning(`${unplaced.length} arte(s) não couberam.`), 0);
      if (rotatedCount) setTimeout(() => toast.info(`${rotatedCount} arte(s) foram rotacionadas para aproveitar melhor o espaço.`), 0);
      return updateActive(newItems);
    }
    case "SET_ZOOM":
      return { ...s, zoom: clamp(a.zoom, 0.3, 2.5) };
    case "UPDATE_SETTINGS":
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case "PASTE_ITEM": {
      const z = s.zCounter + 1;
      const margin = mmToCm(s.settings.marginMm);
      const d = s.designs.find((x) => x.id === a.source.designId);
      if (d) {
        const block = reviewBlocked(activePlano, d.id);
        if (block) { setTimeout(() => toast.error(block), 0); return s; }
      }
      const bb = d && d.borderMode !== "none" ? mmToCm(d.borderMm) : 0;
      const { x, y } = clampPosWithBorder(a.source.x + 1, a.source.y + 1, a.source.widthCm, a.source.heightCm, bb, margin, a.rollWidthCm, a.planoHeightCm);
      const it: PlacedItem = {
        ...a.source,
        id: uid(),
        x, y,
        z,
      };
      return { ...updateActive([...activePlano.items, it]), selectedItemId: it.id, zCounter: z };
    }
    case "LOAD_DRAFT": {
      const valid = a.planos.length ? a.planos : s.planos;
      const active = valid.find((p) => p.id === a.activeId) ? a.activeId : valid[0].id;
      const mergedSettings = { ...(a.settings ?? s.settings), useVisibleArea: true };
      return { ...s, designs: a.designs, planos: valid, activeId: active, zoom: a.zoom, zCounter: a.zCounter, selectedItemId: null, settings: mergedSettings };
    }
    default:
      return s;
  }
}

/* ============================================================
 * Price calculator
 * ============================================================ */
function computePrice(
  planoMeters: number[],
  tiers: Tier[],
  minChargeMeters: number,
): { unit: number; total: number; tier: Tier | null; billable: number; totalMeters: number } {
  const totalMeters = planoMeters.reduce((s, m) => s + m, 0);
  if (tiers.length === 0) return { unit: 0, total: 0, tier: null, billable: 0, totalMeters };
  const sorted = [...tiers].sort((a, b) => a.min_meters - b.min_meters);
  // Regra: o mínimo de cobrança (ex.: 0,50 m) aplica-se APENAS ao primeiro
  // rolo/plano com metros > 0. Os restantes planos são faturados pela medida
  // real utilizada, mesmo que sejam inferiores ao mínimo.
  const firstNonZeroIndex = planoMeters.findIndex((m) => m > 0);
  const billable = planoMeters.reduce((s, m, i) => {
    if (m <= 0) return s;
    const bumped = i === firstNonZeroIndex ? Math.max(m, minChargeMeters) : m;
    return s + bumped;
  }, 0);
  const tier = [...sorted].reverse().find((t) => billable >= t.min_meters) || sorted[0];
  const unit = Number(tier.price_per_meter);
  return { unit, total: +(billable * unit).toFixed(2), tier, billable, totalMeters };
}

/* ============================================================
 * Component
 * ============================================================ */
const Configurator = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editKey = searchParams.get("edit");
  const editingCartKeyRef = useRef<string | null>(editKey);
  const { user } = useAuth();

  const { data: product, isLoading } = useQuery({
    queryKey: ["configurator-product", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("products").select("*").or(`slug.eq.${pgValue(slug ?? "")},id.eq.${pgValue(slug ?? "")}`).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });

  const { data: tiers = [] } = useQuery<Tier[]>({
    queryKey: ["configurator-tiers", product?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("product_volume_tiers").select("min_meters,price_per_meter,label").eq("product_id", product.id);
      if (error) throw error;
      return (data || []) as Tier[];
    },
    enabled: !!product?.id, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [draftStorageProtection, setDraftStorageProtection] = useState<"unknown" | "persistent" | "best-effort">("unknown");
  const storageProtectionRequestedRef = useRef(false);
  const requestDraftStorageProtection = useCallback(() => {
    if (storageProtectionRequestedRef.current) return;
    storageProtectionRequestedRef.current = true;
    const storage = typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { storage?: { persist?: () => Promise<boolean> } }).storage;
    if (!storage?.persist) {
      setDraftStorageProtection("best-effort");
      return;
    }
    // Ask from a customer's file-selection action; denial does not block IndexedDB.
    try {
      void storage.persist()
        .then((persisted) => setDraftStorageProtection(persisted ? "persistent" : "best-effort"))
        .catch(() => setDraftStorageProtection("best-effort"));
    } catch {
      setDraftStorageProtection("best-effort");
    }
  }, []);
  const [validating, setValidating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number; status: "reading" | "validating" | "done" | "rejected" }[]>([]);
  const [clipboard, setClipboard] = useState<PlacedItem | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Snapshot of the previous safe state so the PrintQualityGuard's "Cancel"
  // button can undo the action that triggered the dialog (e.g. revert a
  // rotation/resize that drove the effective DPI below the threshold, or
  // remove a freshly-uploaded low-DPI design the customer chose not to keep).
  const prevSafeStateRef = useRef<{ designs: Design[]; planos: Plano[]; zCounter: number }>({
    designs: [],
    planos: [],
    zCounter: 1,
  });
  const lastSafeStateRef = useRef<{ designs: Design[]; planos: Plano[]; zCounter: number }>({
    designs: [],
    planos: [],
    zCounter: 1,
  });
  const [guardPending, setGuardPending] = useState(false);
  // While the quality guard is NOT pending, advance both refs each render so
  // `prevSafeStateRef` always holds the state from one render before the
  // current one. When the guard opens (next render), the refs freeze, so
  // cancelling reverts to the state right before the action that triggered
  // the warning.
  useEffect(() => {
    if (!guardPending) {
      prevSafeStateRef.current = lastSafeStateRef.current;
      lastSafeStateRef.current = {
        designs: state.designs,
        planos: state.planos,
        zCounter: state.zCounter,
      };
    }
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [rejection, setRejection] = useState<{ name: string; size?: number; kind: "png" | "pdf" | "format" | "size" | "error"; reasons: string[] } | null>(null);
  const [confirmDeleteDesign, setConfirmDeleteDesign] = useState<{ id: string; name: string; placedCount: number } | null>(null);
  const [dpiAcceptances, setDpiAcceptances] = useState<Array<{
    designId: string;
    designName: string;
    kind: "low" | "upscale" | "plano";
    effDpi: number;
    threshold: number;
    acceptedAt: string;
  }>>([]);
  // Termos de aceitação de redução proporcional por arte mais larga que o rolo.
  const [oversizeAcceptances, setOversizeAcceptances] = useState<Array<{
    designId: string;
    fileName: string;
    productName: string;
    rollWidthCm: number;
    originalCmW: number;
    originalCmH: number;
    adjustedCmW: number;
    adjustedCmH: number;
    acceptedAt: string;
    acceptedText: string;
  }>>([]);
  // Fila de artes que ultrapassam a largura útil e aguardam decisão do cliente.
  const [oversizeQueue, setOversizeQueue] = useState<Array<{
    design: Design;
    isPdf: boolean;
    originalCmW: number;
    originalCmH: number;
    adjustedCmW: number;
    adjustedCmH: number;
  }>>([]);
  const [oversizeChecked, setOversizeChecked] = useState(false);
  const [reviewDesignId, setReviewDesignId] = useState<string | null>(null);
  const [openDesignId, setOpenDesignId] = useState<string | null>(null);
  // Estado do diálogo de geração de ficheiro de impressão.
  const [genOpen, setGenOpen] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStep, setGenStep] = useState("");
  const [genPlanoCurrent, setGenPlanoCurrent] = useState(0);
  const [genPlanoTotal, setGenPlanoTotal] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [genElapsedMs, setGenElapsedMs] = useState(0);
  const [genEtaMs, setGenEtaMs] = useState<number | null>(null);
  const genStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!genOpen || genError) {
      setGenElapsedMs(0);
      setGenEtaMs(null);
      genStartRef.current = null;
      return;
    }
    if (genStartRef.current == null) genStartRef.current = Date.now();
    const tick = () => {
      const start = genStartRef.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      setGenElapsedMs(elapsed);
      if (genProgress > 4 && genProgress < 100) {
        // Linear extrapolation from % progress. Round to 5 s so the label
        // doesn't twitch every tick.
        const total = (elapsed / genProgress) * 100;
        const eta = Math.max(0, total - elapsed);
        setGenEtaMs(Math.round(eta / 5000) * 5000);
      } else {
        setGenEtaMs(null);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [genOpen, genError, genProgress]);
  // Optional per-roll file verification (configurable in admin).
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  // Cached per-roll verification decisions PLUS a signature of the planos at
  // confirmation time. If the customer adds/removes/empties a plano after
  // confirming, the signature changes and we discard the cache so the dialog
  // re-opens — otherwise we would charge for rolls that no longer exist.
  const [verifyDecisions, setVerifyDecisions] = useState<
    { decisions: RollVerificationDecision[]; signature: string } | null
  >(null);
  const [verifyPendingSubmit, setVerifyPendingSubmit] = useState(false);
  // On-screen preview quality (does not affect the printed file).
  // "high" = smooth browser rendering (default); "fast" = pixelated, no
  // smoothing — useful on low-end devices for snappier drag/zoom.
  const [previewQuality, setPreviewQuality] = useState<"high" | "fast">(() => {
    if (typeof window === "undefined") return "high";
    return (window.localStorage.getItem("dtf-preview-quality") as "high" | "fast") || "high";
  });
  useEffect(() => {
    try { window.localStorage.setItem("dtf-preview-quality", previewQuality); } catch {}
  }, [previewQuality]);
  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem("dtf-tutorial-seen");
  });
  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    try { window.localStorage.setItem("dtf-tutorial-seen", "1"); } catch {}
  }, []);

  const rollWidthCm = Number(product?.roll_width_cm || 58);
  const planoHeightCm = Number(product?.max_length_cm || 250);
  const minChargeMeters = Number(product?.min_charge_meters || 0.5);
  const productMarginMm = Number((product as any)?.inner_margin_mm ?? 5);

  // Manual review settings (loaded from store_settings)
  const { settings: storeKv } = useStoreSettings();
  const { data: visualSettings } = useVisualSettings();
  const manualReviewSettings = useMemo(() => ({
    enabled: storeKv?.manual_review_enabled !== false, // default true
    pricePerM2: Number(storeKv?.manual_review_price_per_m2 ?? 1),
    minPrice: Number(storeKv?.manual_review_min_price ?? 1),
    description: String(
      storeKv?.manual_review_description ??
      "O ficheiro pode mesmo assim ser recusado pela equipa após análise. Nesse caso será pedido um novo ficheiro e a taxa de análise não é reembolsada.",
    ),
    alphaBlock: Number(storeKv?.pdf_alpha_block_threshold ?? 0.99),
    alphaWarn: Number(storeKv?.pdf_alpha_warn_threshold ?? 0.92),
    pdfAutoAnalysis: storeKv?.pdf_auto_analysis_enabled !== false, // default true
  }), [storeKv]);

  // Optional per-roll verification (independent of the mandatory low-quality manual review).
  const rollVerification = useMemo(() => ({
    // Default: enabled. Admin can explicitly disable by saving `false`.
    enabled: storeKv?.roll_verification_enabled !== false,
    pricePerRoll: Number(storeKv?.roll_verification_price_per_roll ?? 1),
    description: String(
      storeKv?.roll_verification_description ??
      "Antes de enviarmos para impressão, a nossa equipa pode verificar manualmente cada rolo (resolução, transparência, contornos, legibilidade). A taxa cobre apenas a verificação técnica e o aviso prévio caso a qualidade não seja suficiente — não inclui correção, redesenho nem substituição da arte. Se detetarmos um problema, avisamos-te antes de imprimir e podes enviar um novo ficheiro.",
    ),
    declineWarning: String(
      storeKv?.roll_verification_decline_warning ??
      "Se optares por não verificar este rolo, a loja não se responsabiliza por problemas de qualidade decorrentes do ficheiro (baixa resolução, perda de detalhe, contornos, cores ou legibilidade). O ficheiro será impresso tal como foi entregue, sem direito a reimpressão ou reembolso por motivos de qualidade da arte enviada.",
    ),
  }), [storeKv]);

  const calcManualReviewFee = useCallback((cmW: number, cmH: number) => {
    const m2 = Math.max(0, (cmW * cmH) / 10000);
    const raw = m2 * manualReviewSettings.pricePerM2;
    return Math.max(manualReviewSettings.minPrice, +raw.toFixed(2));
  }, [manualReviewSettings.pricePerM2, manualReviewSettings.minPrice]);

  // Sync product-defined inner margin into settings so packing/canvas use it
  useEffect(() => {
    if (state.settings.marginMm !== productMarginMm) {
      dispatch({ type: "UPDATE_SETTINGS", patch: { marginMm: productMarginMm } });
    }
     
  }, [productMarginMm, state.settings.marginMm]);

  const onFiles = useCallback(async (files: FileList | File[]) => {
    setValidating(true);
    const arr = Array.from(files);
    if (arr.length === 0) { setValidating(false); return; }
    requestDraftStorageProtection();
    setUploadProgress(arr.map((f) => ({ name: f.name, pct: 0, status: "reading" })));
    const out: Design[] = [];
    const pdfDesignIds: string[] = [];
    const oversizeBatch: Array<{
      design: Design;
      isPdf: boolean;
      originalCmW: number;
      originalCmH: number;
      adjustedCmW: number;
      adjustedCmH: number;
    }> = [];
    let rejected = 0;
    for (let idx = 0; idx < arr.length; idx++) {
      const f = arr[idx];
      const updateProg = (pct: number, status: "reading" | "validating" | "done" | "rejected") =>
        setUploadProgress((prev) => prev.map((p, i) => (i === idx ? { ...p, pct, status } : p)));

      const isPng = /image\/png/.test(f.type) || /\.png$/i.test(f.name);
      const isPdf = /application\/pdf/.test(f.type) || /\.pdf$/i.test(f.name);
      if (!isPng && !isPdf) {
        rejected++; updateProg(100, "rejected");
        setRejection({ name: f.name, size: f.size, kind: "format", reasons: ["Apenas aceitamos PNG ou PDF.", "Converte para PNG-24 a 300 dpi com fundo transparente."] });
        continue;
      }
      if (f.size > 400 * 1024 * 1024) {
        rejected++; updateProg(100, "rejected");
        setRejection({ name: f.name, size: f.size, kind: "size", reasons: ["O ficheiro ultrapassa 400 MB.", "Comprime o PDF ou exporta como PNG-24 a 300 dpi."] });
        continue;
      }

      updateProg(30, "validating");
      try {
        const v = isPng
          ? await validatePng(f)
          : await validatePdf(
              f,
              { maxWidthCm: rollWidthCm, maxHeightCm: planoHeightCm },
              manualReviewSettings.pdfAutoAnalysis
                ? { block: manualReviewSettings.alphaBlock, warn: manualReviewSettings.alphaWarn }
                : { block: 1.01, warn: 1.01 },
            );
        // Hard-block: not reviewable, OR manual review disabled, OR we don't have geometry to compute the fee.
        const canReview = !!(v as any).reviewable && manualReviewSettings.enabled && v.widthPx > 0 && v.heightPx > 0;
        if (v.status === "blocked" && !canReview) {
          rejected++; updateProg(100, "rejected");
          setRejection({ name: f.name, size: f.size, kind: isPdf ? "pdf" : "png", reasons: v.reasons.length ? v.reasons : ["Ficheiro rejeitado."] });
          continue;
        }
        updateProg(100, "done");
        const { previewUrl, ...rest } = v as any;
        const rawUrl = isPdf ? (previewUrl || "") : URL.createObjectURL(f);
        let trimmedUrl: string | undefined;
        let trimmedWidthPx: number | undefined;
        let trimmedHeightPx: number | undefined;
        let finalFile: File = f;
        let trimmedMask: AlphaMask | undefined;
        // Never trim PDFs: the raster preview has arbitrary pixel dimensions
        // and feeding it back into the sizing pipeline collapses the real PDF
        // dimensions (e.g. 57.5×250 cm) to the preview's px size at 300 dpi
        // (≈4.67×20.22 cm). PNGs continue to use trim as before.
        if (rawUrl && rest.hasAlpha && !isPdf) {
          const trimmed = await trimTransparent(rawUrl);
          if (trimmed && trimmed.trimmed) {
            trimmedUrl = trimmed.url;
            trimmedWidthPx = trimmed.widthPx;
            trimmedHeightPx = trimmed.heightPx;
            trimmedMask = await createAlphaMask(trimmed.url);
            if (isPng) finalFile = new File([trimmed.blob], f.name.replace(/\.png$/i, "") + ".png", { type: "image/png" });
          }
        }
        const originalMask = rawUrl ? await createAlphaMask(rawUrl) : undefined;
        const activeUrl = state.settings.useVisibleArea && trimmedUrl ? trimmedUrl : rawUrl;
        const activeW = state.settings.useVisibleArea && trimmedWidthPx ? trimmedWidthPx : rest.widthPx;
        const activeH = state.settings.useVisibleArea && trimmedHeightPx ? trimmedHeightPx : rest.heightPx;
        const alphaMask = state.settings.useVisibleArea && trimmedMask ? trimmedMask : originalMask;

        // default cm = tamanho físico real declarado no ficheiro.
        // Usamos o DPI declarado para preservar o tamanho real da arte
        // (ex.: 5,98×5,45 cm a 72 dpi mantém-se 5,98×5,45 cm). Se o ficheiro
        // não declarar DPI, usamos 300 dpi apenas como referência neutra para
        // sizing — mas o design guarda `dpi: null` para o PrintQualityGuard
        // exigir o termo de responsabilidade (Case A).
        const sizingDpi = rest.dpi && rest.dpi > 0 ? rest.dpi : 300;
        const naturalCmW = activeW ? pxToCm(activeW, sizingDpi) : state.settings.defaultCmW;
        const naturalCmH = activeH ? pxToCm(activeH, sizingDpi) : state.settings.defaultCmH;
        // Auto-fit: arts larger than the usable print area (roll width × plano
        // height, minus inner margin) are proportionally downscaled so they
        // never exceed the printable frame. The user is warned explicitly.
        const marginCmLocal = (productMarginMm || 0) / 10;
        // Hard limit is the physical roll/plano size. The internal safety
        // margin is only used for arranging items inside the plano — it must
        // not block uploads, otherwise an art that fits the roll edge-to-edge
        // gets falsely rejected because of a 1 mm safety margin.
        const availW = Math.max(1, rollWidthCm);
        const availH = Math.max(1, planoHeightCm);
        // Arte mais larga que a largura útil do rolo: em vez de bloquear, o
        // sistema propõe uma redução proporcional que o cliente tem de aceitar
        // explicitamente num modal dedicado (registado depois no pedido).
        const isOversize = naturalCmW > availW + 1e-3;
        let finalCmW = naturalCmW;
        let finalCmH = naturalCmH;
        let resizedToFit = false;
        const scale = Math.min(availW / naturalCmW, availH / naturalCmH, 1);
        if (scale < 1 && isFinite(scale) && scale > 0) {
          finalCmW = naturalCmW * scale;
          finalCmH = naturalCmH * scale;
          resizedToFit = true;
        }
        const cmW = +finalCmW.toFixed(2);
        const cmH = +finalCmH.toFixed(2);
        if (resizedToFit && !isOversize) {
          toast.warning(
            `"${f.name}" foi redimensionada de ${naturalCmW.toFixed(1)}×${naturalCmH.toFixed(1)} cm para ${cmW.toFixed(1)}×${cmH.toFixed(1)} cm para caber na área de impressão (${availW.toFixed(0)}×${availH.toFixed(0)} cm).`,
            { duration: 8000 },
          );
        }
        const newDesign: Design = {
          id: uid(), name: f.name, url: activeUrl, originalUrl: rawUrl, trimmedUrl,
          file: finalFile,
          originalFile: f,
          widthPx: activeW, heightPx: activeH,
          originalWidthPx: rest.widthPx, originalHeightPx: rest.heightPx,
          trimmedWidthPx, trimmedHeightPx,
          alphaMask, originalMask, trimmedMask,
          dpi: rest.dpi, hasAlpha: rest.hasAlpha, status: rest.status, reasons: rest.reasons,
          cmW, cmH, keepAspect: true,
          desiredQty: 1, allowAutoRotate: true,
          borderMode: "none", borderMm: 2,
          reviewable: !!(v as any).reviewable && manualReviewSettings.enabled,
        };
        if (isOversize) {
          // Fica em espera — só é adicionado quando o cliente aceitar o termo.
          oversizeBatch.push({
            design: newDesign,
            isPdf,
            originalCmW: naturalCmW,
            originalCmH: naturalCmH,
            adjustedCmW: cmW,
            adjustedCmH: cmH,
          });
          continue;
        }
        out.push(newDesign);
        if (isPdf) {
          // Track the just-pushed design id so each PDF gets its own dedicated plano
          pdfDesignIds.push(out[out.length - 1].id);
        }
      } catch (e: any) {
        rejected++; updateProg(100, "rejected");
        setRejection({ name: f.name, size: f.size, kind: "error", reasons: [e?.message || "Erro inesperado."] });
      }
    }
    if (out.length) {
      dispatch({ type: "ADD_DESIGNS", designs: out });
      setOpenDesignId(out[out.length - 1].id);
      // Each PDF tries to fit in the active plano; if not, a dedicated plano is created.
      for (const designId of pdfDesignIds) {
        dispatch({ type: "ADD_PDF", designId, rollWidthCm, planoHeightCm });
      }
      toast.success(`${out.length} ficheiro(s) aceite(s).${rejected ? ` ${rejected} rejeitado(s).` : ""}`);
    }
    if (oversizeBatch.length) {
      setOversizeQueue((prev) => [...prev, ...oversizeBatch]);
      setOversizeChecked(false);
    }
    setValidating(false);
    window.setTimeout(() => setUploadProgress([]), 2500);
  }, [rollWidthCm, planoHeightCm, state.settings.useVisibleArea, state.settings.defaultCmW, state.settings.defaultCmH, manualReviewSettings.alphaBlock, manualReviewSettings.alphaWarn, manualReviewSettings.enabled, requestDraftStorageProtection]);

  // Toggle visible area: swap urls on all designs
  useEffect(() => {
    state.designs.forEach((d) => {
      const wantUrl = state.settings.useVisibleArea && d.trimmedUrl ? d.trimmedUrl : d.originalUrl;
      const wantW = state.settings.useVisibleArea && d.trimmedWidthPx ? d.trimmedWidthPx : d.originalWidthPx;
      const wantH = state.settings.useVisibleArea && d.trimmedHeightPx ? d.trimmedHeightPx : d.originalHeightPx;
      const wantMask = state.settings.useVisibleArea && d.trimmedMask ? d.trimmedMask : d.originalMask;
      if (d.url !== wantUrl || d.alphaMask !== wantMask) {
        dispatch({ type: "UPDATE_DESIGN", id: d.id, patch: { url: wantUrl, widthPx: wantW, heightPx: wantH, alphaMask: wantMask } });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.useVisibleArea]);

  const plano = state.planos.find((p) => p.id === state.activeId)!;
  const selected = plano.items.find((i) => i.id === state.selectedItemId) || null;

  const planoMeters = useMemo(() => {
    return state.planos.map((p) => {
      if (p.items.length === 0) return 0;
      const maxBottom = usedPlanoHeightCm(p.items, state.designs, planoHeightCm);
      const copies = Math.max(1, p.copies || 1);
      return (maxBottom / 100) * copies;
    });
  }, [state.planos, state.designs, planoHeightCm]);
  const totalMeters = useMemo(() => planoMeters.reduce((s, m) => s + m, 0), [planoMeters]);
  const price = computePrice(planoMeters, tiers, minChargeMeters);
  // Fees from manual review: one fee per dedicated review plano that still has items.
  // Each manual-review plano is billed individually so the customer pays per "rolo".
  const manualReviewLines = useMemo(() => {
    return state.planos
      .filter((p) => p.manualReview && p.items.length > 0 && (p.manualReviewFee || 0) > 0)
      .map((p) => {
        const d = p.reviewDesignId ? state.designs.find((x) => x.id === p.reviewDesignId) : undefined;
        const copies = Math.max(1, p.copies || 1);
        const feeBase = Number(p.manualReviewFee || 0);
        return {
          planoId: p.id,
          planoName: p.name,
          designId: p.reviewDesignId || "",
          designName: d?.name || p.name,
          fee: +(feeBase * copies).toFixed(2),
          feeBase,
          copies,
        };
      });
  }, [state.planos, state.designs]);
  const manualReviewTotal = useMemo(
    () => +manualReviewLines.reduce((s, l) => s + l.fee, 0).toFixed(2),
    [manualReviewLines],
  );
  // Signature of all planos eligible for verification (items>0 and not
  // manual-review). If this changes, any cached verifyDecisions become stale.
  const verifyPlanosSignature = useMemo(() => {
    return state.planos
      .filter((p) => p.items.length > 0 && !p.manualReview)
      .map((p) => `${p.id}:${p.items.length}:${p.copies || 1}`)
      .join("|");
  }, [state.planos]);
  // Discard cached decisions whenever the planos set changes — the customer
  // must reconfirm so we never charge for rolls that no longer exist.
  useEffect(() => {
    if (verifyDecisions && verifyDecisions.signature !== verifyPlanosSignature) {
      setVerifyDecisions(null);
    }
  }, [verifyPlanosSignature, verifyDecisions]);
  // Optional per-roll verification fees (snapshotted on add-to-cart decision).
  const verificationLines = useMemo(() => {
    if (!verifyDecisions) return [] as RollVerificationDecision[];
    // Defensive: drop any decision whose plano no longer exists / no longer
    // has items, even if the signature check above hasn't fired yet.
    const liveIds = new Set(
      state.planos
        .filter((p) => p.items.length > 0 && !p.manualReview)
        .map((p) => p.id),
    );
    return verifyDecisions.decisions.filter(
      (d) => d.verify && d.fee > 0 && liveIds.has(d.planoId),
    );
  }, [verifyDecisions, state.planos]);
  const verificationTotal = useMemo(
    () => +verificationLines.reduce((s, l) => s + l.fee, 0).toFixed(2),
    [verificationLines],
  );
  const grandTotal = +(price.total + manualReviewTotal + verificationTotal).toFixed(2);

  // Active plan utilization
  const planoUtilization = useMemo(() => {
    if (plano.items.length === 0) return { used: 0, total: 0, pct: 0, height: 0 };
    const copies = Math.max(1, plano.copies || 1);
    const singleMeters = planoMeters[state.planos.indexOf(plano)] / copies;
    const totalArea = rollWidthCm * singleMeters * 100; // cm² (single copy)
    const usedArea = plano.items.reduce((s, it) => s + it.widthCm * it.heightCm, 0);
    const height = usedPlanoHeightCm(plano.items, state.designs, planoHeightCm);
    return { used: usedArea, total: totalArea, pct: totalArea > 0 ? Math.round((usedArea / totalArea) * 100) : 0, height };
  }, [plano, planoMeters, state.planos, state.designs, rollWidthCm, planoHeightCm]);

  const totalItems = useMemo(() => state.planos.reduce((s, p) => s + p.items.length, 0), [state.planos]);
  const distinctDesigns = state.designs.length;
  const unitsRequested = state.designs.reduce((s, d) => s + (d.desiredQty || 0), 0);

  // Detect alerts
  const alerts = useMemo(() => {
    const out: { kind: "warn" | "error" | "info"; msg: string }[] = [];
    // Only real visible artwork overlap blocks the order. Transparent/blank
    // space inside an item's rectangle can be reused by another art.
    let overlapping = 0;
    let anyHasBorder = false;
    const items = plano.items;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const da = state.designs.find((x) => x.id === items[i].designId);
        const db = state.designs.find((x) => x.id === items[j].designId);
        if (hasRealArtOverlap(items[i], items[j], state.designs, 0)) {
          overlapping++;
          if (getBorderCm(da) > 0 || getBorderCm(db) > 0) anyHasBorder = true;
          break;
        }
      }
    }
    if (overlapping) {
      out.push({
        kind: "error",
        msg: anyHasBorder
          ? "Contornos sobrepostos: o recorte irá ser destruído. Reorganiza as artes para respeitar o espaço do contorno antes de avançar."
          : "Artes sobrepostas: o ficheiro de impressão ficará com peças coladas/em cima umas das outras. Reorganiza para avançar.",
      });
    }
    // Out of bounds
    const margin = mmToCm(state.settings.marginMm);
    const oob = items.some((it) => it.x < -0.01 || it.y < -0.01 || it.x + it.widthCm > rollWidthCm + 0.01 || it.y + it.heightCm > planoHeightCm + 0.01);
    if (oob) out.push({ kind: "error", msg: "Existem artes fora da área útil." });
    // Designs loaded but not placed
    const used = new Set(state.planos.flatMap((p) => p.items.map((i) => i.designId)));
    const unused = state.designs.filter((d) => !used.has(d.id) && d.status !== "blocked").length;
    if (unused) out.push({ kind: "info", msg: `${unused} design(s) carregado(s) ainda não adicionados ao rolo.` });
    // Empty plano
    const empty = state.planos.filter((p) => p.items.length === 0).length;
    if (empty && state.planos.length > 1) out.push({ kind: "warn", msg: `${empty} plano(s) vazio(s) — não serão considerados no pedido.` });
    return out;
  }, [plano, state.planos, state.designs, rollWidthCm, planoHeightCm, state.settings.marginMm]);

  /* Drafts */
  // In edit mode we read/write the per-cart-item snapshot so the autosave keeps
  // the saved state aligned with what is going back into the cart.
  const draftKey = editKey
    ? `dtf-edit:${editKey}`
    : product?.id ? `dtf-draft:${product.id}` : null;
  const [draftReadyKey, setDraftReadyKey] = useState<string | null>(null);
  const [draftLoadFailedKey, setDraftLoadFailedKey] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latestDraftRef = useRef<{ key: string; state: State; revision: number } | null>(null);
  const draftRevisionRef = useRef(0);
  const queuedDraftVersionRef = useRef<string | null>(null);
  const draftWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const queueDraftWrite = useCallback((snapshot: { key: string; state: State; revision: number }) => {
    const version = `${snapshot.key}:${snapshot.revision}`;
    if (queuedDraftVersionRef.current === version) return draftWriteQueueRef.current;
    queuedDraftVersionRef.current = version;
    const write: Promise<void> = draftWriteQueueRef.current
      .catch(() => {})
      .then(() => writeConfiguratorDraft(snapshot.key, snapshot.state));
    draftWriteQueueRef.current = write;
    void write.catch(() => {
      if (queuedDraftVersionRef.current === version) queuedDraftVersionRef.current = null;
    });
    return write;
  }, []);

  const queueDraftDelete = useCallback((key: string) => {
    const deletion = draftWriteQueueRef.current
      .catch(() => {})
      .then(() => deleteConfiguratorDraft(key));
    draftWriteQueueRef.current = deletion;
    return deletion;
  }, []);

  const persistDraftSnapshot = useCallback((snapshot: { key: string; state: State; revision: number }) => {
    return queueDraftWrite(snapshot).then(() => {
      if (latestDraftRef.current?.key === snapshot.key && latestDraftRef.current.revision === snapshot.revision) {
        setDraftSaveStatus("saved");
      }
    }).catch((error) => {
      if (latestDraftRef.current?.key === snapshot.key && latestDraftRef.current.revision === snapshot.revision) {
        setDraftSaveStatus("error");
      }
      throw error;
    });
  }, [queueDraftWrite]);

  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    setDraftReadyKey(null);
    setDraftLoadFailedKey(null);
    setDraftSaveStatus("idle");
    latestDraftRef.current = null;
    dispatch({ type: "RESET_DRAFT" });
    readConfiguratorDraft(draftKey).then((d) => {
      if (cancelled || !d) return;
      if (d?.planos?.length) {
        const restoredDesigns = restoreDraftDesigns(d.designs);
        dispatch({ type: "LOAD_DRAFT", designs: restoredDesigns, planos: d.planos, activeId: d.activeId, zoom: d.zoom ?? 1, zCounter: d.zCounter ?? 1, settings: d.settings });
        if (restoredDesigns.length || d.planos.some((p: Plano) => p.items.length > 0)) toast.success("Rascunho restaurado.");
      }
    }).catch((e) => {
      if (cancelled) return;
      console.warn("draft read", e);
      setDraftLoadFailedKey(draftKey);
      setDraftSaveStatus("error");
      toast.error("Não foi possível recuperar o rascunho guardado neste dispositivo. Atualize a página para tentar novamente.");
    }).finally(() => { if (!cancelled) setDraftReadyKey(draftKey); });
    return () => { cancelled = true; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || draftReadyKey !== draftKey || draftLoadFailedKey === draftKey) return;
    const hasWork = state.designs.length > 0 || state.planos.some((p) => p.items.length > 0);
    if (!hasWork) {
      latestDraftRef.current = null;
      setDraftSaveStatus("idle");
      void queueDraftDelete(draftKey);
      return;
    }
    const snapshot = { key: draftKey, state, revision: ++draftRevisionRef.current };
    latestDraftRef.current = snapshot;
    setDraftSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      persistDraftSnapshot(snapshot).catch((e) => console.warn("draft save", e));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draftKey, draftReadyKey, draftLoadFailedKey, state, queueDraftDelete, persistDraftSnapshot]);

  // Flush the latest editor state as soon as a mobile browser backgrounds or
  // navigates away. The queued writer keeps this snapshot behind any earlier
  // IndexedDB transaction, preventing an older debounce from overwriting it.
  useEffect(() => {
    const flushLatestDraft = () => {
      const snapshot = latestDraftRef.current;
      if (snapshot) persistDraftSnapshot(snapshot).catch((e) => console.warn("draft flush", e));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushLatestDraft();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushLatestDraft);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushLatestDraft);
    };
  }, [persistDraftSnapshot]);

  // After restore: regenerate PDF preview blob URLs (the originals are gone).
  const pdfRehydrated = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!draftKey || draftReadyKey !== draftKey || draftLoadFailedKey === draftKey) return;
    state.designs.forEach((d) => {
      const isPdf = d.file && (d.file.type === "application/pdf" || /\.pdf$/i.test(d.name));
      if (!isPdf) return;
      // Only rehydrate when url is missing (set by restoreDraftDesigns for PDFs)
      if (d.url) return;
      if (pdfRehydrated.current.has(d.id)) return;
      pdfRehydrated.current.add(d.id);
      renderPdfPreviewBlobUrl(d.file).then((res) => {
        if (!res.url) return;
        dispatch({ type: "UPDATE_DESIGN", id: d.id, patch: { url: res.url, originalUrl: res.url } });
      });
    });
  }, [draftKey, draftReadyKey, draftLoadFailedKey, state.designs]);

  /* Keyboard shortcuts */
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null; if (!t) return false;
      const tag = t.tagName; return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const sel = plano.items.find((i) => i.id === state.selectedItemId);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "c" && sel) { setClipboard(sel); toast.success("Copiado"); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === "v" && clipboard) {
        if (state.designs.find((d) => d.id === clipboard.designId)) { dispatch({ type: "PASTE_ITEM", source: clipboard, rollWidthCm, planoHeightCm }); toast.success("Colado"); }
        else toast.error("Design original já não está disponível");
        e.preventDefault(); return;
      }
      if (mod && e.key.toLowerCase() === "d" && sel) { dispatch({ type: "DUP_ITEM", id: sel.id }); e.preventDefault(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { dispatch({ type: "DELETE_ITEM", id: sel.id }); e.preventDefault(); return; }
      const step = e.shiftKey ? 0.1 : 1;
      if (sel) {
        const mCm = mmToCm(state.settings.marginMm);
        const selDesign = state.designs.find((d) => d.id === sel.designId);
        const bb = selDesign && selDesign.borderMode !== "none" ? mmToCm(selDesign.borderMm) : 0;
        const moveTo = (nx: number, ny: number) => {
          const { x, y } = clampPosWithBorder(nx, ny, sel.widthCm, sel.heightCm, bb, mCm, rollWidthCm, planoHeightCm);
          dispatch({ type: "MOVE_ITEM", id: sel.id, x, y });
        };
        if (e.key === "ArrowLeft")  { moveTo(sel.x - step, sel.y); e.preventDefault(); }
        if (e.key === "ArrowRight") { moveTo(sel.x + step, sel.y); e.preventDefault(); }
        if (e.key === "ArrowUp")    { moveTo(sel.x, sel.y - step); e.preventDefault(); }
        if (e.key === "ArrowDown")  { moveTo(sel.x, sel.y + step); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plano.items, state.selectedItemId, state.designs, clipboard, rollWidthCm, planoHeightCm]);

  useEffect(() => {
    const onClick = () => setCtxMenu(null);
    if (ctxMenu) { window.addEventListener("click", onClick); return () => window.removeEventListener("click", onClick); }
  }, [ctxMenu]);

  // Avisar o utilizador se tentar fechar/recarregar durante a geração.
  useEffect(() => {
    if (!genOpen || genError) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [genOpen, genError]);

  // Keep the screen awake only while large print files are being generated.
  // Mobile browsers may release the lock when the tab is backgrounded; try
  // again when the customer returns, and always release it on success/error.
  useEffect(() => {
    if (!genOpen || genError || typeof navigator === "undefined") return;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    }).wakeLock;
    if (!wakeLock?.request) return;

    let disposed = false;
    let requesting = false;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || requesting || sentinel || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const lock = await wakeLock.request("screen");
        if (disposed) {
          await lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          sentinel = null;
          if (!disposed && document.visibilityState === "visible") void acquire();
        }, { once: true });
      } catch {
        // Unsupported, denied, or battery-restricted browsers continue normally.
      } finally {
        requesting = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void acquire();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const lock = sentinel;
      sentinel = null;
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
  }, [genOpen, genError]);

  const handleAddToCart = async () => {
    if (totalMeters <= 0) { toast.error("Adiciona pelo menos uma arte."); return; }
    // Extra guards: never allow an entry with zero-content planos to reach the
    // cart — this is what creates the "— 0.0 m" phantom items reported by
    // customers whose IDB cache was later evicted.
    if (!state.planos.some((p) => (p.items?.length || 0) > 0)) {
      toast.error("Nenhum plano tem artes. Adiciona pelo menos uma arte antes de continuar.");
      return;
    }
    // Conta planos com itens para o progresso.
    const planosComItens = state.planos.filter((p) => p.items.length > 0);
    const totalPlanos = planosComItens.length;
    setGenError(null);
    setGenPlanoTotal(totalPlanos);
    setGenPlanoCurrent(0);
    setGenStep("A preparar artes…");
    setGenProgress(3);
    setGenOpen(true);
    try {
      const editing = editingCartKeyRef.current;
      const cartItemKey = editing || `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Render each plano to a high-quality PNG (preserving max DPI) and a JPG preview.
      const renderedPlanos: Array<{
        index: number;
        name: string;
        copies: number;
        png: Blob;
        preview: Blob;
        widthPx: number;
        heightPx: number;
        dpi: number;
        bboxCm: { widthCm: number; heightCm: number };
      }> = [];
      let renderDone = 0;
      for (let i = 0; i < state.planos.length; i++) {
        const p = state.planos[i];
        if (!p.items.length) continue;
        setGenPlanoCurrent(renderDone + 1);
        setGenStep(`A renderizar plano ${renderDone + 1} de ${totalPlanos}…`);
        const out = await renderPlanoFileWithRetry({
          rollWidthCm: rollWidthCm,
          planoHeightCm: planoHeightCm,
          items: p.items.map((it) => {
            const d = state.designs.find((x) => x.id === it.designId);
            const hasB = !!(d && d.borderMode !== "none");
            return {
              designId: it.designId,
              x: it.x,
              y: it.y,
              widthCm: it.widthCm,
              heightCm: it.heightCm,
              rotation: it.rotation,
              borderMm: hasB ? d!.borderMm : 0,
              borderColor: hasB
                ? (d!.borderColor ?? (d!.borderMode === "white" ? "#ffffff" : "#000000"))
                : undefined,
            };
          }),
          designs: state.designs.map((d) => ({
            id: d.id,
            originalUrl: d.url,
            originalWidthPx: d.originalWidthPx,
            originalHeightPx: d.originalHeightPx,
            dpi: d.dpi,
          })),
        });
        renderedPlanos.push({ index: i, name: p.name, copies: Math.max(1, p.copies || 1), ...out });
        renderDone += 1;
        setGenProgress(5 + Math.round((renderDone / Math.max(1, totalPlanos)) * 45));
        // Give WebKit a moment to release intermediate canvas memory before the
        // next plano. Critical on iOS Safari where consecutive giant canvases
        // trigger OOM crashes ("A problem occurred with this webpage").
        await new Promise((r) => setTimeout(r, 50));
      }
      if (renderedPlanos.length === 0) {
        setGenOpen(false);
        toast.error("Não foi possível renderizar nenhum plano. Verifica as artes e tenta de novo.");
        return;
      }
      // Per-plano print PDFs (one file per plano). Each PDF is single-page and
      // uses the exact same rendered print PNG as the preview pipeline, so the
      // PDF cannot diverge from the layout seen by the customer.
      const planoPdfs = new Map<number, Blob>();
      let pdfDone = 0;
      for (let idx = 0; idx < state.planos.length; idx++) {
        const p = state.planos[idx];
        if (!p.items.length) continue;
        setGenPlanoCurrent(pdfDone + 1);
        setGenStep(`A gerar PDF do plano ${pdfDone + 1} de ${totalPlanos}…`);
        let pdfBlob: Blob | undefined;
        const rendered = renderedPlanos.find((rp) => rp.index === idx);
        if (rendered) {
          // Preferred path: element-by-element PDF built from the ORIGINAL
          // customer files. PDFs uploaded by the customer stay vectorial;
          // PNG/JPG are embedded at native resolution. The layout mirrors the
          // configurator canvas exactly (position, size, rotation, border).
          const usedDesigns = new Map<string, typeof state.designs[number]>();
          for (const it of p.items) {
            const d = state.designs.find((x) => x.id === it.designId);
            if (d) usedDesigns.set(d.id, d);
          }
          const fidelityDesigns = Array.from(usedDesigns.values())
            .map((d) => ({
              id: d.id,
              file: (d.originalFile ?? d.file) as Blob | undefined,
              originalWidthPx: d.originalWidthPx,
              originalHeightPx: d.originalHeightPx,
            }))
            .filter((d): d is { id: string; file: Blob; originalWidthPx: number; originalHeightPx: number } => !!d.file);
          if (fidelityDesigns.length === usedDesigns.size) {
            try {
              pdfBlob = await renderOrderPdfFromOriginals(
                [
                  {
                    index: 1,
                    name: rendered.name,
                    copies: rendered.copies,
                    planoCm: {
                      widthCm: rollWidthCm,
                      heightCm: rendered.bboxCm.heightCm,
                    },
                    items: p.items.map((it) => {
                      const d = state.designs.find((x) => x.id === it.designId);
                      const hasB = !!(d && d.borderMode !== "none");
                      return {
                        designId: it.designId,
                        x: it.x,
                        y: it.y,
                        widthCm: it.widthCm,
                        heightCm: it.heightCm,
                        rotation: it.rotation,
                        borderMm: hasB ? d!.borderMm : 0,
                        borderColor: hasB
                          ? (d!.borderColor ?? (d!.borderMode === "white" ? "#ffffff" : "#000000"))
                          : undefined,
                      };
                    }),
                  },
                ],
                fidelityDesigns,
              );
            } catch (err) {
              console.warn(`renderOrderPdfFromOriginals failed for plano ${idx}, falling back to raster`, err);
            }
          }
          // Fallback: single-page raster PDF from the preview PNG. Used only
          // when originals are missing or embedding fails — never blocks the
          // order from being placed.
          if (!pdfBlob) {
          try {
            pdfBlob = await renderOrderPdf([
              {
                index: 1,
                name: rendered.name,
                copies: rendered.copies,
                png: rendered.png,
                widthCm: rendered.bboxCm.widthCm,
                heightCm: rendered.bboxCm.heightCm,
                dpi: rendered.dpi,
              },
            ]);
          } catch (err) {
            console.warn(`renderOrderPdf failed for plano ${idx}`, err);
          }
          }
        }
        if (pdfBlob) planoPdfs.set(idx, pdfBlob);
        pdfDone += 1;
        setGenProgress(50 + Math.round((pdfDone / Math.max(1, totalPlanos)) * 45));
      }
      setGenStep("A guardar ficheiros…");
      setGenProgress(96);
      await putPending(cartItemKey, {
        cartItemKey,
        planos: renderedPlanos.map((p) => ({ ...p, pdf: planoPdfs.get(p.index) })),
        originals: (() => {
          // De-dupe by name+size+lastModified so the same uploaded file is
          // stored once even if it appears in multiple planos.
          const seen = new Set<string>();
          const out: Array<{ name: string; type: string; size: number; blob: Blob }> = [];
          for (const d of state.designs) {
            // Use the untouched upload so the bucket stores byte-for-byte the
            // file the customer sent (preserves DPI/pHYs and full resolution).
            const f = d.originalFile ?? d.file;
            if (!f) continue;
            const key = `${f.name}|${(f as any).size ?? ""}|${(f as any).lastModified ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ name: f.name, type: f.type || "application/octet-stream", size: (f as any).size ?? 0, blob: f });
          }
          return out;
        })(),
        createdAt: new Date().toISOString(),
      });
      setGenStep("A finalizar…");
      setGenProgress(99);
      // Re-read pending payload from IndexedDB and validate every plano/original
      // is present and non-empty BEFORE adding to the cart. This guarantees the
      // checkout can trust `readyForCheckout` and never creates an order for a
      // design that failed to render on this device.
      const verify = await getPending(cartItemKey);
      const expectedPlanos = renderedPlanos.length;
      const validPlanos =
        !!verify &&
        verify.planos.length === expectedPlanos &&
        verify.planos.every(
          (p) => p.png && (p.png as Blob).size > 0 && p.preview && (p.preview as Blob).size > 0,
        );
      const expectedOriginalNames = new Set<string>();
      for (const d of state.designs) {
        const f = (d.originalFile ?? d.file) as File | undefined;
        if (f?.name) expectedOriginalNames.add(f.name);
      }
      const gotOriginalNames = new Set((verify?.originals || []).map((o) => o.name));
      const validOriginals = Array.from(expectedOriginalNames).every((n) => gotOriginalNames.has(n));
      if (!validPlanos || !validOriginals) {
        throw new Error(
          "Não foi possível preparar todos os ficheiros de impressão neste dispositivo. Tenta novamente ou usa outro browser.",
        );
      }

      const config = {
        productSlug: product.slug, planos: state.planos, settings: state.settings,
        designs: state.designs.map((d) => ({
          id: d.id, name: d.name, cmW: d.cmW, cmH: d.cmH, qty: d.desiredQty,
          borderMode: d.borderMode, borderMm: d.borderMm,
          manualReviewRequested: !!d.manualReviewRequested,
          manualReviewFee: d.manualReviewFee || 0,
          manualReviewPlanos: manualReviewLines
            .filter((l) => l.designId === d.id)
            .map((l) => ({ planoId: l.planoId, planoName: l.planoName, fee: l.fee })),
        })),
        totalMeters, billable: price.billable, unitPrice: price.unit, total: grandTotal,
        manualReviewTotal,
        manualReviewLines,
        // Re-validate verification lines against the planos that were actually
        // rendered/registered above. Drops any orphan entry for a plano the
        // customer removed after confirming the verification dialog, so we
        // never charge for files that don't exist in the order.
        verificationTotal: (() => {
          const liveIds = new Set(renderedPlanos.map((rp) => state.planos[rp.index]?.id).filter(Boolean));
          const live = verificationLines.filter((l) => liveIds.has(l.planoId));
          return +live.reduce((s, l) => s + Number(l.fee || 0), 0).toFixed(2);
        })(),
        verificationLines: (() => {
          const liveIds = new Set(renderedPlanos.map((rp) => state.planos[rp.index]?.id).filter(Boolean));
          return verificationLines.filter((l) => liveIds.has(l.planoId));
        })(),
        verificationEnabled: rollVerification.enabled,
        cartItemKey,
        dpiAcceptances: dpiAcceptances.filter((a) => state.designs.some((d) => d.id === a.designId)),
        oversizeAcceptances,
        readyForCheckout: true,
      };
      const cart = JSON.parse(localStorage.getItem("guest_cart") || "[]");
      const reviewNote = manualReviewLines.length > 0
        ? ` · ${manualReviewLines.length} rolo(s) de análise manual (${fmtEUR(manualReviewTotal)})`
        : "";
      const newEntry = { productId: product.id, name: `${product.name} — ${totalMeters.toFixed(1)} m${reviewNote}`, image: product.image, price: grandTotal, quantity: 1, weight: 0.2 * totalMeters, length_m: totalMeters, design_data: config };
      if (editing) {
        // Replace the existing line in place, preserving order.
        const idx = cart.findIndex((c: any) => c?.design_data?.cartItemKey === editing);
        if (idx >= 0) {
          // Preserve original quantity (per plan: edits don't change qty).
          newEntry.quantity = cart[idx].quantity || 1;
          cart[idx] = newEntry;
        } else {
          cart.push(newEntry);
        }
      } else {
        cart.push(newEntry);
      }
      localStorage.setItem("guest_cart", JSON.stringify(cart));
      window.dispatchEvent(new Event("guest_cart_updated"));
      // Persist an edit snapshot for this cart item so the customer can come
      // back and edit again later. In non-edit mode we still clear the
      // product-scoped autosave draft so a fresh personalization starts blank.
      try { await writeConfiguratorDraft(`dtf-edit:${cartItemKey}`, state); } catch (e) { console.warn("edit snapshot save", e); }
      if (!editing && product?.id) {
        deleteConfiguratorDraft(`dtf-draft:${product.id}`);
      }
      setGenProgress(100);
      setGenOpen(false);
      toast.success(editing ? "Arte atualizada no carrinho!" : "Adicionado ao carrinho!");
      navigate("/carrinho");
    } catch (e: any) {
      // Structured diagnostic so recurring mobile failures are traceable from
      // the customer's browser logs without depending on their description.
      try {
        console.error("[configurator] add-to-cart failed", {
          message: e?.message,
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
          deviceMemory: (navigator as any)?.deviceMemory,
          hardwareConcurrency: navigator?.hardwareConcurrency,
          planos: state.planos.map((p) => ({
            name: p.name,
            items: p.items.length,
          })),
          rollWidthCm,
          planoHeightCm,
        });
      } catch { /* logging must never throw */ }
      setGenError(e?.message || "Tenta novamente.");
    }
  };

  // After the customer confirms the per-roll verification dialog, the new
  // decisions feed `verificationLines`/`verificationTotal` on the next render.
  // Trigger the actual add-to-cart in an effect so handleAddToCart sees the
  // fresh memoized values.
  useEffect(() => {
    if (!verifyPendingSubmit) return;
    setVerifyPendingSubmit(false);
    handleAddToCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyPendingSubmit, verificationTotal]);

  if (isLoading || !product) {
    return (<div className="min-h-screen"><Header /><main className="container mx-auto p-8"><Skeleton className="h-96 w-full" /></main><Footer /></div>);
  }

  return (
    <div className="min-h-screen">
      <Helmet><title>{`Personalizar ${product.name}`}</title></Helmet>
      <Header />
      <GeneratingFileDialog
        open={genOpen}
        progress={genProgress}
        stepLabel={genStep}
        planoCurrent={genPlanoCurrent}
        planoTotal={genPlanoTotal}
        error={genError}
        elapsedMs={genElapsedMs}
        etaMs={genEtaMs}
        onClose={() => {
          setGenOpen(false);
          setGenError(null);
        }}
      />
      <RollVerificationDialog
        open={verifyDialogOpen}
        planos={state.planos
          .filter((p) => p.items.length > 0 && !p.manualReview)
          .map((p) => ({
            id: p.id,
            name: p.name,
            copies: Math.max(1, p.copies || 1),
            designNames: Array.from(
              new Set(
                p.items
                  .map((it) => state.designs.find((d) => d.id === it.designId)?.name || "")
                  .filter(Boolean),
              ),
            ),
          }))}
        pricePerRoll={rollVerification.pricePerRoll}
        description={rollVerification.description}
        declineWarning={rollVerification.declineWarning}
        onCancel={() => setVerifyDialogOpen(false)}
        onConfirm={(decisions) => {
          setVerifyDecisions({ decisions, signature: verifyPlanosSignature });
          setVerifyDialogOpen(false);
          // Defer to an effect so the memoized verificationLines reflect the new decisions.
          setVerifyPendingSubmit(true);
        }}
      />
      <PrintQualityGuard
        designs={state.designs.map((d) => ({
          id: d.id, name: d.name, widthPx: d.widthPx, dpi: d.dpi,
        }))}
        items={state.planos.flatMap((p) => p.items.map((it) => ({
          designId: it.designId, widthCm: it.widthCm,
        })))}
        planos={state.planos
          .filter((p) => p.items.length > 0 && !p.manualReview)
          .map((p) => {
            const maxUsedH = usedPlanoHeightCm(p.items, state.designs, planoHeightCm);
            const designDpis = Array.from(new Set(p.items.map((it) => it.designId)))
              .map((id) => state.designs.find((d) => d.id === id)?.dpi ?? null);
            return {
              id: p.id,
              name: p.name,
              effDpi: computePlanoEffectiveDpi({
                rollWidthCm,
                planoHeightCm,
                maxUsedHeightCm: maxUsedH,
                designDpis,
              }),
            };
          })}
        copy={(visualSettings as any)?.print_quality}
        onPendingChange={setGuardPending}
        onAccept={(a) => setDpiAcceptances((prev) => {
          // Replace any previous acceptance for the same design+kind
          const next = prev.filter((x) => !(x.designId === a.designId && x.kind === a.kind));
          next.push(a);
          return next;
        })}
        onCancel={() => {
          // Revert to the last known safe state — undoing the rotation/resize
          // or removing the just-added design that triggered the warning.
          const snap = prevSafeStateRef.current;
          if (!snap.planos.length) return;
          dispatch({
            type: "LOAD_DRAFT",
            designs: snap.designs,
            planos: snap.planos,
            activeId: snap.planos.find((p) => p.id === state.activeId)?.id || snap.planos[0].id,
            zoom: state.zoom,
            zCounter: snap.zCounter,
            settings: state.settings,
          });
          toast.info("Carregamento cancelado. Pode carregar outra arte ou a mesma novamente.");
        }}
      />
      <main className="container mx-auto px-4 py-6 lg:py-10">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary">Configurador</p>
            <h1 className="font-heading text-3xl lg:text-4xl">{product.name} — {rollWidthCm} cm</h1>
            <p className="text-sm text-muted-foreground mt-1">PNG ou PDF a {product.required_dpi} dpi · fundo transparente · CMYK</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-9 gap-1.5"><Info className="h-3.5 w-3.5" /> Requisitos</Button></PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0 overflow-hidden">
                <div className="bg-primary/10 px-4 py-3 border-b border-border/60">
                  <p className="font-heading text-base flex items-center gap-2"><FileImage className="h-4 w-4 text-primary" /> Como preparar a arte</p>
                </div>
                <ul className="p-4 space-y-2.5 text-xs">
                  <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /><span><b>Formato:</b> PNG-24 ou PDF vetorial.</span></li>
                  <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /><span><b>Resolução:</b> {product.required_dpi} dpi à escala real.</span></li>
                  <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /><span><b>Fundo:</b> 100% transparente.</span></li>
                  <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /><span><b>Tamanho máx.:</b> {rollWidthCm} × {planoHeightCm} cm · até 50 MB.</span></li>
                </ul>
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="ghost" className="h-9 gap-1.5" onClick={() => setShowTutorial(true)}><BookOpen className="h-3.5 w-3.5" /> Tutorial</Button>
            <Link to={`/produto/${product.slug || product.id}`} className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">← Voltar</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 pb-32">
          {/* LEFT — uploads, settings & designs */}
          <div className="space-y-3">
            {/* Upload */}
            <Card className="p-4 bg-card border-border/60">
              <button onClick={() => fileRef.current?.click()} className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-primary/40 hover:border-primary/80 transition-colors flex flex-col items-center justify-center text-center p-4 hover:bg-primary/5 group">
                <Upload className="h-8 w-8 text-primary mb-2 transition-transform group-hover:-translate-y-0.5" />
                <p className="font-heading text-xl">Sobe a tua arte</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  Clica para escolher os <b>teus próprios ficheiros</b> a partir do teu dispositivo.
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-2 uppercase tracking-wider">PNG ou PDF · 300 dpi · CMYK</p>
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".png,.pdf,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  // Snapshot para um array — `e.target.files` é uma FileList viva
                  // ligada ao input, e limpar o `value` a seguir esvazia-a.
                  const picked = e.target.files ? Array.from(e.target.files) : [];
                  // Reset value so the same ficheiro pode ser carregado novamente
                  // se o cliente cancelar o aviso de baixa resolução.
                  e.target.value = "";
                  if (picked.length) onFiles(picked);
                }}
              />
              {manualReviewSettings.enabled && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Info className="h-3 w-3" /> Aceitamos a tua própria arte
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Se um ficheiro não passar na verificação automática (ex.: PDF sem transparência), poderás
                    optar por <b>pagar uma taxa de análise manual</b> para a nossa equipa rever a arte e continuar.
                  </p>
                </div>
              )}
              {uploadProgress.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadProgress.map((u, i) => (
                    <div key={i} className="text-[10px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate flex-1" title={u.name}>{u.name}</span>
                        <span className={u.status === "rejected" ? "text-destructive font-semibold" : u.status === "done" ? "text-primary font-semibold" : "text-muted-foreground"}>
                          {u.status === "reading" && "A ler..."}
                          {u.status === "validating" && "A validar..."}
                          {u.status === "done" && "OK"}
                          {u.status === "rejected" && "Rejeitado"}
                        </span>
                      </div>
                      <div className="h-1 bg-muted rounded mt-1 overflow-hidden"><div className={`h-full transition-all ${u.status === "rejected" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${u.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Reserved alerts area — fixed slot to keep layout stable */}
            <div className="min-h-[48px] space-y-1.5" aria-live="polite">
              {alerts.length > 0 ? (
                alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug ${
                    a.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" :
                    a.kind === "warn" ? "border-amber-400/40 bg-amber-500/10 text-amber-200" :
                    "border-primary/30 bg-primary/5"
                  }`}>
                    {a.kind === "error" ? <X className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : a.kind === "warn" ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <span>{a.msg}</span>
                  </div>
                ))
              ) : (
                <div className="h-[48px] rounded-md border border-dashed border-border/40 bg-muted/10 flex items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Sem avisos
                </div>
              )}
            </div>

            {/* Global settings */}
            <Card className="bg-card border-border/60 overflow-hidden">
              <div className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span className="flex items-center gap-2"><Sliders className="h-3.5 w-3.5 text-primary" /> Definições de montagem</span>
              </div>
              <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                  <div>
                    <Label className="text-[10px] uppercase">Espaçamento entre artes (mm)</Label>
                    <div className="flex items-stretch gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 shrink-0"
                        aria-label="Diminuir espaçamento em 1 mm"
                        onClick={() => {
                          const n = Math.max(0, Math.round(state.settings.spacingMm) - 1);
                          if (n === state.settings.spacingMm) return;
                          dispatch({ type: "UPDATE_SETTINGS", patch: { spacingMm: n } });
                          dispatch({ type: "PACK_PLANO", rollWidthCm, planoHeightCm });
                        }}
                        disabled={state.settings.spacingMm <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 h-9 rounded-md border border-border/60 bg-muted/30 flex items-center justify-center text-sm font-semibold tabular-nums">
                        {Math.round(state.settings.spacingMm)} <span className="text-muted-foreground font-normal ml-1">mm</span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 shrink-0"
                        aria-label="Aumentar espaçamento em 1 mm"
                        onClick={() => {
                          const n = Math.min(50, Math.round(state.settings.spacingMm) + 1);
                          if (n === state.settings.spacingMm) return;
                          dispatch({ type: "UPDATE_SETTINGS", patch: { spacingMm: n } });
                            dispatch({ type: "PACK_PLANO", rollWidthCm, planoHeightCm });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Ajusta de 1 em 1 mm — o plano é reorganizado automaticamente para respeitar o novo espaçamento.</p>
                  </div>

                  <div className="rounded-md border border-border/40 bg-muted/30 p-2.5 text-[10px] text-muted-foreground">
                    <p><span className="font-semibold text-foreground">Margem do rolo:</span> {productMarginMm} mm (definida pelo produto).</p>
                  </div>
                </div>
            </Card>

            {/* Designs list */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Designs ({state.designs.length})</p>
                {draftSaveStatus !== "idle" && (state.designs.length > 0 || draftSaveStatus === "error") && (
                  <p
                    role={draftSaveStatus === "error" ? "alert" : "status"}
                    aria-live={draftSaveStatus === "error" ? "assertive" : "polite"}
                    className={`min-w-0 text-[10px] leading-tight text-right ${draftSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {draftSaveStatus === "saving" && "A guardar neste dispositivo…"}
                    {draftSaveStatus === "saved" && "Rascunho guardado neste dispositivo"}
                    {draftSaveStatus === "error" && "Não foi possível guardar o rascunho. Mantenha esta página aberta."}
                  </p>
                )}
                {draftSaveStatus === "error" && latestDraftRef.current && (
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-semibold text-primary underline underline-offset-2"
                    onClick={() => {
                      const snapshot = latestDraftRef.current;
                      if (!snapshot) return;
                      setDraftSaveStatus("saving");
                      persistDraftSnapshot(snapshot).catch((e) => console.warn("draft retry", e));
                    }}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
              {state.designs.length > 0 && draftStorageProtection !== "unknown" && (
                <p className={`text-[10px] leading-snug ${draftStorageProtection === "persistent" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-300"}`} aria-live="polite">
                  {draftStorageProtection === "persistent"
                    ? "O navegador aceitou preservar os dados locais. Os ficheiros continuam apenas neste dispositivo até ao envio."
                    : "O navegador pode limpar os rascunhos locais. Conclua a compra para enviar os ficheiros ao servidor."}
                </p>
              )}
              {state.designs.length === 0 && (<p className="text-xs text-muted-foreground italic px-1">Sem designs — carrega ficheiros acima.</p>)}
              {state.designs.map((d) => (
                <DesignCard
                  key={d.id}
                  design={d}
                  rollWidthCm={rollWidthCm}
                  planoHeightCm={planoHeightCm}
                  dispatch={dispatch}
                  placedCount={state.planos.reduce((s, p) => s + p.items.filter((i) => i.designId === d.id).length, 0)}
                  onRequestDelete={(designId, name, placedCount) => setConfirmDeleteDesign({ id: designId, name, placedCount })}
                  open={openDesignId === d.id}
                  onToggle={() => setOpenDesignId((cur) => (cur === d.id ? null : d.id))}
                  onRequestManualReview={() => setReviewDesignId(d.id)}
                  manualReviewFee={calcManualReviewFee(d.cmW, d.cmH)}
                  manualReviewEnabled={manualReviewSettings.enabled}
                  reviewPlanos={state.planos.filter((p) => p.manualReview && p.reviewDesignId === d.id).map((p) => ({ id: p.id, name: p.name, fee: p.manualReviewFee || 0 }))}
                  activePlanoIsReviewForThis={plano.manualReview === true && plano.reviewDesignId === d.id}
                  onCreateExtraReviewPlano={() => dispatch({ type: "ADD_REVIEW_PLANO", designId: d.id, fee: calcManualReviewFee(d.cmW, d.cmH), rollWidthCm, planoHeightCm })}
                />
              ))}
            </div>
          </div>

          {/* CENTER — canvas */}
          <div className="space-y-3">
            {/* Toolbar */}
            <Card className="p-3 bg-card border-border/60 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {state.planos.map((p) => {
                  const active = p.id === state.activeId;
                  return (
                    <div key={p.id} className={`group flex items-center rounded-md border overflow-hidden ${
                      p.manualReview
                        ? (active ? "border-amber-500 bg-amber-500/15 text-amber-500" : "border-amber-500/50 bg-amber-500/5 text-amber-500 hover:border-amber-500")
                        : (active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50")
                    }`}>
                      {renamingId === p.id ? (
                        <input autoFocus defaultValue={p.name}
                          onBlur={(e) => { dispatch({ type: "RENAME_PLANO", id: p.id, name: e.target.value }); setRenamingId(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { dispatch({ type: "RENAME_PLANO", id: p.id, name: (e.target as HTMLInputElement).value }); setRenamingId(null); } if (e.key === "Escape") setRenamingId(null); }}
                          className="h-8 px-2 text-xs font-semibold bg-transparent outline-none w-28" />
                      ) : (
                        <button onClick={() => dispatch({ type: "SWITCH_PLANO", id: p.id })} onDoubleClick={() => setRenamingId(p.id)} className="px-3 h-8 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" title={p.manualReview ? `Rolo de análise manual · taxa ${fmtEUR(p.manualReviewFee || 0)}` : p.name}>
                          {p.manualReview && <FileWarning className="h-3 w-3" />}
                          {p.name} <span className="opacity-60 ml-1">({p.items.length})</span>
                        </button>
                      )}
                      {active && renamingId !== p.id && (
                        <button onClick={() => setRenamingId(p.id)} className="h-8 px-1.5 hover:bg-primary/20"><Pencil className="h-3 w-3" /></button>
                      )}
                      <div
                        className="flex items-center h-8 px-1 border-l border-border/60 gap-1"
                        title="Quantas cópias deste plano serão impressas (multiplica os metros cobrados)."
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label="Diminuir cópias"
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 bg-background/60 hover:border-primary disabled:opacity-40"
                          disabled={(p.copies ?? 1) <= 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            const v = Math.max(1, (p.copies ?? 1) - 1);
                            dispatch({ type: "SET_PLANO_COPIES", id: p.id, copies: v });
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          value={p.copies ?? 1}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(99, Math.floor(+e.target.value || 1)));
                            dispatch({ type: "SET_PLANO_COPIES", id: p.id, copies: v });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-10 h-6 text-[11px] font-semibold bg-background/60 border border-border/60 rounded px-1 text-center outline-none focus:border-primary"
                          aria-label="Cópias deste plano"
                        />
                        <button
                          type="button"
                          aria-label="Aumentar cópias"
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 bg-background/60 hover:border-primary disabled:opacity-40"
                          disabled={(p.copies ?? 1) >= 99}
                          onClick={(e) => {
                            e.stopPropagation();
                            const v = Math.min(99, (p.copies ?? 1) + 1);
                            dispatch({ type: "SET_PLANO_COPIES", id: p.id, copies: v });
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <span className="text-[10px] text-muted-foreground ml-0.5">×</span>
                      </div>
                    </div>
                  );
                })}
                <Button size="sm" variant="outline" onClick={() => dispatch({ type: "ADD_PLANO" })} className="h-8 gap-1" title="Cria um novo plano (rolo) para organizar mais artes."><Plus className="h-3 w-3" /> Nova página</Button>
                {state.planos.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Eliminar "${plano.name}"?`)) dispatch({ type: "REMOVE_PLANO", id: state.activeId }); }} className="h-8 text-destructive gap-1" title="Elimina este plano e todas as suas artes."><Trash2 className="h-3 w-3" /> Eliminar</Button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1 flex-wrap">
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-background h-8 px-1" title="Cor de visualização do quadro (apenas visual — não afeta o arquivo final)">
                  {([
                    { id: "gray", color: "#6b7280", label: "Cinza" },
                    { id: "white", color: "#ffffff", label: "Branco" },
                    { id: "black", color: "#111111", label: "Preto" },
                  ] as const).map((opt) => {
                    const current = (plano.viewBg || "gray") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => dispatch({ type: "SET_PLANO_BG", id: state.activeId, viewBg: opt.id })}
                        className={`h-6 w-6 rounded-sm border ${current ? "border-primary ring-1 ring-primary" : "border-border/60 hover:border-primary/60"}`}
                        style={{ backgroundColor: opt.color }}
                        title={`Fundo: ${opt.label}`}
                        aria-label={`Fundo do quadro: ${opt.label}`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-background h-8 px-1">
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom - 0.1 })} className="h-6 w-6 p-0" title="Reduzir zoom"><ZoomOut className="h-3 w-3" /></Button>
                  <span className="text-[11px] font-mono w-10 text-center">{Math.round(state.zoom * 100)}%</span>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom + 0.1 })} className="h-6 w-6 p-0" title="Aumentar zoom"><ZoomIn className="h-3 w-3" /></Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setFullscreen((v) => !v)} className="h-8" title={fullscreen ? "Sair do modo ecrã inteiro" : "Ver o rolo em ecrã inteiro"}>{fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}</Button>
                <Button size="sm" variant="default" onClick={() => dispatch({ type: "PACK_PLANO", rollWidthCm, planoHeightCm })} className="h-8 gap-1 bg-primary text-primary-foreground" title="Reorganiza automaticamente todas as artes deste plano para aproveitar melhor o espaço."><Wand2 className="h-3 w-3" />Organizar</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Limpar todas as artes desta página?")) dispatch({ type: "CLEAR_PLANO" }); }} className="h-8 text-destructive" title="Remove todas as artes deste plano (não apaga os designs carregados)."><Trash2 className="h-3 w-3" /></Button>
              </div>
            </Card>

            {plano.manualReview && (() => {
              const reviewDesign = plano.reviewDesignId ? state.designs.find((d) => d.id === plano.reviewDesignId) : null;
              return (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center gap-2 text-[11px] text-amber-500">
                  <FileWarning className="h-4 w-4 shrink-0" />
                  <span className="flex-1 leading-snug">
                    <b className="uppercase tracking-wider">Rolo de análise manual</b> · taxa {fmtEUR(plano.manualReviewFee || 0)}
                    {reviewDesign && <> · arte: <span className="font-mono">{reviewDesign.name}</span></>}
                    <span className="block text-amber-200/80 font-normal mt-0.5">Este rolo só aceita esta arte. Para outras artes, usa um rolo normal.</span>
                  </span>
                </div>
              );
            })()}

            <PlanoCanvas
              plano={plano} designs={state.designs} rollWidthCm={rollWidthCm} planoHeightCm={planoHeightCm}
              zoom={state.zoom} selectedId={state.selectedItemId} marginMm={state.settings.marginMm}
              onSelect={(id) => dispatch({ type: "SELECT", id })} dispatch={dispatch}
              onContextMenu={(itemId, x, y) => { dispatch({ type: "SELECT", id: itemId }); setCtxMenu({ itemId, x, y }); }}
              fullscreen={fullscreen} onExitFullscreen={() => setFullscreen(false)}
              viewBg={plano.viewBg || "gray"}
              previewQuality={previewQuality}
            />

            {selected && (
              <Card className="p-3 bg-card border-border/60 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono">{selected.widthCm.toFixed(1)} × {selected.heightCm.toFixed(1)} cm · {selected.rotation}°</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "TOGGLE_LOCK", id: selected.id })} className="h-8 px-2">{selected.locked ? <Lock className="h-3 w-3 text-primary" /> : <Unlock className="h-3 w-3" />}</Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "ROTATE_ITEM", id: selected.id })} className="h-8 px-2"><RotateCw className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "DUP_ITEM", id: selected.id })} className="h-8 px-2"><CopyIcon className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "BRING_FORWARD", id: selected.id })} className="h-8 px-2"><ChevronUp className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "SEND_BACK", id: selected.id })} className="h-8 px-2"><ChevronDown className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "DELETE_ITEM", id: selected.id })} className="h-8 px-2 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                </div>
              </Card>
            )}

            {/* Plan + general summary */}
            <Card className="p-4 bg-card border-border/60">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Página atual</p><p className="font-semibold truncate">{plano.name}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Artes no plano</p><p className="font-semibold">{plano.items.length}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Altura usada</p><p className="font-semibold">{planoUtilization.height.toFixed(1)} cm</p></div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Aproveitamento</p>
                  <p className={`font-semibold ${planoUtilization.pct >= 70 ? "text-primary" : planoUtilization.pct >= 40 ? "text-amber-300" : "text-muted-foreground"}`}>{planoUtilization.pct}%</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total páginas</p><p className="font-semibold">{state.planos.length}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total artes</p><p className="font-semibold">{totalItems}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Designs distintos</p><p className="font-semibold">{distinctDesigns}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unidades pedidas</p><p className="font-semibold">{unitsRequested}</p></div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Sticky bottom summary */}
      <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.4)] pb-[env(safe-area-inset-bottom)]">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-5 flex-wrap text-sm">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Páginas</p><p className="font-semibold">{state.planos.length}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elementos</p><p className="font-semibold">{totalItems}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Metros</p><p className="font-semibold">{totalMeters.toFixed(2)} m{price.billable > totalMeters && (<span className="ml-1 text-[10px] font-normal text-muted-foreground">(faturado {price.billable.toFixed(2)} m)</span>)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">€ / m</p><p className="font-semibold">{fmtEUR(price.unit)}</p></div>
            <div className="hidden md:block h-10 w-px bg-border/60" />
            {manualReviewTotal > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-500">Análise manual</p>
                <p className="font-semibold text-amber-500">{fmtEUR(manualReviewTotal)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{manualReviewLines.length} rolo(s) dedicado(s)</p>
              </div>
            )}
            {verificationTotal > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-primary">Verificação</p>
                <p className="font-semibold text-primary">{fmtEUR(verificationTotal)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{verificationLines.length} rolo(s) · sem IVA</p>
              </div>
            )}
            <div><p className="text-[10px] uppercase tracking-wider text-primary">Total</p><p className="font-heading text-2xl text-primary leading-none">{fmtEUR(grandTotal)}</p><p className="text-[9px] text-muted-foreground mt-0.5">+ IVA no checkout</p></div>
          </div>
          <Button
            onClick={() => {
              if (alerts.some((a) => a.kind === "error")) {
                toast.error("Reorganiza as artes — há contornos sobrepostos ou artes fora da área útil.");
                return;
              }
              // If admin enabled the optional verification fee, ask per-roll
              // before generating files. Manual-review planos are excluded
              // (they already paid for verification).
              const eligiblePlanos = state.planos.filter(
                (p) => p.items.length > 0 && !p.manualReview,
              );
              if (rollVerification.enabled && eligiblePlanos.length > 0 && !verifyDecisions) {
                setVerifyDialogOpen(true);
                return;
              }
              handleAddToCart();
            }}
            disabled={totalMeters <= 0 || alerts.some((a) => a.kind === "error")}
            className="ml-auto h-12 px-6 bg-gradient-fire text-white shadow-glow-orange font-bold uppercase tracking-wider hover:scale-[1.02] transition-transform disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4 mr-2" /> Carrinho
          </Button>
        </div>
      </div>

      <Footer />

      {/* Rejection details modal — kept concise */}
      <Dialog open={!!rejection} onOpenChange={(o) => !o && setRejection(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><FileWarning className="h-5 w-5" /> Ficheiro não aceite</DialogTitle>
            <DialogDescription>Corrige os pontos abaixo e volta a carregar.</DialogDescription>
          </DialogHeader>
          {rejection && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Ficheiro</p>
                <p className="font-mono text-sm break-all">{rejection.name}</p>
              </div>
              <ul className="space-y-1.5 text-sm">
                {rejection.reasons.map((r, i) => (<li key={i} className="flex gap-2"><X className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><span>{r.replace(/^(?:❌|⚠️)\s*/u, "")}</span></li>))}
              </ul>
            </div>
          )}
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setRejection(null)}>Fechar</Button>
            <Button onClick={() => { setRejection(null); fileRef.current?.click(); }} className="bg-primary text-primary-foreground"><Upload className="h-4 w-4 mr-2" /> Carregar outro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aceitação de redução proporcional — arte mais larga que o rolo */}
      {(() => {
        const current = oversizeQueue[0];
        if (!current) return null;
        const acceptText =
          `Confirmo que aceito a redução proporcional desta arte para que caiba na largura útil do rolo (${rollWidthCm.toFixed(1)} cm). A arte mantém a proporção e não é cortada nem deformada.`;
        const closeAndDiscard = () => {
          setOversizeQueue((prev) => prev.slice(1));
          setOversizeChecked(false);
        };
        const acceptCurrent = () => {
          const d = current.design;
          dispatch({ type: "ADD_DESIGNS", designs: [d] });
          setOpenDesignId(d.id);
          if (current.isPdf) {
            dispatch({ type: "ADD_PDF", designId: d.id, rollWidthCm, planoHeightCm });
          } else {
            // Insere automaticamente no plano actual, num plano existente com
            // espaço ou cria um novo plano se necessário.
            dispatch({ type: "ADD_ITEM", designId: d.id, rollWidthCm, planoHeightCm });
          }
          setOversizeAcceptances((prev) => [
            ...prev,
            {
              designId: d.id,
              fileName: d.name,
              productName: product?.name || "",
              rollWidthCm,
              originalCmW: current.originalCmW,
              originalCmH: current.originalCmH,
              adjustedCmW: current.adjustedCmW,
              adjustedCmH: current.adjustedCmH,
              acceptedAt: new Date().toISOString(),
              acceptedText: acceptText,
            },
          ]);
          toast.success(
            `Arte ajustada de ${current.originalCmW.toFixed(1)} cm para ${current.adjustedCmW.toFixed(1)} cm de largura e inserida no configurador. A aceitação ficou registada.`,
            { duration: 8000 },
          );
          setOversizeQueue((prev) => prev.slice(1));
          setOversizeChecked(false);
        };
        return (
          <Dialog open={true} onOpenChange={(o) => { if (!o) closeAndDiscard(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                  <FileWarning className="h-5 w-5" /> A arte ultrapassa a largura útil do rolo
                </DialogTitle>
                <DialogDescription>
                  A arte carregada é mais larga do que a largura útil deste produto. Pode aceitar a redução proporcional automática ou corrigir manualmente o ficheiro antes de voltar a carregar.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Ficheiro</p>
                  <p className="font-mono text-sm break-all">{current.design.name}</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tamanho original</p>
                    <p className="font-mono text-sm">{current.originalCmW.toFixed(1)} × {current.originalCmH.toFixed(1)} cm</p>
                    <p className="text-[11px] text-muted-foreground">Produto: {product?.name}</p>
                    <p className="text-[11px] text-muted-foreground">Largura útil do rolo: {rollWidthCm.toFixed(1)} cm</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Tamanho ajustado proposto</p>
                    <p className="font-mono text-sm">{current.adjustedCmW.toFixed(1)} × {current.adjustedCmH.toFixed(1)} cm</p>
                    <p className="text-[11px] text-muted-foreground">Ajuste: redução proporcional</p>
                    <p className="text-[11px] text-muted-foreground">Proporção: mantida · sem cortes nem deformação</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-foreground font-semibold mb-2">Como resolver manualmente</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Rode a arte 90° no software onde criou o ficheiro, se isso permitir que caiba na largura útil do rolo.</li>
                    <li>Reduza a largura da arte para o máximo permitido neste produto, mantendo sempre a proporção.</li>
                    <li>Corte apenas áreas laterais vazias ou transparentes que não sejam necessárias para a impressão.</li>
                    <li>Verifique se não existem margens transparentes excessivas à volta da arte.</li>
                    <li>Exporte novamente o ficheiro em PNG com fundo transparente, 300 dpi e em CMYK, quando aplicável.</li>
                    <li>Volte a carregar o ficheiro corrigido.</li>
                  </ul>
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <Checkbox checked={oversizeChecked} onCheckedChange={(v) => setOversizeChecked(Boolean(v))} className="mt-0.5" />
                  <span>{acceptText}</span>
                </label>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
                <Button variant="ghost" onClick={closeAndDiscard}>Vou corrigir manualmente</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { closeAndDiscard(); fileRef.current?.click(); }}>
                    <Upload className="h-4 w-4 mr-2" /> Carregar outro ficheiro
                  </Button>
                  <Button disabled={!oversizeChecked} onClick={acceptCurrent} className="bg-primary text-primary-foreground">
                    Aceitar e inserir arte ajustada
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Manual review confirmation modal */}
      {(() => {
        const reviewDesign = reviewDesignId ? state.designs.find((d) => d.id === reviewDesignId) : null;
        const fee = reviewDesign ? calcManualReviewFee(reviewDesign.cmW, reviewDesign.cmH) : 0;
        const area = reviewDesign ? (reviewDesign.cmW * reviewDesign.cmH) / 10000 : 0;
        return (
          <Dialog open={!!reviewDesign} onOpenChange={(o) => !o && setReviewDesignId(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-500">
                  <FileWarning className="h-5 w-5" /> Pedir análise manual do ficheiro
                </DialogTitle>
                <DialogDescription>
                  A nossa equipa vai rever o ficheiro manualmente após o pagamento da taxa.
                </DialogDescription>
              </DialogHeader>
              {reviewDesign && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex gap-3 items-center">
                    {reviewDesign.url && <img src={reviewDesign.url} alt="" className="h-16 w-16 object-contain rounded border" />}
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase text-muted-foreground">Ficheiro</p>
                      <p className="font-mono text-sm break-all">{reviewDesign.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {reviewDesign.cmW.toFixed(1)} × {reviewDesign.cmH.toFixed(1)} cm · {area.toFixed(3)} m²
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-amber-500 font-bold">Cálculo da taxa</p>
                    <p className="font-mono text-sm mt-1">
                      {area.toFixed(3)} m² × {fmtEUR(manualReviewSettings.pricePerM2)}/m² = {fmtEUR(+(area * manualReviewSettings.pricePerM2).toFixed(2))}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Valor mínimo: {fmtEUR(manualReviewSettings.minPrice)}
                    </p>
                    <p className="text-2xl font-heading text-amber-500 mt-2">
                      Total: {fmtEUR(fee)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug whitespace-pre-line">
                    {manualReviewSettings.description}
                  </p>
                </div>
              )}
              <DialogFooter className="flex sm:justify-between gap-2">
                <Button variant="outline" onClick={() => setReviewDesignId(null)}>Cancelar</Button>
                <Button
                  className="bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
                  onClick={() => {
                    if (!reviewDesign) return;
                    dispatch({
                      type: "ADD_REVIEW_PLANO",
                      designId: reviewDesign.id,
                      fee,
                      rollWidthCm,
                      planoHeightCm,
                    });
                    setReviewDesignId(null);
                  }}
                >
                  Aceitar e continuar · {fmtEUR(fee)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Tutorial */}
      <Dialog open={showTutorial} onOpenChange={(o) => { if (!o) dismissTutorial(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-2xl"><Sparkles className="h-5 w-5 text-primary" /> Bem-vindo</DialogTitle>
            <DialogDescription>Em 4 passos montas o teu rolo.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3">
            {[
              { t: "Carrega as artes", d: `PNG-24 ou PDF · ${product.required_dpi} dpi · fundo transparente.`, i: <Upload className="h-4 w-4" /> },
              { t: "Configura cada arte", d: `Define tamanho em cm, quantidade desejada, borda e clica em "Aplicar quantidade".`, i: <Settings2 className="h-4 w-4" /> },
              { t: "Organiza ou preenche", d: `Usa "Organizar" para encaixe inteligente, "Preencher rolo" ou "Distribuir em páginas".`, i: <LayoutGrid className="h-4 w-4" /> },
              { t: "Confirma e finaliza", d: "Vê o resumo em baixo e clica em Carrinho.", i: <ShoppingCart className="h-4 w-4" /> },
            ].map((s, i) => (
              <li key={i} className="flex gap-3 items-start rounded-lg border border-border/60 p-3">
                <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-heading">{i + 1}</div>
                <div className="flex-1"><p className="font-semibold flex items-center gap-2">{s.i}{s.t}</p><p className="text-sm text-muted-foreground mt-0.5">{s.d}</p></div>
              </li>
            ))}
          </ol>
          <DialogFooter><Button onClick={dismissTutorial} className="bg-primary text-primary-foreground w-full sm:w-auto">Começar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm design delete */}
      <Dialog open={!!confirmDeleteDesign} onOpenChange={(o) => !o && setConfirmDeleteDesign(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Eliminar design?
            </DialogTitle>
            <DialogDescription>
              Vais eliminar <b className="text-foreground">{confirmDeleteDesign?.name}</b> da lista de designs.
              {confirmDeleteDesign && confirmDeleteDesign.placedCount > 0 && (
                <>
                  {" "}Também serão removidas <b className="text-destructive">{confirmDeleteDesign.placedCount} cópia(s)</b> deste design já colocadas no rolo.
                </>
              )}
              {" "}Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteDesign(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteDesign) {
                  dispatch({ type: "REMOVE_DESIGN", id: confirmDeleteDesign.id });
                  toast.success("Design eliminado");
                  setConfirmDeleteDesign(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ctxMenu && (() => {
        const it = plano.items.find((i) => i.id === ctxMenu.itemId); if (!it) return null;
        const close = () => setCtxMenu(null);
        const btn = "w-full text-left px-3 py-1.5 text-xs hover:bg-primary/10 flex items-center gap-2";
        return (
          <div className="fixed z-[100] min-w-[180px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1" style={{ left: ctxMenu.x, top: ctxMenu.y }} onPointerDown={(e) => e.stopPropagation()}>
            <button className={btn} onClick={() => { setClipboard(it); toast.success("Copiado"); close(); }}><CopyIcon className="h-3 w-3" /> Copiar</button>
            <button className={btn} disabled={!clipboard} onClick={() => { if (clipboard) dispatch({ type: "PASTE_ITEM", source: clipboard, rollWidthCm, planoHeightCm }); close(); }}><ClipboardPaste className="h-3 w-3" /> Colar</button>
            <button className={btn} onClick={() => { dispatch({ type: "DUP_ITEM", id: it.id }); close(); }}><CopyIcon className="h-3 w-3" /> Duplicar</button>
            <button className={btn} onClick={() => { dispatch({ type: "ROTATE_ITEM", id: it.id }); close(); }}><RotateCw className="h-3 w-3" /> Rodar 90°</button>
            <button className={btn} onClick={() => { dispatch({ type: "TOGGLE_LOCK", id: it.id }); close(); }}>{it.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {it.locked ? "Destravar" : "Travar"}</button>
            <div className="my-1 border-t border-border/40" />
            <button className={`${btn} text-destructive`} onClick={() => { dispatch({ type: "DELETE_ITEM", id: it.id }); close(); }}><Trash2 className="h-3 w-3" /> Apagar</button>
          </div>
        );
      })()}
    </div>
  );
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "approved") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="h-3 w-3" /> OK</span>;
  if (status === "warning") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider"><AlertTriangle className="h-3 w-3" /> Aviso</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-bold uppercase tracking-wider"><X className="h-3 w-3" /> Bloqueado</span>;
};

/* ============================================================
 * DesignCard — per-design controls in sidebar
 * ============================================================ */
const DesignCard = ({
  design, rollWidthCm, planoHeightCm, dispatch, placedCount, onRequestDelete, open, onToggle,
  onRequestManualReview, manualReviewFee, manualReviewEnabled,
  reviewPlanos, activePlanoIsReviewForThis, onCreateExtraReviewPlano,
}: {
  design: Design;
  rollWidthCm: number;
  planoHeightCm: number;
  dispatch: React.Dispatch<Action>;
  placedCount: number;
  onRequestDelete: (designId: string, name: string, placedCount: number) => void;
  open: boolean;
  onToggle: () => void;
  onRequestManualReview: () => void;
  manualReviewFee: number;
  manualReviewEnabled: boolean;
  reviewPlanos: { id: string; name: string; fee: number }[];
  activePlanoIsReviewForThis: boolean;
  onCreateExtraReviewPlano: () => void;
}) => {
  const d = design;
  const setPatch = (patch: Partial<Design>) => {
    dispatch({ type: "UPDATE_DESIGN", id: d.id, patch });
    // Border (contorno) changes affect each placed item's outer footprint;
    // re-pack so artworks honour the new contour spacing automatically.
    if (
      Object.prototype.hasOwnProperty.call(patch, "borderMode") ||
      Object.prototype.hasOwnProperty.call(patch, "borderMm")
    ) {
      dispatch({ type: "PACK_PLANO", rollWidthCm, planoHeightCm });
    }
  };
  const aspect = d.heightPx > 0 ? d.widthPx / d.heightPx : 1;
  // Design locked to its dedicated review plano(s): block add/apply/fill/distribute when the active
  // plano is not the dedicated one.
  const lockedByReview = !!d.manualReviewRequested && !activePlanoIsReviewForThis;

  const onCmW = (val: number) => {
    const w = Math.max(0.5, val);
    if (d.keepAspect) setPatch({ cmW: +w.toFixed(2), cmH: +(w / aspect).toFixed(2) });
    else setPatch({ cmW: +w.toFixed(2) });
  };
  const onCmH = (val: number) => {
    const h = Math.max(0.5, val);
    if (d.keepAspect) setPatch({ cmH: +h.toFixed(2), cmW: +(h * aspect).toFixed(2) });
    else setPatch({ cmH: +h.toFixed(2) });
  };

  const effDpi = effectiveDpi(d.widthPx, d.cmW);
  const dpiTone = effDpi >= 300 ? "text-primary" : effDpi >= 200 ? "text-amber-300" : "text-destructive";

  return (
    <Card
      className={`relative overflow-hidden border bg-gradient-to-b from-card to-card/60 transition-colors ${
        open ? "ring-1 ring-primary/40 border-primary/40" : ""
      } ${
        d.status === "blocked"
          ? "border-destructive/50"
          : d.status === "warning"
          ? "border-amber-400/40"
          : "border-border/60 hover:border-primary/40"
      }`}
    >
      {/* Inky accent rail */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-[3px] transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(180deg,hsl(var(--primary)),hsl(var(--primary)/0.3))" }}
      />
      {/* Compact header — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="w-full p-3 flex items-center gap-3 hover:bg-primary/[0.04] text-left transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%)] bg-[length:8px_8px] bg-[position:0_0,4px_4px] border border-border/60 shrink-0 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          {d.url ? (
            <img src={d.url} alt="" className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
          ) : (
            <FileImage className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" title={d.name}>{d.name}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{d.cmW.toFixed(1)}×{d.cmH.toFixed(1)}cm</span>
            <span>·</span>
            <span className={`font-mono ${dpiTone}`}>{effDpi}dpi</span>
            {placedCount > 0 && (
              <>
                <span>·</span>
                <span className="text-primary font-semibold">{placedCount} no rolo</span>
              </>
            )}
          </div>
        </div>
        {!open && d.status !== "blocked" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dispatch({ type: "ADD_ITEM", designId: d.id, rollWidthCm, planoHeightCm }); }}
            disabled={lockedByReview}
            className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${lockedByReview ? "text-muted-foreground/40 cursor-not-allowed" : "text-primary hover:bg-primary/10"}`}
            aria-label={`Adicionar ${d.name} ao plano`}
            title={lockedByReview ? "Esta arte só pode ser usada no seu rolo dedicado de análise manual." : "Adicionar 1 cópia ao plano atual"}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRequestDelete(d.id, d.name, placedCount); }}
          className="h-7 w-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 shrink-0"
          aria-label={`Eliminar design ${d.name}`}
          title="Eliminar este design"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2.5">
          <div className="flex items-center gap-2">
            <StatusBadge status={d.status} />
            <span className="text-[10px] text-muted-foreground">{d.widthPx}×{d.heightPx}px{d.dpi ? ` · ${d.dpi}dpi declarado` : ""}</span>
            {d.manualReviewRequested && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                Análise paga · {fmtEUR(d.manualReviewFee || 0)}
              </span>
            )}
          </div>

          {/* Reasons (always show when there are any) */}
          {d.reasons && d.reasons.length > 0 && (
            <ul className="text-[10px] text-muted-foreground space-y-0.5">
              {d.reasons.slice(0, 4).map((r, i) => (
                <li key={i} className="leading-snug">• {r.replace(/^(?:❌|⚠️)\s*/u, "")}</li>
              ))}
            </ul>
          )}

          {/* Manual review CTA — only shown when file is blocked and reviewable */}
          {d.status === "blocked" && d.reviewable && manualReviewEnabled && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-500">Ficheiro bloqueado automaticamente</p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                A nossa equipa pode rever este ficheiro manualmente mediante taxa de análise.
              </p>
              <Button
                size="sm"
                onClick={onRequestManualReview}
                className="w-full h-8 text-[11px] bg-amber-500 hover:bg-amber-500/90 text-black font-semibold"
              >
                Pedir análise manual · {fmtEUR(manualReviewFee)}
              </Button>
            </div>
          )}

          {/* Dedicated review plano(s) info + add another one */}
          {d.manualReviewRequested && reviewPlanos.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-500 flex items-center gap-1.5">
                <FileWarning className="h-3 w-3" /> Rolo(s) dedicado(s)
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                {reviewPlanos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">• {p.name}</span>
                    <span className="font-mono text-amber-500 shrink-0">{fmtEUR(p.fee)}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="sm" variant="outline"
                onClick={onCreateExtraReviewPlano}
                className="w-full h-7 text-[10px] border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                title="Cria outro rolo dedicado a esta arte. Cada rolo cobra uma nova taxa de análise."
              >
                <Plus className="h-3 w-3 mr-1" /> Novo rolo de análise · +{fmtEUR(manualReviewFee)}
              </Button>
            </div>
          )}

      {d.status !== "blocked" && (
        <>
          {/* Size */}
          <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-end">
            <div>
              <Label className="text-[9px] uppercase text-muted-foreground" title="Largura da arte em centímetros, à escala real de impressão.">Largura</Label>
              <Input type="number" min={0.5} step={0.5} value={d.cmW} onChange={(e) => onCmW(+e.target.value || 0.5)} className="h-7 text-xs" />
            </div>
            <button
              type="button"
              onClick={() => setPatch({ keepAspect: !d.keepAspect })}
              className="h-7 w-7 mb-0 rounded border border-border bg-background flex items-center justify-center"
              title={d.keepAspect ? "Proporção travada — ao mudar a largura, a altura ajusta automaticamente." : "Proporção livre — largura e altura independentes."}
              aria-label={d.keepAspect ? "Destravar proporção" : "Travar proporção"}
            >
              {d.keepAspect ? <Lock className="h-3 w-3 text-primary" /> : <Unlock className="h-3 w-3" />}
            </button>
            <div>
              <Label className="text-[9px] uppercase text-muted-foreground" title="Altura da arte em centímetros, à escala real de impressão.">Altura</Label>
              <Input type="number" min={0.5} step={0.5} value={d.cmH} onChange={(e) => onCmH(+e.target.value || 0.5)} className="h-7 text-xs" />
            </div>
            <span className="text-[9px] text-muted-foreground pb-1.5">cm</span>
          </div>

          {/* Border */}
          {(() => {
            const enabled = d.borderMode !== "none";
            const currentColor =
              d.borderColor ?? (d.borderMode === "black" ? "#0a0a0a" : "#ffffff");
            const setColor = (hex: string) => {
              // Map back to BorderMode for legacy code paths that read it.
              const mode: BorderMode =
                hex.toLowerCase() === "#0a0a0a" || hex.toLowerCase() === "#000000"
                  ? "black"
                  : "white";
              setPatch({ borderMode: mode, borderColor: hex });
            };
            return (
              <div className="rounded-lg border border-border/50 bg-background/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-border/60 shadow-inner"
                      style={{ background: enabled ? currentColor : "transparent" }}
                      aria-hidden
                    />
                    <Label
                      className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
                      title="Adiciona um contorno colorido em volta do desenho, seguindo a silhueta real da arte."
                    >
                      Contorno
                    </Label>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      setPatch({
                        borderMode: v ? (d.borderMode === "none" ? "white" : d.borderMode) : "none",
                        borderColor: v ? (d.borderColor ?? "#ffffff") : d.borderColor,
                      })
                    }
                  />
                </div>

                {enabled && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {BORDER_PRESETS.map((c) => {
                        const active = currentColor.toLowerCase() === c.value.toLowerCase();
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setColor(c.value)}
                            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                              active
                                ? "border-primary ring-2 ring-primary/30 scale-110"
                                : "border-border/60"
                            }`}
                            style={{ background: c.value }}
                            title={c.name}
                            aria-label={`Cor ${c.name}`}
                          />
                        );
                      })}
                      <label
                        className="h-6 w-6 rounded-full border-2 border-dashed border-border/60 hover:border-primary cursor-pointer flex items-center justify-center relative overflow-hidden"
                        title="Cor personalizada"
                      >
                        <span
                          className="absolute inset-0.5 rounded-full"
                          style={{
                            background:
                              "conic-gradient(from 0deg,#ef4444,#facc15,#22c55e,#3b82f6,#a855f7,#ef4444)",
                          }}
                          aria-hidden
                        />
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) => setColor(e.target.value)}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          aria-label="Escolher cor personalizada"
                        />
                      </label>
                    </div>
                    <div>
                      <Label className="text-[9px] uppercase text-muted-foreground">
                        Espessura do contorno (mm)
                      </Label>
                      <div className="flex items-stretch gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          aria-label="Diminuir espessura em 1 mm"
                          onClick={() => {
                            const n = Math.max(1, Math.round(d.borderMm) - 1);
                            if (n === Math.round(d.borderMm)) return;
                            setPatch({ borderMm: n });
                          }}
                          disabled={Math.round(d.borderMm) <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <div className="flex-1 h-9 rounded-md border border-border/60 bg-muted/30 flex items-center justify-center text-sm font-semibold tabular-nums">
                          {Math.round(d.borderMm)} <span className="text-muted-foreground font-normal ml-1">mm</span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          aria-label="Aumentar espessura em 1 mm"
                          onClick={() => {
                            const n = Math.min(50, Math.round(d.borderMm) + 1);
                            if (n === Math.round(d.borderMm)) return;
                            setPatch({ borderMm: n });
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      O contorno segue a silhueta real do desenho, não o retângulo do ficheiro.
                    </p>
                  </>
                )}
              </div>
            );
          })()}

          {/* Auto rotate */}
          <label className="flex items-center justify-between text-[10px] gap-3" title="Permite ao 'Organizar', 'Preencher' e 'Distribuir' rodar esta arte para aproveitar melhor o espaço.">
            <span className="flex-1">
              Rotação automática
              <span className="block text-[9px] text-muted-foreground font-normal">Deixa o sistema rodar para encaixar melhor.</span>
            </span>
            <Switch checked={d.allowAutoRotate} onCheckedChange={(v) => setPatch({ allowAutoRotate: v })} />
          </label>

          {/* Quantity */}
          <div className="grid grid-cols-[60px_1fr_auto] gap-1.5 items-end">
            <div>
              <Label className="text-[9px] uppercase text-muted-foreground" title="Número total de cópias deste design que queres no pedido.">Qtd.</Label>
              <Input
                type="number" min={1} step={1}
                value={d.desiredQty === 0 ? "" : d.desiredQty}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setPatch({ desiredQty: 0 }); return; }
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) setPatch({ desiredQty: Math.max(0, n) });
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setPatch({ desiredQty: !n || n < 1 ? 1 : n });
                }}
                className="h-7 text-xs"
              />
            </div>
            <p className="text-[9px] text-muted-foreground leading-tight pb-1">
              Define quantas cópias queres. Usa <b>Aplicar</b> para encaixar no plano atual.
            </p>
            <Button
              size="sm" variant="outline"
              onClick={() => dispatch({ type: "ADD_ITEM_QTY", designId: d.id, qty: d.desiredQty, rollWidthCm, planoHeightCm })}
              disabled={lockedByReview}
              className="h-7 text-[10px]"
              title={lockedByReview ? "Esta arte só pode ser usada no seu rolo dedicado de análise manual." : "Adiciona a quantidade desejada ao plano atual, encaixando automaticamente."}
            >
              Aplicar
            </Button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              size="sm" variant="default"
              onClick={() => dispatch({ type: "ADD_ITEM", designId: d.id, rollWidthCm, planoHeightCm })}
              disabled={lockedByReview}
              className="h-7 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90"
              title={lockedByReview ? "Esta arte só pode ser usada no seu rolo dedicado de análise manual." : "Adiciona 1 cópia no plano atual."}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Adicionar
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => dispatch({ type: "FILL_ROLL", designId: d.id, rollWidthCm, planoHeightCm })}
              disabled={lockedByReview}
              className="h-7 text-[10px]"
              title={lockedByReview ? "Esta arte só pode ser usada no seu rolo dedicado de análise manual." : "Preenche todo o espaço livre do plano atual com cópias deste design, no tamanho definido."}
            >
              Preencher
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => dispatch({ type: "DISTRIBUTE_PAGES", designId: d.id, qty: d.desiredQty, rollWidthCm, planoHeightCm })}
              disabled={lockedByReview}
              className="h-7 text-[10px]"
              title={lockedByReview ? "Esta arte só pode ser usada no seu rolo dedicado de análise manual." : "Cria novos planos automaticamente até alocar toda a quantidade definida."}
            >
              Distribuir
            </Button>
          </div>
          <ul className="text-[9px] text-muted-foreground space-y-0.5 leading-snug border-t border-border/30 pt-2">
            <li><b className="text-foreground">Adicionar</b> · coloca 1 cópia no plano atual.</li>
            <li><b className="text-foreground">Aplicar</b> · encaixa a quantidade no plano atual.</li>
            <li><b className="text-foreground">Preencher</b> · enche o que sobrar no plano atual.</li>
            <li><b className="text-foreground">Distribuir</b> · usa vários planos para a quantidade pedida.</li>
          </ul>
        </>
      )}
        </div>
      )}
    </Card>
  );
};

/* ============================================================
 * Canvas
 * ============================================================ */
const PlanoCanvas = ({
  plano, designs, rollWidthCm, planoHeightCm, zoom, selectedId, marginMm, onSelect, dispatch, onContextMenu, fullscreen, onExitFullscreen, viewBg = "gray", previewQuality = "high",
}: {
  plano: Plano; designs: Design[]; rollWidthCm: number; planoHeightCm: number; zoom: number;
  selectedId: string | null; marginMm: number;
  onSelect: (id: string | null) => void;
  dispatch: React.Dispatch<Action>;
  onContextMenu: (itemId: string, x: number, y: number) => void;
  fullscreen?: boolean; onExitFullscreen?: () => void;
  viewBg?: "gray" | "white" | "black";
  previewQuality?: "high" | "fast";
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [fitPxPerCm, setFitPxPerCm] = useState(6);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; sl: number; st: number; pid: number } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    const compute = () => {
      const cw = el.clientWidth - 56;
      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      const base = isMobile ? Math.max(4, Math.min(14, cw / rollWidthCm)) : Math.max(3, Math.min(20, cw / rollWidthCm));
      setFitPxPerCm(base);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rollWidthCm]);

  const pxPerCm = fitPxPerCm * zoom;
  const wPx = rollWidthCm * pxPerCm;
  const hPx = planoHeightCm * pxPerCm;
  const marginCm = mmToCm(marginMm);

  const xTicks = Array.from({ length: Math.floor(rollWidthCm / 5) + 1 }, (_, i) => i * 5);
  const yTicks = Array.from({ length: Math.floor(planoHeightCm / 10) + 1 }, (_, i) => i * 10);

  const startPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.pointerType === "touch") { onSelect(null); return; }
    const wrap = wrapperRef.current; if (!wrap) return;
    onSelect(null);
    setIsPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    panRef.current = { sx: e.clientX, sy: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, pid: e.pointerId };
  };
  const movePan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    const wrap = wrapperRef.current; if (!wrap) return;
    wrap.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.sx);
    wrap.scrollTop = panRef.current.st - (e.clientY - panRef.current.sy);
  };
  const endPan = () => { panRef.current = null; setIsPanning(false); };

  return (
    <div ref={wrapperRef}
      className={fullscreen
        ? "fixed inset-0 z-50 bg-background overflow-auto"
        : "relative rounded-xl border border-border/60 bg-background/40 overflow-auto"}
      style={fullscreen ? { isolation: "isolate" } : { maxHeight: "min(60vh, 720px)", minHeight: 320, isolation: "isolate", overscrollBehavior: "auto" }}>
      {/* SVG defs: per-item stroke filters are inlined inside each CanvasItem */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border/40 px-4 py-2 flex items-center gap-3">
        <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Largura útil</span>
        <span className="text-sm font-semibold text-primary">{rollWidthCm} cm</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Máx. {planoHeightCm} cm{marginMm > 0 ? ` · margem ${marginMm}mm` : ""}</span>
        {fullscreen && <Button size="sm" variant="ghost" onClick={onExitFullscreen} className="h-7 ml-2 gap-1"><Minimize2 className="h-3 w-3" /> Sair</Button>}
      </div>

      <div className="p-4 pt-2">
        <div className="inline-block" style={{ paddingLeft: 28, paddingTop: 22 }}>
          <div className="relative" style={{ width: wPx, height: 18, marginLeft: 0, marginTop: -22 }}>
            {xTicks.map((cm) => (
              <div key={cm} className="absolute top-0 flex flex-col items-center" style={{ left: cm * pxPerCm - 1 }}>
                <span className="text-[9px] font-mono text-muted-foreground leading-none">{cm}</span>
                <span className="block w-px h-1.5 bg-border mt-0.5" />
              </div>
            ))}
          </div>

          <div className="relative" style={{ display: "flex" }}>
            <div className="relative shrink-0" style={{ width: 28, height: hPx, marginLeft: -28 }}>
              {yTicks.map((cm) => (
                <div key={cm} className="absolute right-1 flex items-center gap-1" style={{ top: cm * pxPerCm - 6 }}>
                  <span className="text-[9px] font-mono text-muted-foreground leading-none">{cm}</span>
                  <span className="block h-px w-1.5 bg-border" />
                </div>
              ))}
            </div>

            {(() => {
              const bgColor = viewBg === "white" ? "#ffffff" : viewBg === "black" ? "#111111" : "#6b7280";
              const gridMinor = viewBg === "white" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
              const gridMajor = viewBg === "white" ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.18)";
              return (
            <div
              className={`relative border border-primary/40 shadow-inner sm:${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
              style={{
                width: wPx, height: hPx, touchAction: "pan-y",
                backgroundColor: bgColor,
                backgroundImage: `linear-gradient(${gridMinor} 1px,transparent 1px), linear-gradient(90deg,${gridMinor} 1px,transparent 1px), linear-gradient(${gridMajor} 1px,transparent 1px), linear-gradient(90deg,${gridMajor} 1px,transparent 1px)`,
                backgroundSize: `${pxPerCm}px ${pxPerCm}px, ${pxPerCm}px ${pxPerCm}px, ${pxPerCm * 5}px ${pxPerCm * 5}px, ${pxPerCm * 5}px ${pxPerCm * 5}px`,
              }}
              onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
            >
              {/* Safety margin overlay — área útil do rolo */}
              {marginCm > 0 && (
                <div className="absolute pointer-events-none border-2 border-dashed border-primary/60 rounded-[2px]" style={{
                  left: marginCm * pxPerCm, top: marginCm * pxPerCm,
                  width: (rollWidthCm - 2 * marginCm) * pxPerCm,
                  height: (planoHeightCm - 2 * marginCm) * pxPerCm,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
                }}>
                  <span className="absolute -top-4 left-0 text-[9px] font-medium text-primary/80 uppercase tracking-wide">área útil · margem {marginMm}mm</span>
                </div>
              )}

              {[...plano.items].sort((a, b) => a.z - b.z).map((it) => {
                const d = designs.find((x) => x.id === it.designId);
                return (
                  <CanvasItem key={it.id} item={it} design={d} pxPerCm={pxPerCm}
                    isSelected={selectedId === it.id}
                    rollWidthCm={rollWidthCm} planoHeightCm={planoHeightCm} marginCm={marginCm}
                    onSelect={() => onSelect(it.id)} dispatch={dispatch}
                    onContextMenu={(x, y) => onContextMenu(it.id, x, y)}
                    previewQuality={previewQuality} />
                );
              })}
            </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

const CanvasItem = ({
  item, design, pxPerCm, isSelected, rollWidthCm, planoHeightCm, marginCm, onSelect, dispatch, onContextMenu, previewQuality = "high",
}: {
  item: PlacedItem; design?: Design; pxPerCm: number; isSelected: boolean;
  rollWidthCm: number; planoHeightCm: number; marginCm: number;
  onSelect: () => void; dispatch: React.Dispatch<Action>;
  onContextMenu: (x: number, y: number) => void;
  previewQuality?: "high" | "fast";
}) => {
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; ow: number; oh: number; ratio: number; locked: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); onSelect();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.sx) / pxPerCm;
    const dy = (e.clientY - dragRef.current.sy) / pxPerCm;
    const bb = design && design.borderMode !== "none" ? mmToCm(design.borderMm) : 0;
    const { x: nx, y: ny } = clampPosWithBorder(
      dragRef.current.ox + dx, dragRef.current.oy + dy,
      item.widthCm, item.heightCm, bb, marginCm, rollWidthCm, planoHeightCm,
    );
    dispatch({ type: "MOVE_ITEM", id: item.id, x: nx, y: ny });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: item.widthCm, oh: item.heightCm, ratio: item.heightCm > 0 ? item.widthCm / item.heightCm : 1, locked: item.locked };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dx = (e.clientX - resizeRef.current.sx) / pxPerCm;
    const dy = (e.clientY - resizeRef.current.sy) / pxPerCm;
    let w = resizeRef.current.ow + dx;
    let h = resizeRef.current.oh + dy;
    if (resizeRef.current.locked) {
      const s = Math.max(w / resizeRef.current.ow, h / resizeRef.current.oh);
      w = resizeRef.current.ow * s; h = w / resizeRef.current.ratio;
    }
    const bb = design && design.borderMode !== "none" ? mmToCm(design.borderMm) : 0;
    const maxW = Math.max(1, rollWidthCm - marginCm - bb - item.x);
    const maxH = Math.max(1, planoHeightCm - marginCm - bb - item.y);
    w = clamp(w, 1, maxW); h = clamp(h, 1, maxH);
    dispatch({ type: "RESIZE_ITEM", id: item.id, widthCm: w, heightCm: h });
  };
  const onResizeUp = () => { resizeRef.current = null; };

  // Rotation: render the image inside an inner box sized to the PRE-rotation
  // dimensions (heightCm × widthCm when rotated 90°/270°), then apply the CSS
  // rotation. The image fills the inner box (no object-contain) so no
  // letterbox is created around the art — the bbox equals the rotated art.
  const isQuarter = item.rotation % 180 !== 0;
  const bboxWpx = item.widthCm * pxPerCm;
  const bboxHpx = item.heightCm * pxPerCm;
  const innerW = isQuarter ? bboxHpx : bboxWpx;
  const innerH = isQuarter ? bboxWpx : bboxHpx;

  const border = design && design.borderMode !== "none"
    ? {
        color:
          design.borderColor ??
          (design.borderMode === "white" ? "#ffffff" : "#000000"),
        mm: design.borderMm,
      }
    : null;
  // SVG morphology radius is in CSS pixels of the source graphic. The image
  // here is rendered with innerW × innerH, so we scale mm → px using pxPerCm.
  const borderRadiusPx = border ? Math.max(0.5, mmToCm(border.mm) * pxPerCm) : 0;
  const filterId = `dtf-stroke-${item.id}`;

  // Clamp z to keep canvas items below the sticky "Largura útil" bar (z-20)
  // and the global header (z-50). Items must stack only among themselves.
  const safeZ = Math.min(15, Math.max(1, item.z));

  return (
    <div
      className={`absolute select-none cursor-move ${isSelected ? "outline outline-2 outline-primary outline-offset-1" : ""}`}
      style={{
        left: item.x * pxPerCm, top: item.y * pxPerCm,
        width: bboxWpx, height: bboxHpx,
        zIndex: safeZ,
      }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); onContextMenu(e.clientX, e.clientY); }}
    >
      {/* SVG defs for contour border (per-item to use exact radius) */}
      {border && design?.url && (
        <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
          <defs>
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              <feMorphology in="SourceAlpha" operator="dilate" radius={borderRadiusPx} result="dilated" />
              <feFlood floodColor={border.color} result="flood" />
              <feComposite in="flood" in2="dilated" operator="in" result="stroke" />
              <feMerge>
                <feMergeNode in="stroke" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      )}

      {design?.url ? (
        <img
          src={design.url}
          alt=""
          draggable={false}
          className="absolute pointer-events-none"
          style={{
            left: "50%", top: "50%",
            width: innerW, height: innerH,
            maxWidth: "none",
            maxHeight: "none",
            transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
            transformOrigin: "center",
            filter: border ? `url(#${filterId})` : undefined,
            // "high" uses the browser's best downsampling; "fast" disables
            // smoothing so drag/zoom is snappier on low-end devices. Neither
            // mode affects the exported file (always rendered from source).
            imageRendering: previewQuality === "fast" ? "pixelated" : ("high-quality" as any),
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center gap-1 bg-muted/40 border border-dashed border-border text-muted-foreground pointer-events-none">
          <FileText className="h-6 w-6 text-primary/70" />
          <span className="text-[9px] uppercase tracking-wider">PDF</span>
        </div>
      )}

      {isSelected && (
        <>
          <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-mono shadow whitespace-nowrap">
            {item.widthCm.toFixed(1)}×{item.heightCm.toFixed(1)}cm
            {design && design.widthPx > 0 && (() => {
              const refPx = isQuarter ? design.heightPx : design.widthPx;
              const dpi = effectiveDpi(refPx, item.widthCm);
              const tone = dpi >= 300 ? "text-emerald-200" : dpi >= 200 ? "text-amber-200" : "text-red-200";
              return <span className={`ml-2 ${tone}`}>· {dpi} dpi</span>;
            })()}
          </span>
          <span className="absolute -right-1 -bottom-1 h-4 w-4 bg-primary border-2 border-background rounded-sm cursor-se-resize"
            onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />
        </>
      )}
    </div>
  );
};

export default Configurator;

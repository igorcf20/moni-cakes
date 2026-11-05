// IndexedDB store for rendered configurator plano blobs awaiting upload after checkout.

const DB = "bom-dtf-pending-designs";
const STORE = "blobs";

export type PendingPlano = {
  index: number;
  name: string;
  png: Blob;
  preview: Blob;
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** How many printed copies the customer wants of this plano. */
  copies?: number;
  /** Real bbox actually rendered (cm). When present, the layout PNG is the
   *  cropped area only, not the full roll. */
  bboxCm?: { widthCm: number; heightCm: number };
  /** Print-ready PDF for this plano (single page, native resolution). */
  pdf?: Blob;
};

export type PendingPayload = {
  cartItemKey: string;
  planos: PendingPlano[];
  /** Original files uploaded by the customer (PNG/PDF) — kept untouched so the
   *  admin can download the exact source bytes. */
  originals?: Array<{ name: string; type: string; size: number; blob: Blob }>;
  /** Deprecated: aggregated PDF for the whole order. Per-plano PDFs in
   *  `planos[i].pdf` are preferred. Kept for backwards compat. */
  orderPdf?: Blob;
  createdAt: string;
};

const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no idb"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

export async function putPending(key: string, payload: PendingPayload) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, key);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}

export async function getPending(key: string): Promise<PendingPayload | null> {
  try {
    const db = await open();
    return await new Promise<PendingPayload | null>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as PendingPayload) || null);
      r.onerror = () => rej(r.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function delPending(key: string) {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    });
  } catch {}
}

export async function listPendingKeys(): Promise<string[]> {
  try {
    const db = await open();
    return await new Promise<string[]>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).getAllKeys();
      r.onsuccess = () => res((r.result as string[]) || []);
      r.onerror = () => rej(r.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}
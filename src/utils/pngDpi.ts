// Sets the pHYs chunk of a PNG to encode the desired DPI.
// PNG spec: pHYs chunk = pixels per unit X (4 bytes) + Y (4 bytes) + unit (1 byte, 1 = meter).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
};

const concatBytes = (...parts: Uint8Array[]) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // verify signature
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return blob;

  const dpm = Math.round(dpi * 39.3701); // dots per meter
  const pHYsData = concatBytes(u32(dpm), u32(dpm), new Uint8Array([1]));
  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // 'pHYs'
  const crc = crc32(concatBytes(type, pHYsData));
  const chunk = concatBytes(u32(pHYsData.length), type, pHYsData, u32(crc));

  // Walk chunks: find IHDR (always first); strip any existing pHYs; insert new pHYs right after IHDR.
  const parts: Uint8Array[] = [PNG_SIG];
  let i = 8;
  let inserted = false;
  while (i < buf.length) {
    const length =
      (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const type4 = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    const total = 12 + (length >>> 0);
    const slice = buf.subarray(i, i + total);
    if (type4 === "pHYs") {
      // skip existing
    } else {
      parts.push(slice);
      if (!inserted && type4 === "IHDR") {
        parts.push(chunk);
        inserted = true;
      }
    }
    i += total;
  }
  return new Blob([concatBytes(...parts)], { type: "image/png" });
}
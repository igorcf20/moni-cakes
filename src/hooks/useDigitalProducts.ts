// =============================================================================================
// Produtos digitais (recurso digital_products). Regras em src/lib/digitalProducts.ts e na migration
// 20261007110000_digital_products.sql.
//   useProductDigital(id)       configuração ativa do produto (página do produto); null = produto normal
//   useDigitalOnlyIds(ids)      produtos do carrinho sem entrega física (checkout sem frete)
//   useMyDownloads / useStartDownload   conta do cliente: acessos e download (URL assinada logo depois de registar)
//   Admin: useAdminProductDigital, useSaveProductDigital, useDeleteProductDigital, useDigitalFiles, useUploadDigitalFile,
//          useAddDigitalLink, useDeleteDigitalFile, useLicenseKeys, useAddLicenseKeys, useDeleteLicenseKey,
//          useAdminDigitalGrants, useAdminGrantUpdate, useAdminDigitalProducts
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { digitalErrorOf, digitalStoragePath, normalizeProductDigital, type GrantFile, type ProductDigital } from "@/lib/digitalProducts";

const sb = supabase as any;
const BUCKET = "digital-files";

export function useProductDigital(productId: string | null | undefined): ProductDigital | null {
  const on = useFeature("digital_products");
  const q = useQuery({
    queryKey: ["product-digital", productId ?? ""],
    enabled: on && !!productId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductDigital | null> => {
      const { data, error } = await sb.from("product_digital").select("*").eq("product_id", productId).eq("is_active", true).maybeSingle();
      if (error || !data) return null;
      return normalizeProductDigital(data);
    },
  });
  return on ? q.data ?? null : null;
}

/** Produtos digitais entre os ids pedidos: all = todos, ids = só os sem entrega física (vazio com o recurso desligado). */
export function useDigitalOnlyIds(productIds: string[]) {
  const on = useFeature("digital_products");
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const q = useQuery({
    queryKey: ["digital-only", ids.join(",")],
    enabled: on && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ product_id: string; ships: boolean }[]> => {
      const { data, error } = await sb.from("product_digital").select("product_id,ships").in("product_id", ids).eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ product_id: String(r.product_id), ships: r.ships === true }));
    },
  });
  const rows = on ? q.data ?? [] : [];
  return {
    ids: new Set(rows.filter((r) => !r.ships).map((r) => r.product_id)),
    all: new Set(rows.map((r) => r.product_id)),
    isLoading: on && ids.length > 0 && q.isLoading,
  };
}

/* ---------- Conta do cliente ---------- */

export type MyDownload = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  download_limit: number | null;
  expires_at: string | null;
  status: string;
  created_at: string;
  product: { id: string; name: string; image: string | null } | null;
  instructions_i18n: Record<string, string>;
  license_keys: boolean;
  files: GrantFile[];
  keys: string[];
};

export function useMyDownloads(enabled = true) {
  return useQuery({
    queryKey: ["my-downloads"],
    enabled,
    queryFn: async (): Promise<MyDownload[]> => {
      const { data, error } = await sb.rpc("my_digital_downloads");
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });
}

/** Regista o download no servidor e abre o arquivo (URL assinada de 2 minutos) ou o link externo. */
export function useStartDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, fileId }: { grantId: string; fileId: string }): Promise<string> => {
      const { data, error } = await sb.rpc("digital_download_start", { _grant: grantId, _file: fileId });
      if (error) throw new Error(digitalErrorOf(error.message));
      if (data?.url) return String(data.url);
      const { data: signed, error: e2 } = await supabase.storage.from(BUCKET).createSignedUrl(String(data?.path ?? ""), 120, { download: String(data?.name ?? true) });
      if (e2 || !signed?.signedUrl) throw new Error("unknown");
      return signed.signedUrl;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-downloads"] }),
  });
}

/* ---------- Admin: produto ---------- */

export function useAdminProductDigital(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["admin-product-digital", productId ?? ""],
    enabled: !!productId,
    queryFn: async (): Promise<ProductDigital | null> => {
      const { data, error } = await sb.from("product_digital").select("*").eq("product_id", productId).maybeSingle();
      if (error) throw error;
      return data ? normalizeProductDigital(data) : null;
    },
  });
}

const invalidateProduct = (qc: ReturnType<typeof useQueryClient>, productId: string) => {
  qc.invalidateQueries({ queryKey: ["admin-product-digital", productId] });
  qc.invalidateQueries({ queryKey: ["product-digital", productId] });
  qc.invalidateQueries({ queryKey: ["digital-only"] });
  qc.invalidateQueries({ queryKey: ["admin-digital-products"] });
};

export function useSaveProductDigital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: ProductDigital) => {
      const { error } = await sb.from("product_digital").upsert({
        product_id: d.product_id, is_active: d.is_active, download_limit: d.download_limit, access_days: d.access_days,
        license_keys: d.license_keys, ships: d.ships, instructions_i18n: d.instructions_i18n, updated_at: new Date().toISOString(),
      }, { onConflict: "product_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateProduct(qc, v.product_id),
  });
}

export function useDeleteProductDigital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await sb.from("product_digital").delete().eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: (_d, productId) => invalidateProduct(qc, productId),
  });
}

export type DigitalFileRow = { id: string; product_id: string; name: string; storage_path: string | null; url: string | null; size_bytes: number | null; sort: number; created_at: string };

export function useDigitalFiles(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["digital-files", productId ?? ""],
    enabled: !!productId,
    queryFn: async (): Promise<DigitalFileRow[]> => {
      const { data, error } = await sb.from("digital_files").select("*").eq("product_id", productId).order("sort").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

const invalidateFiles = (qc: ReturnType<typeof useQueryClient>, productId: string) => {
  qc.invalidateQueries({ queryKey: ["digital-files", productId] });
  qc.invalidateQueries({ queryKey: ["admin-digital-products"] });
};

export function useUploadDigitalFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, file, sort }: { productId: string; file: File; sort: number }) => {
      const path = digitalStoragePath(productId, file.name, crypto.randomUUID().slice(0, 8));
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      const { error } = await sb.from("digital_files").insert({ product_id: productId, name: file.name.slice(0, 200), storage_path: path, size_bytes: file.size, sort });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: (_d, v) => invalidateFiles(qc, v.productId),
  });
}

export function useAddDigitalLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, name, url, sort }: { productId: string; name: string; url: string; sort: number }) => {
      const { error } = await sb.from("digital_files").insert({ product_id: productId, name: name.slice(0, 200), url, sort });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateFiles(qc, v.productId),
  });
}

export function useDeleteDigitalFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: DigitalFileRow) => {
      const { error } = await sb.from("digital_files").delete().eq("id", f.id);
      if (error) throw error;
      if (f.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path]);
    },
    onSuccess: (_d, f) => invalidateFiles(qc, f.product_id),
  });
}

/** Abre um arquivo no Admin (URL assinada curta). */
export async function openDigitalFileAsAdmin(f: DigitalFileRow): Promise<string | null> {
  if (f.url) return f.url;
  if (!f.storage_path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, { download: f.name });
  return data?.signedUrl ?? null;
}

export type LicenseKeyRow = { id: string; product_id: string; license_code: string; grant_id: string | null; assigned_at: string | null; created_at: string };

export function useLicenseKeys(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["license-keys", productId ?? ""],
    enabled: !!productId,
    queryFn: async (): Promise<LicenseKeyRow[]> => {
      const { data, error } = await sb.from("digital_license_keys").select("*").eq("product_id", productId).order("created_at").limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const invalidateKeys = (qc: ReturnType<typeof useQueryClient>, productId: string) => {
  qc.invalidateQueries({ queryKey: ["license-keys", productId] });
  qc.invalidateQueries({ queryKey: ["admin-digital-grants"] });
  qc.invalidateQueries({ queryKey: ["admin-digital-products"] });
};

/** Acrescenta chaves (as repetidas ficam de fora); devolve quantas entraram. */
export function useAddLicenseKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, keys }: { productId: string; keys: string[] }): Promise<number> => {
      if (!keys.length) return 0;
      const { data, error } = await sb.from("digital_license_keys")
        .upsert(keys.map((k) => ({ product_id: productId, license_code: k })), { onConflict: "product_id,license_code", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    onSuccess: (_d, v) => invalidateKeys(qc, v.productId),
  });
}

export function useDeleteLicenseKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (k: LicenseKeyRow) => {
      const { error } = await sb.from("digital_license_keys").delete().eq("id", k.id).is("grant_id", null);
      if (error) throw error;
    },
    onSuccess: (_d, k) => invalidateKeys(qc, k.product_id),
  });
}

/* ---------- Admin: acessos ---------- */

export type AdminGrantRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  user_id: string | null;
  quantity: number;
  download_limit: number | null;
  expires_at: string | null;
  status: string;
  reset_at: string | null;
  created_at: string;
  product: { id: string; name: string; image: string | null } | null;
  order: { status: string; total: number; name: string | null };
  downloads: number;
  downloads_30d: number;
  last_download: string | null;
  max_used: number;
  files: number;
  license_keys: boolean;
  keys: number;
  customer: { full_name: string | null; email: string | null } | null;
};

export function useAdminDigitalGrants() {
  return useQuery({
    queryKey: ["admin-digital-grants"],
    queryFn: async (): Promise<AdminGrantRow[]> => {
      const { data, error } = await sb.rpc("admin_digital_grants");
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : [];
      const { data: customers } = rows.length ? await sb.rpc("admin_list_customers") : { data: [] };
      const byId = new Map((customers ?? []).map((p: any) => [p.user_id, p]));
      return rows.map((r) => {
        const p: any = r.user_id ? byId.get(r.user_id) : null;
        const fallback = r.order?.name ?? null;
        return {
          ...r,
          downloads: Number(r.downloads) || 0, downloads_30d: Number(r.downloads_30d) || 0, max_used: Number(r.max_used) || 0, files: Number(r.files) || 0, keys: Number(r.keys) || 0,
          customer: p ? { full_name: p.full_name ?? fallback, email: p.email ?? null } : fallback ? { full_name: fallback, email: null } : null,
        };
      });
    },
  });
}

const GRANT_CODES = ["not_allowed", "not_found", "invalid_action", "invalid_value"];

export function useAdminGrantUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; action: "revoke" | "restore" | "reset" | "expires" | "limit"; value?: number | null }) => {
      const { error } = await sb.rpc("admin_digital_grant_update", { _id: v.id, _action: v.action, _value: v.value ?? null });
      if (error) throw new Error(GRANT_CODES.find((c) => String(error.message).includes(c)) ?? "unknown");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-digital-grants"] }),
  });
}

export type AdminDigitalProductRow = ProductDigital & {
  product: { id: string; name: string; image: string | null } | null;
  files: number;
  keys_free: number;
  keys_used: number;
};

/** Produtos digitais com o número de arquivos e de chaves livres (aba Produtos de Admin > Downloads). */
export function useAdminDigitalProducts() {
  return useQuery({
    queryKey: ["admin-digital-products"],
    queryFn: async (): Promise<AdminDigitalProductRow[]> => {
      const [{ data: rows, error }, { data: files }, { data: keys }] = await Promise.all([
        sb.from("product_digital").select("*, products(id,name,image)").order("updated_at", { ascending: false }),
        sb.from("digital_files").select("product_id"),
        sb.from("digital_license_keys").select("product_id,grant_id").limit(20000),
      ]);
      if (error) throw error;
      const count = (list: any[] | null, pid: string, pred: (x: any) => boolean = () => true) => (list ?? []).filter((x) => x.product_id === pid && pred(x)).length;
      return (rows ?? []).map((r: any) => ({
        ...normalizeProductDigital(r),
        product: r.products ?? null,
        files: count(files, r.product_id),
        keys_free: count(keys, r.product_id, (k) => !k.grant_id),
        keys_used: count(keys, r.product_id, (k) => !!k.grant_id),
      }));
    },
  });
}

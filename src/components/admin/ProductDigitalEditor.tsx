// =====================================================================================
// Aba Digital da página do produto no Admin (/admin/produto/<id>?tab=digital; recurso digital_products):
//   Regras    produto digital, também tem entrega, downloads por arquivo, dias de acesso, chaves, instruções
//   Arquivos  envio para o bucket privado digital-files (até 50 MB) ou link https; abrir e excluir (com confirmação)
//   Chaves    colar uma por linha, contagem de livres e entregues, excluir as livres
// Grava em product_digital, digital_files e digital_license_keys (migration 20261007110000_digital_products.sql).
// =====================================================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileDown, KeyRound, Link2, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminDigitalMessages, type AdminDigitalKey } from "@/i18n/adminDigital";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  openDigitalFileAsAdmin, useAddDigitalLink, useAddLicenseKeys, useAdminProductDigital, useDeleteDigitalFile, useDeleteLicenseKey,
  useDeleteProductDigital, useDigitalFiles, useLicenseKeys, useSaveProductDigital, useUploadDigitalFile, type DigitalFileRow,
} from "@/hooks/useDigitalProducts";
import { DIGITAL_MAX_BYTES, formatBytes, normalizeProductDigital, parseLicenseKeys } from "@/lib/digitalProducts";

const LOCALES = [["pt-BR", "lang_pt_BR"], ["pt-PT", "lang_pt_PT"], ["en", "lang_en"], ["es", "lang_es"]] as const;
type Form = { on: boolean; ships: boolean; limit: string; days: string; keys: boolean; instructions: Record<string, string> };
const EMPTY: Form = { on: true, ships: false, limit: "", days: "", keys: false, instructions: {} };
const box = "space-y-4 rounded-[18px] border bg-card p-4 sm:p-5";

export default function ProductDigitalEditor({ productId }: { productId: string }) {
  const { t } = useMessages(adminDigitalMessages);
  const { data: saved, isLoading } = useAdminProductDigital(productId);
  const save = useSaveProductDigital();
  const remove = useDeleteProductDigital();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<Form>({ ...EMPTY, on: false });
  useEffect(() => {
    if (saved) setF({ on: saved.is_active, ships: saved.ships, limit: saved.download_limit ? String(saved.download_limit) : "", days: saved.access_days ? String(saved.access_days) : "", keys: saved.license_keys, instructions: saved.instructions_i18n });
  }, [saved]);

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const submit = async () => {
    try {
      await save.mutateAsync(normalizeProductDigital({
        product_id: productId, is_active: f.on, ships: f.ships, download_limit: f.limit, access_days: f.days, license_keys: f.keys, instructions_i18n: f.instructions,
      }));
      toast.success(t("p_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const drop = async () => {
    if (!(await ask(t("p_confirm_remove"), { confirmLabel: t("p_remove") }))) return;
    try {
      await remove.mutateAsync(productId);
      setF({ ...EMPTY, on: false });
      toast.success(t("p_removed"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const toggle = (id: string, key: "on" | "ships" | "keys", label: AdminDigitalKey, hint: AdminDigitalKey) => (
    <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-semibold">{t(label)}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{t(hint)}</p>
      </div>
      <Switch id={id} checked={f[key]} onCheckedChange={(v) => setF({ ...f, [key]: v })} />
    </div>
  );

  return (
    <div className="space-y-5">
      <section className={box}>
        <p className="text-sm text-muted-foreground">{t("p_hint")}</p>
        {toggle("pd-on", "on", "p_on", "p_on_d")}
        {toggle("pd-ships", "ships", "p_ships", "p_ships_d")}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pd-limit">{t("p_limit")}</Label>
            <Input id="pd-limit" inputMode="numeric" className="max-w-[200px]" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            <p className="text-xs text-muted-foreground">{t("p_limit_d")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pd-days">{t("p_days")}</Label>
            <Input id="pd-days" inputMode="numeric" className="max-w-[200px]" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            <p className="text-xs text-muted-foreground">{t("p_days_d")}</p>
          </div>
        </div>
        {toggle("pd-keys", "keys", "p_keys", "p_keys_d")}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold">{t("p_instructions")}</p>
            <p className="text-xs text-muted-foreground">{t("p_instructions_d")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LOCALES.map(([loc, label]) => (
              <div key={loc} className="grid gap-1">
                <Label htmlFor={`pd-ins-${loc}`} className="text-xs text-muted-foreground">{t(label)}</Label>
                <Textarea id={`pd-ins-${loc}`} rows={3} maxLength={2000} value={f.instructions[loc] ?? ""} onChange={(e) => {
                  const next = { ...f.instructions, [loc]: e.target.value };
                  if (!e.target.value) delete next[loc];
                  setF({ ...f, instructions: next });
                }} />
              </div>
            ))}
          </div>
        </div>
        {confirmSlot}
        <div className="flex flex-wrap justify-end gap-2">
          {saved && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void drop()} disabled={remove.isPending}><Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("p_remove")}</Button>}
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("p_save")}
          </Button>
        </div>
      </section>

      <FilesEditor productId={productId} />
      {saved?.license_keys ? <KeysEditor productId={productId} /> : f.keys && <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{t("keys_off")}</p>}
    </div>
  );
}

/* ---------- Arquivos ---------- */

function FilesEditor({ productId }: { productId: string }) {
  const { t } = useMessages(adminDigitalMessages);
  const { locale } = useAdminFormat();
  const { data: files = [], isLoading } = useDigitalFiles(productId);
  const upload = useUploadDigitalFile();
  const addLink = useAddDigitalLink();
  const del = useDeleteDigitalFile();
  const { ask, confirmSlot } = useInlineConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState({ name: "", url: "" });
  const nextSort = files.length ? Math.max(...files.map((x) => x.sort)) + 1 : 0;

  const onFiles = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      if (file.size > DIGITAL_MAX_BYTES) { toast.error(t("too_big")); continue; }
      try {
        await upload.mutateAsync({ productId, file, sort: nextSort });
        toast.success(t("uploaded"));
      } catch {
        toast.error(t("upload_error"));
      }
    }
    if (input.current) input.current.value = "";
  };
  const submitLink = async () => {
    const name = link.name.trim();
    const url = link.url.trim();
    if (!name || !/^https:\/\/[^\s]+$/i.test(url)) { toast.error(t("link_invalid")); return; }
    try {
      await addLink.mutateAsync({ productId, name, url, sort: nextSort });
      setLink({ name: "", url: "" });
      toast.success(t("link_added"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const open = async (row: DigitalFileRow) => {
    const url = await openDigitalFileAsAdmin(row);
    if (url) window.open(url, "_blank", "noopener");
  };
  const remove = async (row: DigitalFileRow) => {
    if (!(await ask(t("file_confirm_delete", { name: row.name }), { confirmLabel: t("file_delete") }))) return;
    try {
      await del.mutateAsync(row);
      toast.success(t("file_deleted"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  return (
    <section className={box}>
      <div>
        <h4 className="font-semibold">{t("files_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("files_hint")}</p>
      </div>
      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : files.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("files_empty")}</p>
          : (
            <ul className="divide-y rounded-xl border">
              {files.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {row.url ? <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} /> : <FileDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{row.url ? `${t("file_link")} · ${row.url}` : formatBytes(row.size_bytes, locale)}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2 self-end sm:self-auto">
                    <Button variant="outline" size="sm" onClick={() => void open(row)}>{t("file_open")}</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove(row)} disabled={del.isPending}>
                      <Trash2 className="mr-1 h-4 w-4" strokeWidth={1.8} />{t("file_delete")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
      {confirmSlot}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple className="sr-only" id="pd-file" onChange={(e) => void onFiles(e.target.files)} />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
          {upload.isPending ? t("uploading") : t("upload")}
        </Button>
      </div>
      <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="pd-link-name">{t("link_name")}</Label>
          <Input id="pd-link-name" maxLength={200} value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-link-url">{t("link_url")}</Label>
          <Input id="pd-link-url" type="url" inputMode="url" maxLength={2000} placeholder="https://" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
        </div>
        <Button variant="outline" onClick={() => void submitLink()} disabled={addLink.isPending}><Plus className="mr-1.5 h-4 w-4" />{t("link_add")}</Button>
      </div>
    </section>
  );
}

/* ---------- Chaves de licença ---------- */

function KeysEditor({ productId }: { productId: string }) {
  const { t } = useMessages(adminDigitalMessages);
  const { dateTime } = useAdminFormat();
  const { data: keys = [], isLoading } = useLicenseKeys(productId);
  const add = useAddLicenseKeys();
  const del = useDeleteLicenseKey();
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const free = keys.filter((k) => !k.grant_id).length;
  const used = keys.length - free;
  const mask = (k: string) => (show ? k : `${k.slice(0, 4)}${"*".repeat(Math.min(12, Math.max(4, k.length - 4)))}`);

  const submit = async () => {
    const list = parseLicenseKeys(text);
    if (!list.length) return;
    try {
      const n = await add.mutateAsync({ productId, keys: list });
      setText("");
      toast.success(n === 0 ? t("keys_none_new") : n === 1 ? t("keys_added_one") : t("keys_added", { n }));
    } catch {
      toast.error(t("save_error"));
    }
  };

  return (
    <section className={box}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} />{t("keys_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("keys_hint")}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">{t("keys_count", { free, used })}</span>
      </div>
      {keys.length > 0 && free <= 3 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("keys_low")}</p>}
      <div className="space-y-2">
        <Label htmlFor="pd-keys-text">{t("keys_paste")}</Label>
        <Textarea id="pd-keys-text" rows={4} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={add.isPending || !text.trim()}>
            {add.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}{t("keys_add")}
          </Button>
        </div>
      </div>
      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : keys.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("keys_empty")}</p>
          : (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff className="mr-1.5 h-4 w-4" strokeWidth={1.8} /> : <Eye className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{show ? t("keys_hide") : t("keys_show")}
              </Button>
              <ul className="max-h-[360px] divide-y overflow-y-auto rounded-xl border">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <code className="block truncate font-mono text-sm">{mask(k.license_code)}</code>
                      <span className="block text-xs text-muted-foreground">{k.grant_id ? t("key_used", { date: k.assigned_at ? dateTime(k.assigned_at) : "" }) : t("key_free")}</span>
                    </span>
                    {!k.grant_id && (
                      <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={del.isPending}
                        onClick={() => void del.mutateAsync(k).then(() => toast.success(t("key_deleted")), () => toast.error(t("save_error")))}>
                        <Trash2 className="mr-1 h-4 w-4" strokeWidth={1.8} />{t("key_delete")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
    </section>
  );
}

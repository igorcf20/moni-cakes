// =====================================================================================
// Aba Venda cruzada da página do produto no Admin (/admin/produto/<id>?tab=links, recurso cross_sell).
// Duas listas: "Combina com" (carrinho) e "Relacionados" (página do produto), com busca para adicionar, ordem,
// remover e a opção de ligar no sentido contrário. Cada lista grava com o seu botão (RPC admin_set_product_links).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, Loader2, Plus, Save, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { crossSellMessages, type CrossSellKey } from "@/i18n/crossSell";
import { useLinkProductOptions, useProductLinks, useSetProductLinks, type LinkProductOption } from "@/hooks/useCrossSell";
import { moveItem, type LinkKind } from "@/lib/crossSell";
import { cn } from "@/lib/utils";

type T = (key: CrossSellKey, vars?: Record<string, string | number>) => string;

export default function ProductLinksEditor({ productId }: { productId: string }) {
  const { t } = useMessages(crossSellMessages);
  const { data: links, isLoading } = useProductLinks(productId);
  const { data: options = [], isLoading: loadingOptions } = useLinkProductOptions();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  if (isLoading || loadingOptions) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  return (
    <div className="space-y-6">
      {(["cross_sell", "related"] as LinkKind[]).map((kind) => (
        <LinkList key={kind} kind={kind} productId={productId} saved={links?.[kind] ?? []} options={options} byId={byId} t={t} />
      ))}
      <Button variant="outline" size="sm" asChild>
        <Link to={adminHref.section("cross-sell")}><ExternalLink className="mr-1.5 h-4 w-4" />{t("go_rules")}</Link>
      </Button>
    </div>
  );
}

function LinkList({ kind, productId, saved, options, byId, t }: {
  kind: LinkKind; productId: string; saved: string[]; options: LinkProductOption[]; byId: Map<string, LinkProductOption>; t: T;
}) {
  const setLinks = useSetProductLinks(productId);
  const [ids, setIds] = useState<string[]>(saved);
  const [both, setBoth] = useState(kind === "cross_sell");
  const [q, setQ] = useState("");
  const savedKey = saved.join(",");
  useEffect(() => { setIds(savedKey ? savedKey.split(",") : []); }, [savedKey]);
  const dirty = ids.join(",") !== savedKey;

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return options
      .filter((o) => o.id !== productId && !ids.includes(o.id))
      .filter((o) => [o.name, o.id, o.sku ?? "", o.category ?? ""].some((v) => v.toLowerCase().includes(s)))
      .slice(0, 8);
  }, [q, options, ids, productId]);

  const save = () => setLinks.mutate({ kind, ids, both }, {
    onSuccess: () => toast.success(t("list_saved")),
    onError: () => toast.error(t("save_error")),
  });

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">{t(kind === "cross_sell" ? "cross_title" : "related_title")}</h3>
        <p className="text-sm text-muted-foreground">{t(kind === "cross_sell" ? "cross_hint" : "related_hint")}</p>
      </div>

      {ids.length === 0
        ? <p className="rounded-[14px] border border-dashed p-4 text-center text-sm text-muted-foreground">{t("none_yet")}</p>
        : (
          <ol className="divide-y rounded-[14px] border">
            {ids.map((id, i) => {
              const p = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-3 p-2.5">
                  <Thumb src={p?.image ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p?.name ?? id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p?.sku, p?.category].filter(Boolean).join(" · ")}
                      {p && !p.is_active && <span className="ml-1 text-amber-700">{t("hidden")}</span>}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} aria-label={t("move_up")} onClick={() => setIds((cur) => moveItem(cur, i, -1))}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === ids.length - 1} aria-label={t("move_down")} onClick={() => setIds((cur) => moveItem(cur, i, 1))}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("remove")} onClick={() => setIds((cur) => cur.filter((x) => x !== id))}><X className="h-4 w-4" /></Button>
                </li>
              );
            })}
          </ol>
        )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("add_search")} aria-label={t("add_search")} className="pl-9" />
      </div>
      {q.trim() && (
        results.length === 0
          ? <p className="text-sm text-muted-foreground">{t("no_results")}</p>
          : (
            <ul className="divide-y rounded-[14px] border">
              {results.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => { setIds((cur) => [...cur, o.id]); setQ(""); }}
                    className="flex w-full items-center gap-3 p-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <Thumb src={o.image} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[o.sku, o.category].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-orange-text"><Plus className="h-3.5 w-3.5" />{t("add")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox checked={both} onCheckedChange={(v) => setBoth(v === true)} className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium">{t("both")}</span>
            <span className="block text-xs text-muted-foreground">{t("both_hint")}</span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-medium text-amber-700">{t("unsaved")}</span>}
          <Button type="button" onClick={save} disabled={setLinks.isPending || !dirty}>
            {setLinks.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save_list")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Thumb({ src }: { src: string | null }) {
  return src
    ? <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
    : <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground")}><ImageOff className="h-4 w-4" aria-hidden="true" /></span>;
}

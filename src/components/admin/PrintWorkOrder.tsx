import { STORE_DEFAULTS } from "@/config/store";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPrice } from "@/utils/currency";
import type { Order } from "@/hooks/useOrders";

type Design = {
  id: string;
  plano_index: number;
  plano_name: string | null;
  preview_path: string | null;
  width_px: number | null;
  height_px: number | null;
  dpi: number | null;
  copies: number | null;
  originals: Array<{ name: string; size?: number }> | null;
};

const fmtBytes = (b?: number) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const PrintWorkOrder = ({
  order,
  storeName = STORE_DEFAULTS.name,
  storeAddress = "",
  storePhone = "",
  storeEmail = "",
}: {
  order: Order;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
}) => {
  const { data: designs = [], refetch } = useQuery<Design[]>({
    queryKey: ["order-designs-os", order.id],
    enabled: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_designs")
        .select("id, plano_index, plano_name, preview_path, width_px, height_px, dpi, copies, originals")
        .eq("order_id", order.id)
        .order("plano_index", { ascending: true });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        originals: Array.isArray(d.originals) ? d.originals : [],
      }));
    },
  });

  const handlePrint = async () => {
    const result = await refetch();
    const list = result.data || [];

    // Lookup the registered customer profile (name/phone) when the order
    // belongs to an authenticated user.
    let profile: { full_name?: string | null; phone?: string | null } | null = null;
    let userEmail: string | null = null;
    if ((order as any).user_id) {
      try {
        const { data: p } = await (supabase as any)
          .from("user_profiles")
          .select("full_name, phone")
          .eq("user_id", (order as any).user_id)
          .maybeSingle();
        profile = p || null;
      } catch {}
      try {
        const { data: rows } = await (supabase as any).rpc("admin_list_customers");
        const row = (rows || []).find((r: any) => r.user_id === (order as any).user_id);
        if (row?.email) userEmail = row.email;
      } catch {}
    }

    // Collect DPI acceptances stored on order_items.design_data
    const acceptances: Array<{
      designName: string; kind: "low" | "upscale"; effDpi: number; threshold: number; acceptedAt: string;
    }> = [];
    for (const it of ((order as any).order_items || [])) {
      const arr = it?.design_data?.dpiAcceptances;
      if (Array.isArray(arr)) for (const a of arr) acceptances.push(a);
    }
    // Aceitações de redução proporcional (arte mais larga que o rolo).
    const oversizeAcc: Array<{
      fileName: string; productName: string; rollWidthCm: number;
      originalCmW: number; originalCmH: number; adjustedCmW: number; adjustedCmH: number;
      acceptedAt: string; acceptedText: string;
    }> = [];
    for (const it of ((order as any).order_items || [])) {
      const arr = it?.design_data?.oversizeAcceptances;
      if (Array.isArray(arr)) for (const a of arr) oversizeAcc.push(a);
    }

    // Optional per-roll verification fees contracted by the customer.
    const verificationLines: Array<{
      planoId: string; planoName: string; verify: boolean; fee: number;
      copies?: number; declinedAt?: string;
    }> = [];
    for (const it of ((order as any).order_items || [])) {
      const arr = it?.design_data?.verificationLines;
      if (Array.isArray(arr)) for (const v of arr) verificationLines.push(v);
    }
    const verifiedRolls = verificationLines.filter((v) => v.verify);
    const declinedRolls = verificationLines.filter((v) => !v.verify);
    const verificationTotal = verifiedRolls.reduce((s, v) => s + Number(v.fee || 0), 0);

    // Pre-sign previews so the print window can render thumbnails.
    const previews: Record<string, string> = {};
    for (const d of list) {
      if (!d.preview_path) continue;
      const { data } = await supabase.storage
        .from("dtf-uploads")
        .createSignedUrl(d.preview_path, 60 * 60);
      if (data?.signedUrl) previews[d.id] = data.signedUrl;
    }

    const addr = (order.shipping_address as any) || {};
    const created = format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
    const orderId = order.id.slice(0, 8).toUpperCase();

    const customerName =
      (profile?.full_name && profile.full_name.trim()) ||
      (order as any).guest_name ||
      addr.recipient_name ||
      addr.name ||
      "—";
    const customerEmail = userEmail || (order as any).guest_email || "";
    const customerPhone = profile?.phone || addr.phone || (order as any).guest_phone || "";

    const itemsRows = ((order as any).order_items || [])
      .map(
        (it: any) => {
          const meters = Number(it?.design_data?.totalMeters ?? it?.length_m ?? 0);
          const qtyCell = meters > 0
            ? `${meters.toFixed(2).replace(".", ",")} m`
            : `${it.quantity || 1}`;
          // If any plano of this item is printed more than once, surface it
          // in the items table so the operator can't miss it before flipping
          // to the "Ficheiros de impressão" section further down.
          const planosArr: any[] = Array.isArray(it?.design_data?.planos) ? it.design_data.planos : [];
          const copiesNote = planosArr
            .filter((p) => Number(p?.copies || 1) > 1)
            .map((p) => `× ${Number(p.copies)} cópias${p?.name ? ` de ${escapeHtml(p.name)}` : ""}`)
            .join(" · ");
          return `
        <tr>
          <td>
            ${escapeHtml(it.products?.name || it.design_data?.product_name || it.name || "—")}
            ${copiesNote ? `<div style="font-size:9pt;color:#7c2d12;font-weight:700;margin-top:1mm">⚠ ${copiesNote}</div>` : ""}
          </td>
          <td style="text-align:center">${qtyCell}</td>
          <td style="text-align:right">${formatPrice(Number(it.price || 0) * Number(it.quantity || 1))}</td>
        </tr>`;
        },
      )
      .join("");

    const planosBlocks = list
      .map((d) => {
        const origs = (d.originals || [])
          .map((o) => `<li>${escapeHtml(o.name)} <span class="muted">(${fmtBytes(o.size)})</span></li>`)
          .join("");
        const copies = Math.max(1, d.copies || 1);
        const isMulti = copies > 1;
        return `
        <div class="plano${isMulti ? " plano-multi" : ""}">
          <div class="plano-head${isMulti ? " plano-head-multi" : ""}">
            <h3>Página ${d.plano_index + 1}${d.plano_name ? ` · ${escapeHtml(d.plano_name)}` : ""}</h3>
            <div class="badge${isMulti ? " badge-multi" : ""}">${isMulti ? `⚠ IMPRIMIR × ${copies}` : "1 cópia"}</div>
          </div>
          <div class="plano-body">
            <div class="thumb">${previews[d.id] ? `<img src="${previews[d.id]}" alt="" />` : "<span class='muted'>Sem pré-visualização</span>"}</div>
            <div class="meta">
              <p><b>Dimensão:</b> ${d.width_px || "—"}×${d.height_px || "—"} px · ${d.dpi || "—"} dpi</p>
              <p><b>Originais (${(d.originals || []).length}):</b></p>
              <ul>${origs || "<li class='muted'>—</li>"}</ul>
            </div>
          </div>
        </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Ordem de Serviço — Pedido #${orderId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:14mm;font-size:11.5pt;line-height:1.45}
  h1{font-size:20pt;margin-bottom:4mm}
  h2{font-size:13pt;margin:6mm 0 2mm;border-bottom:1px solid #000;padding-bottom:1mm;text-transform:uppercase;letter-spacing:.5px}
  h3{font-size:12pt}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:4mm;margin-bottom:4mm}
  .header .store b{font-size:16pt}
  .header .num{text-align:right;font-size:10.5pt}
  .num .id{font-size:16pt;font-weight:900;letter-spacing:1px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
  table{width:100%;border-collapse:collapse;font-size:11pt}
  th,td{border:1px solid #000;padding:2mm 2.5mm;text-align:left}
  th{background:#eee;text-transform:uppercase;font-size:9.5pt;letter-spacing:.5px}
  .plano{border:1px solid #000;margin-top:3mm;page-break-inside:avoid}
  .plano-head{display:flex;justify-content:space-between;align-items:center;background:#f3f3f3;padding:1.5mm 2mm;border-bottom:1px solid #000}
  .plano-multi{border:2px solid #b45309}
  .plano-head-multi{background:#fef3c7;border-bottom:2px solid #b45309}
  .plano-head-multi h3{color:#7c2d12}
  .badge-multi{background:#b45309;color:#fff;border-color:#7c2d12;font-weight:900;font-size:11pt;padding:1mm 2.5mm}
  .plano-body{display:grid;grid-template-columns:46mm 1fr;gap:3mm;padding:2mm}
  .thumb{height:34mm;background:#fafafa;display:flex;align-items:center;justify-content:center;border:1px dashed #aaa}
  .thumb img{max-width:100%;max-height:100%;object-fit:contain}
  .meta p{margin:.5mm 0}
  .meta ul{padding-left:4mm;margin-top:.5mm}
  .badge{font-size:9.5pt;border:1px solid #000;padding:.5mm 1.5mm;border-radius:2px}
  .muted{color:#666}
  .footer{margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:6mm}
  .signbox{border-top:1px solid #000;padding-top:1.5mm;font-size:9.5pt;text-align:center;margin-top:14mm}
  @media print{ body{padding:8mm} }
</style></head>
<body>
  <div class="header">
    <div class="store">
      <b>${escapeHtml(storeName)}</b><br/>
      <span class="muted">${escapeHtml(storeAddress)}</span><br/>
      <span class="muted">${escapeHtml(storePhone)} · ${escapeHtml(storeEmail)}</span>
    </div>
    <div class="num">
      <div>Ordem de Serviço</div>
      <div class="id">#${orderId}</div>
      <div class="muted">${created}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <h2>Cliente</h2>
      <p><b>${escapeHtml(customerName)}</b></p>
      <p>${escapeHtml(customerEmail)}</p>
      <p>${escapeHtml(customerPhone)}</p>
    </div>
    <div>
      <h2>Entrega</h2>
      <p>${escapeHtml(addr.street || "")} ${escapeHtml(addr.number || "")}</p>
      <p>${escapeHtml(addr.postal_code || "")} ${escapeHtml(addr.city || "")} · ${escapeHtml(addr.country || "")}</p>
      <p class="muted">${escapeHtml((order as any).shipping_method || "")}</p>
    </div>
  </div>

  <h2>Itens</h2>
  <table>
    <thead><tr><th>Produto</th><th style="width:18mm;text-align:center">Qtd</th><th style="width:28mm;text-align:right">Subtotal</th></tr></thead>
    <tbody>${itemsRows || `<tr><td colspan="3" class="muted">Sem itens</td></tr>`}</tbody>
    <tfoot><tr><th colspan="2" style="text-align:right">Total</th><th style="text-align:right">${formatPrice(Number(order.total || 0))}</th></tr></tfoot>
  </table>

  <h2>Ficheiros de impressão (${list.length} página${list.length === 1 ? "" : "s"})</h2>
  ${planosBlocks || `<p class="muted">Sem ficheiros gerados.</p>`}

  ${verifiedRolls.length ? `
  <h2>⚠ Verificação de ficheiros contratada</h2>
  <div style="border:2px solid #b45309;background:#fff7ed;padding:3mm;margin-top:2mm">
    <p style="font-weight:700;color:#7c2d12">O cliente pagou ${formatPrice(verificationTotal * 1.23)} (c/ IVA) pela verificação técnica dos rolos abaixo.</p>
    <p style="font-size:9pt;margin-top:1mm">Confirma manualmente, antes de imprimir: resolução, transparência, contornos e legibilidade. Se a qualidade for insuficiente, contacta o cliente antes da impressão.</p>
    <ul style="margin-top:2mm;padding-left:5mm;font-size:9pt">
      ${verifiedRolls.map((v) => `<li><b>${escapeHtml(v.planoName)}</b>${v.copies && v.copies > 1 ? ` · ${v.copies} cópias` : ""} — ${formatPrice(Number(v.fee || 0) * 1.23)} (c/ IVA)</li>`).join("")}
    </ul>
  </div>
  ` : ""}

  ${declinedRolls.length ? `
  <h2>Rolos sem verificação — responsabilidade do cliente</h2>
  <table>
    <thead><tr>
      <th>Rolo</th>
      <th style="width:50mm">Aceitação</th>
    </tr></thead>
    <tbody>
      ${declinedRolls.map((v) => `
        <tr>
          <td>${escapeHtml(v.planoName)}</td>
          <td>${v.declinedAt ? escapeHtml(format(new Date(v.declinedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })) : "—"}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  <p style="margin-top:2mm;font-size:9pt">O cliente optou por não verificar estes rolos e assumiu a responsabilidade pela qualidade da arte entregue. Imprimir tal-como-recebido.</p>
  ` : ""}

  ${acceptances.length ? `
  <h2>Aceitação de qualidade</h2>
  <table>
    <thead><tr>
      <th>Arte</th><th>Motivo</th>
      <th style="width:22mm;text-align:center">DPI efetivo</th>
      <th style="width:22mm;text-align:center">Recomendado</th>
      <th style="width:34mm">Data / hora</th>
    </tr></thead>
    <tbody>
      ${acceptances.map((a) => `
        <tr>
          <td>${escapeHtml(a.designName || "—")}</td>
          <td>${a.kind === "low" ? "DPI do ficheiro abaixo do recomendado" : "Arte ampliada além do recomendado"}</td>
          <td style="text-align:center">${a.effDpi}</td>
          <td style="text-align:center">≥ ${a.threshold}</td>
          <td>${escapeHtml(format(new Date(a.acceptedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }))}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  <p style="margin-top:2mm;font-size:9pt">O cliente foi avisado de que o DPI efetivo está abaixo do recomendado e autorizou expressamente a impressão nestas condições.</p>
  ` : ""}

  ${oversizeAcc.length ? `
  <h2>Aceitações do cliente — redução proporcional</h2>
  <table>
    <thead><tr>
      <th>Ficheiro</th><th>Produto</th>
      <th style="width:30mm">Tamanho original</th>
      <th style="width:30mm">Tamanho final</th>
      <th style="width:34mm">Data / hora</th>
    </tr></thead>
    <tbody>
      ${oversizeAcc.map((a) => `
        <tr>
          <td>${escapeHtml(a.fileName)}</td>
          <td>${escapeHtml(a.productName)} (rolo ${a.rollWidthCm.toFixed(1)} cm)</td>
          <td>${a.originalCmW.toFixed(1)} × ${a.originalCmH.toFixed(1)} cm</td>
          <td>${a.adjustedCmW.toFixed(1)} × ${a.adjustedCmH.toFixed(1)} cm</td>
          <td>${escapeHtml(format(new Date(a.acceptedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }))}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  <p style="margin-top:2mm;font-size:9pt">O cliente autorizou expressamente a redução proporcional da arte para caber na largura útil do rolo. A proporção foi mantida.</p>
  ` : ""}

  <div class="footer">
    <div class="signbox">Operador / Data</div>
    <div class="signbox">Conferência / Data</div>
  </div>

  <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} title="Imprimir ordem de produção" className="gap-1.5">
      <ClipboardList className="h-4 w-4" aria-hidden="true" />
      Ordem de produção
    </Button>
  );
};

export default PrintWorkOrder;
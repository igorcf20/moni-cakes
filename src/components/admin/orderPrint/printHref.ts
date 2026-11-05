// Endereço da página de impressão de Admin > Impressão de pedidos (PrintPage). de = de onde veio, para o botão Voltar.
import { adminHref } from "../shell/adminSections";
import type { PrintDoc } from "@/lib/orderPrint";

export const printHref = (ids: string[], doc: PrintDoc, from?: "pedido" | "pedidos") =>
  `${adminHref.section("order-printing")}&ver=imprimir&id=${ids.join(",")}&doc=${doc}${from ? `&de=${from}` : ""}`;

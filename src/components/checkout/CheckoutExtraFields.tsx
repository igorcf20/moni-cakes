// =============================================================================================
// Campos extra no checkout (recurso checkout_fields; Admin > Vendas > Campos do checkout). Só mostra e guarda as
// respostas; o create-order confere os obrigatórios e soma os preços no servidor (src/lib/checkoutFields.ts).
//   checkbox  caixa com preço quando marcada      select    opções em cartões, com preço por opção
//   text      texto curto                         textarea  texto longo (ex.: mensagem no cartão)
// =============================================================================================
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMessages } from "@/i18n";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { localText, type Answers, type CheckoutField, type FieldError } from "@/lib/checkoutFields";
import { cn } from "@/lib/utils";

const inputCls = "h-12 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]";

export default function CheckoutExtraFields({ fields, answers, onChange, errors, showErrors, money, compact = false }: {
  fields: CheckoutField[];
  answers: Answers;
  onChange: (id: string, value: string | boolean) => void;
  errors: FieldError[];
  /** Erros só aparecem depois de o cliente tentar finalizar (ou mexer no campo). */
  showErrors: boolean;
  money: (n: number) => string;
  /** Uma coluna (prévia estreita no Admin). */
  compact?: boolean;
}) {
  const { t, locale } = useMessages(checkoutFieldsMessages);
  const priceTag = (n: number) => (n > 0 ? t("plus_price", { price: money(n) }) : "");
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.field_id === id) : undefined);

  return (
    <div className="space-y-5">
      {fields.map((f) => {
        const label = localText(f.label_i18n, locale, f.name);
        const help = localText(f.help_i18n, locale);
        const err = errorOf(f.id);
        const errId = `cf-${f.id}-err`;
        const errText = err ? t(err.code === "too_long" ? "err_too_long" : "err_required") : "";
        const badge = (
          <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
            f.required ? "bg-accent text-brand-orange-text" : "bg-brand-alt text-muted-foreground")}>
            {f.required ? t("required") : t("optional")}
          </span>
        );

        if (f.kind === "checkbox") {
          const on = answers[f.id] === true;
          return (
            <div key={f.id}>
              <label className={cn("flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[16px] border p-4 transition-colors duration-150",
                on ? "border-primary bg-accent/60" : "border-border bg-brand-alt/40 hover:border-primary/40", err && "border-destructive")}>
                <Checkbox checked={on} onCheckedChange={(v) => onChange(f.id, !!v)} className="mt-0.5 h-5 w-5" aria-describedby={err ? errId : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold text-foreground">{label}{f.required && badge}</span>
                    {f.price > 0 && <span className="text-[14px] font-semibold tabular-nums text-brand-orange-text">{priceTag(f.price)}</span>}
                  </span>
                  {help && <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{help}</span>}
                </span>
              </label>
              {err && <p id={errId} className="mt-1.5 text-[13px] font-medium text-destructive">{errText}</p>}
            </div>
          );
        }

        if (f.kind === "select") {
          const cur = typeof answers[f.id] === "string" ? (answers[f.id] as string) : "";
          const opts = [...f.options.map((o) => ({ id: o.id, label: localText(o.label_i18n, locale, o.id), price: o.price })),
            ...(f.required ? [] : [{ id: "", label: t("none"), price: 0 }])];
          return (
            <fieldset key={f.id} aria-describedby={err ? errId : undefined}>
              <legend className="text-[14px] font-semibold text-foreground">{label}{badge}</legend>
              {help && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{help}</p>}
              <div role="radiogroup" aria-label={label} className={cn("mt-2.5 grid gap-2", !compact && "sm:grid-cols-2")}>
                {opts.map((o) => {
                  const on = cur === o.id;
                  return (
                    <button key={o.id || "none"} type="button" role="radio" aria-checked={on} onClick={() => onChange(f.id, o.id)}
                      className={cn("flex min-h-[48px] items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5 text-left text-[14px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-accent/60 font-semibold" : "border-border bg-white hover:border-primary/40", err && !on && "border-destructive/60")}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-primary" : "border-muted-foreground/50")}>
                          {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <span className="min-w-0 break-words">{o.label}</span>
                      </span>
                      {o.price > 0 && <span className="shrink-0 tabular-nums text-brand-orange-text">{priceTag(o.price)}</span>}
                    </button>
                  );
                })}
              </div>
              {err && <p id={errId} className="mt-1.5 text-[13px] font-medium text-destructive">{errText}</p>}
            </fieldset>
          );
        }

        const value = typeof answers[f.id] === "string" ? (answers[f.id] as string) : "";
        const left = f.max_length - value.length;
        const common = {
          id: `cf-${f.id}`,
          value,
          maxLength: f.max_length,
          onChange: (e: { target: { value: string } }) => onChange(f.id, e.target.value),
          "aria-invalid": !!err,
          "aria-describedby": err ? errId : undefined,
        };
        return (
          <div key={f.id} className="grid gap-1.5">
            <label htmlFor={`cf-${f.id}`} className="flex flex-wrap items-center justify-between gap-x-3 text-[14px] font-semibold text-foreground">
              <span>{label}{badge}</span>
              {f.price > 0 && <span className="text-[14px] font-semibold tabular-nums text-brand-orange-text">{priceTag(f.price)}</span>}
            </label>
            {help && <p className="text-[13px] leading-relaxed text-muted-foreground">{help}</p>}
            {f.kind === "textarea"
              ? <Textarea {...common} rows={3} className={cn("rounded-[14px] border-border bg-white text-[16px] md:text-[15px]", err && "border-destructive")} />
              : <Input {...common} className={cn(inputCls, err && "border-destructive")} />}
            <div className="flex justify-between gap-3 text-[12px]">
              <span className="font-medium text-destructive">{err ? <span id={errId}>{errText}</span> : null}</span>
              {value.length > 0 && <span className={cn("tabular-nums text-muted-foreground", left < 10 && "text-brand-orange-text")}>{t("chars_left", { n: Math.max(0, left) })}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

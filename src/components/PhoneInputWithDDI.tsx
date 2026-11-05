import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { countryName, useCountries, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";

// Telefone com indicativo do país. Valor guardado como "BR:11999998888" (código ISO + dígitos),
// ou só dígitos em registos antigos (lidos como Brasil). Os países onde a loja vende aparecem primeiro.
type PhoneCountry = { code: string; dial: string; maxDigits: number; example: string };

const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "BR", dial: "+55", maxDigits: 11, example: "(11) 91234-5678" },
  { code: "PT", dial: "+351", maxDigits: 9, example: "912 345 678" },
  { code: "ES", dial: "+34", maxDigits: 9, example: "612 345 678" },
  { code: "US", dial: "+1", maxDigits: 10, example: "(201) 555-0123" },
  { code: "CA", dial: "+1", maxDigits: 10, example: "(204) 555-0123" },
  { code: "AR", dial: "+54", maxDigits: 11, example: "911 234 567 89" },
  { code: "MX", dial: "+52", maxDigits: 10, example: "551 234 567 8" },
  { code: "CL", dial: "+56", maxDigits: 9, example: "912 345 678" },
  { code: "CO", dial: "+57", maxDigits: 10, example: "321 123 456 7" },
  { code: "UY", dial: "+598", maxDigits: 8, example: "941 234 56" },
  { code: "PY", dial: "+595", maxDigits: 9, example: "961 456 789" },
  { code: "AO", dial: "+244", maxDigits: 9, example: "923 123 456" },
  { code: "MZ", dial: "+258", maxDigits: 9, example: "821 234 567" },
  { code: "CV", dial: "+238", maxDigits: 7, example: "991 123 4" },
  { code: "FR", dial: "+33", maxDigits: 9, example: "612 345 678" },
  { code: "GB", dial: "+44", maxDigits: 10, example: "740 012 345 6" },
  { code: "DE", dial: "+49", maxDigits: 11, example: "151 234 567 89" },
  { code: "IT", dial: "+39", maxDigits: 10, example: "312 345 678 9" },
  { code: "NL", dial: "+31", maxDigits: 9, example: "612 345 678" },
  { code: "BE", dial: "+32", maxDigits: 9, example: "470 123 456" },
  { code: "LU", dial: "+352", maxDigits: 9, example: "628 123 456" },
  { code: "CH", dial: "+41", maxDigits: 9, example: "781 234 567" },
];

function formatPhoneByCountry(digits: string, code: string): string {
  if (code === "BR") {
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (code === "US" || code === "CA") {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  return groups.join(" ");
}

interface PhoneInputWithDDIProps {
  value: string; // "BR:11999998888", ou só dígitos em registos antigos
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
  /** id do campo do número, para ligar a um <Label htmlFor>. */
  id?: string;
}

export function parsePhoneValue(value: string): { countryCode: string; digits: string } {
  const v = value || "";
  if (v.includes(":")) {
    const [countryCode, digits] = v.split(":", 2);
    return { countryCode: (countryCode || "BR").toUpperCase(), digits: (digits || "").replace(/\D/g, "") };
  }
  // Formato internacional (+5511987654321): o indicativo mais longo que corresponder escolhe o país.
  if (v.trim().startsWith("+")) {
    const d = v.replace(/\D/g, "");
    const match = [...PHONE_COUNTRIES].sort((x, y) => y.dial.length - x.dial.length).find((c) => d.startsWith(c.dial.slice(1)));
    if (match) return { countryCode: match.code, digits: d.slice(match.dial.length - 1) };
  }
  return { countryCode: "BR", digits: v.replace(/\D/g, "") };
}

/** Número legível com o indicativo ("+55 (11) 91234-5678"); vazio se não houver dígitos. */
export function getFullPhoneDisplay(value: string): string {
  const { countryCode, digits } = parsePhoneValue(value);
  if (!digits) return "";
  const country = PHONE_COUNTRIES.find((c) => c.code === countryCode);
  return `${country ? country.dial : countryCode} ${formatPhoneByCountry(digits, countryCode)}`;
}

const PhoneInputWithDDI = ({ value, onChange, disabled, error, className, id }: PhoneInputWithDDIProps) => {
  const { t, locale } = useMessages(accountMessages);
  const current = useCountry();
  const { data: active } = useCountries();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const errorId = `${id || autoId}-error`;

  // Países ativos da loja primeiro (com o indicativo da tabela countries), depois os restantes.
  const { storeList, otherList } = useMemo(() => {
    const byCode = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));
    const store = (active ?? []).map((c) => byCode.get(c.code) ?? { code: c.code, dial: c.phonePrefix, maxDigits: 15, example: "" });
    const seen = new Set(store.map((c) => c.code));
    const withName = (c: PhoneCountry) => ({ ...c, name: countryName(c.code, locale) });
    return {
      storeList: store.map(withName),
      otherList: PHONE_COUNTRIES.filter((c) => !seen.has(c.code)).map(withName).sort((a, b) => a.name.localeCompare(b.name, locale)),
    };
  }, [active, locale]);
  const all = useMemo(() => [...storeList, ...otherList], [storeList, otherList]);

  const raw = value || "";
  const { countryCode, digits } = parsePhoneValue(raw);
  // Sem número ainda: sugere o país atual da loja.
  const code = raw.includes(":") || digits ? countryCode : current.code;
  const selected = all.find((c) => c.code === code) ?? { code, dial: "", maxDigits: 15, example: "", name: countryName(code, locale) };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open]);

  const q = search.trim().toLowerCase();
  const match = (c: { code: string; dial: string; name: string }) => !q || c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q);
  const storeFiltered = storeList.filter(match);
  const otherFiltered = otherList.filter(match);

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(`${selected.code}:${e.target.value.replace(/\D/g, "").slice(0, selected.maxDigits)}`);
  };

  const pick = (c: PhoneCountry) => {
    onChange(`${c.code}:${digits.slice(0, c.maxDigits)}`);
    setOpen(false);
    setSearch("");
  };

  const option = (c: PhoneCountry & { name: string }) => {
    const on = c.code === selected.code;
    return (
      <button
        key={c.code}
        type="button"
        role="option"
        aria-selected={on}
        onClick={() => pick(c)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] transition-colors duration-150 hover:bg-brand-alt focus-visible:bg-brand-alt focus-visible:outline-none",
          on && "bg-accent text-brand-orange-text",
        )}
      >
        <span className="w-7 shrink-0 text-[12px] font-bold tracking-wide">{c.code}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{c.dial}</span>
        {on && <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className={cn("flex gap-2", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t("phoneCountry", { country: selected.name })}
              className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-[14px] border border-border bg-white px-3 text-[14px] transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-bold tracking-wide text-foreground">{selected.code}</span>
              <span className="tabular-nums text-muted-foreground">{selected.dial}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] rounded-[16px] border-brand-card-border p-0" align="start">
            <div className="border-b border-brand-card-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
                <Input
                  ref={searchRef}
                  placeholder={t("phoneSearch")}
                  aria-label={t("phoneSearch")}
                  className="h-11 rounded-[12px] border-border bg-white pl-9 text-[15px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="h-64">
              <div className="p-1.5" role="listbox" aria-label={t("phoneSearch")}>
                {storeFiltered.length + otherFiltered.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-muted-foreground">{t("phoneNoResult")}</p>
                ) : (
                  <>
                    {storeFiltered.map(option)}
                    {storeFiltered.length > 0 && otherFiltered.length > 0 && <div className="mx-2 my-1.5 h-px bg-brand-card-border" aria-hidden="true" />}
                    {otherFiltered.map(option)}
                  </>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-label={id ? undefined : t("phoneNumber")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={selected.example}
          className={cn("h-12 flex-1 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]", error && "border-destructive")}
          value={formatPhoneByCountry(digits, selected.code)}
          onChange={handleDigitsChange}
          disabled={disabled}
        />
      </div>
      {error && <p id={errorId} role="alert" className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
};

export default PhoneInputWithDDI;

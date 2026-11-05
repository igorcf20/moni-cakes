import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAddresses, type Address } from "@/hooks/useAddresses";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { addressMessages, parishKey, postalKey, regionKey } from "@/i18n/address";
import { addressCountryCode, addressFormat, findRegion, isValidPostal, lookupPostal, regionToValue } from "@/lib/addressFormats";
import { FALLBACK_COUNTRIES, countryName, useCountries, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Field, btnPrimary, btnSecondary, inputCls } from "./ui";

interface AddressFormProps {
  address?: Address | null;
  onClose?: () => void;
  onSuccess?: () => void;
  /** Outro cliente (edição pelo Admin). */
  userIdOverride?: string;
}

type FormState = {
  name: string; street: string; number: string; complement: string; parish: string; city: string;
  district: string; postal_code: string; country: string; is_default: boolean; is_billing_default: boolean;
};
type Lookup = "idle" | "loading" | "filled" | "notfound";

/**
 * Endereço guiado pelo país (máscara e validação do código postal, estados / distritos / províncias,
 * bairro ou freguesia e preenchimento pelo CEP no Brasil). Grava sempre os mesmos campos; country = código ISO.
 * Usado também no checkout e no Admin (página do cliente, src/pages/admin/AdminCustomerPage.tsx).
 */
const AddressForm = ({ address, onClose, onSuccess, userIdOverride }: AddressFormProps) => {
  const { user } = useAuth();
  const targetUserId = userIdOverride || user?.id;
  const { addAddress, updateAddress } = useAddresses(targetUserId);
  const { t, locale } = useMessages(accountMessages);
  const { t: ta } = useMessages(addressMessages);
  const current = useCountry();
  const { data: countries } = useCountries();
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const numberRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(() => ({
    name: address?.name || "",
    street: address?.street || "",
    number: address?.number || "",
    complement: address?.complement || "",
    parish: address?.parish || "",
    city: address?.city || "",
    district: address?.district || "",
    postal_code: address?.postal_code || "",
    country: addressCountryCode(address?.country, current.code),
    is_default: address?.is_default || false,
    is_billing_default: address?.is_billing_default || false,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [postalEdited, setPostalEdited] = useState(false);
  const [lookup, setLookup] = useState<Lookup>("idle");

  const list = countries?.length ? countries : FALLBACK_COUNTRIES;
  const selected = list.find((c) => c.code === form.country) ?? FALLBACK_COUNTRIES.find((c) => c.code === form.country);
  const fmt = addressFormat(selected?.postalCodeKind ?? null);
  // Países ativos; um endereço antigo de outro país continua a aparecer na lista.
  const options = useMemo(() => {
    const codes = list.map((c) => c.code);
    if (form.country && !codes.includes(form.country)) codes.push(form.country);
    return codes.map((code) => ({ code, name: countryName(code, locale) }));
  }, [list, form.country, locale]);

  const set = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch) as (keyof FormState)[]) delete next[k];
      return next;
    });
  };

  // Brasil: preenche rua, bairro, cidade e estado pelo CEP (só depois de a pessoa mexer no CEP).
  useEffect(() => {
    if (!postalEdited || !fmt.lookup || !isValidPostal(fmt, form.postal_code)) {
      setLookup("idle");
      return;
    }
    const ctrl = new AbortController();
    setLookup("loading");
    lookupPostal(fmt, form.postal_code, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (!r) { setLookup("notfound"); return; }
      const found = findRegion(fmt, r.region);
      setForm((prev) => ({
        ...prev,
        street: r.street || prev.street,
        parish: r.parish || prev.parish,
        city: r.city || prev.city,
        district: found ? regionToValue(fmt, found) : r.region || prev.district,
      }));
      // Os campos preenchidos pelo CEP deixam de mostrar o erro de "obrigatório" de uma tentativa anterior.
      setErrors((prev) => {
        const next = { ...prev };
        if (r.street) delete next.street;
        if (r.parish) delete next.parish;
        if (r.city) delete next.city;
        if (r.region) delete next.district;
        return next;
      });
      setLookup("filled");
      numberRef.current?.focus();
    });
    return () => ctrl.abort();
  }, [postalEdited, fmt, form.postal_code]);

  const changeCountry = (code: string) => {
    if (code === form.country) return;
    const next = addressFormat(list.find((c) => c.code === code)?.postalCodeKind ?? null);
    // O formato do código postal e a lista de regiões mudam com o país.
    setForm((prev) => ({ ...prev, country: code, postal_code: "", district: "", parish: next.hasParish ? prev.parish : "" }));
    setErrors({});
    setPostalEdited(false);
    setLookup("idle");
  };

  const postalLabel = ta(postalKey(fmt));
  const regionLabel = ta(regionKey(fmt));
  const region = findRegion(fmt, form.district);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = ta("required", { label: ta("name") });
    if (!isValidPostal(fmt, form.postal_code)) {
      next.postal_code = form.postal_code.trim()
        ? ta("invalidPostal", { label: postalLabel, example: fmt.postalPlaceholder || "12345" })
        : ta("required", { label: postalLabel });
    }
    if (!form.district.trim()) next.district = ta("required", { label: regionLabel });
    if (!form.street.trim()) next.street = ta("required", { label: ta("street") });
    if (!form.city.trim()) next.city = ta("required", { label: ta("city") });
    if (fmt.hasParish && fmt.parishRequired && !form.parish.trim()) next.parish = ta("required", { label: ta(parishKey(fmt)) });
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      document.getElementById(fid(first))?.focus();
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      parish: fmt.hasParish ? form.parish.trim() : "",
      city: form.city.trim(),
      district: form.district.trim(),
      postal_code: form.postal_code.trim(),
    };
    if (address) updateAddress({ id: address.id, ...payload });
    else addAddress(payload);
    onSuccess?.();
    onClose?.();
  };

  const err = (k: keyof FormState) => errors[k];
  const errId = (k: keyof FormState) => (errors[k] ? `${fid(k)}-error` : undefined);
  const invalidCls = (k: keyof FormState) => (errors[k] ? "border-destructive focus-visible:ring-destructive/30" : "");

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ta("country")} htmlFor={fid("country")} required>
          <Select value={form.country} onValueChange={changeCountry}>
            <SelectTrigger id={fid("country")} className={inputCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={ta("name")} htmlFor={fid("name")} required error={err("name")} errorId={errId("name")}>
          <Input id={fid("name")} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={ta("namePlaceholder")}
            aria-invalid={!!err("name") || undefined} aria-describedby={errId("name")} className={cn(inputCls, invalidCls("name"))} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={postalLabel} htmlFor={fid("postal_code")} required error={err("postal_code")} errorId={errId("postal_code")}>
          <div className="relative">
            <Input
              id={fid("postal_code")}
              autoComplete="postal-code"
              inputMode={fmt.kind === "generic" ? "text" : "numeric"}
              placeholder={fmt.postalPlaceholder}
              value={form.postal_code}
              onChange={(e) => { set({ postal_code: fmt.formatPostal(e.target.value) }); setPostalEdited(true); }}
              aria-invalid={!!err("postal_code") || undefined}
              aria-describedby={[errId("postal_code"), fmt.lookup ? fid("postal-status") : ""].filter(Boolean).join(" ") || undefined}
              className={cn(inputCls, "pr-10", invalidCls("postal_code"))}
            />
            {lookup === "loading" && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
          {fmt.lookup && (
            <p id={fid("postal-status")} aria-live="polite" className={cn("min-h-0 text-[13px] empty:hidden", lookup === "notfound" ? "text-brand-orange-text" : "text-muted-foreground")}>
              {lookup === "loading" ? ta("lookupLoading") : lookup === "filled" ? ta("lookupFilled") : lookup === "notfound" ? ta("lookupNotFound") : ""}
            </p>
          )}
        </Field>
        <Field label={regionLabel} htmlFor={fid("district")} required error={err("district")} errorId={errId("district")}>
          {fmt.regions.length > 0 ? (
            <Select value={region ? regionToValue(fmt, region) : ""} onValueChange={(v) => set({ district: v })}>
              <SelectTrigger id={fid("district")} className={cn(inputCls, invalidCls("district"))} aria-invalid={!!err("district") || undefined} aria-describedby={errId("district")}>
                <SelectValue placeholder={!region && form.district ? form.district : ta("regionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {fmt.regions.map((r) => <SelectItem key={r.code} value={regionToValue(fmt, r)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input id={fid("district")} autoComplete="address-level1" value={form.district} onChange={(e) => set({ district: e.target.value })}
              aria-invalid={!!err("district") || undefined} aria-describedby={errId("district")} className={cn(inputCls, invalidCls("district"))} />
          )}
        </Field>
      </div>

      <Field label={ta("street")} htmlFor={fid("street")} required error={err("street")} errorId={errId("street")}>
        <Input id={fid("street")} autoComplete="address-line1" value={form.street} onChange={(e) => set({ street: e.target.value })}
          aria-invalid={!!err("street") || undefined} aria-describedby={errId("street")} className={cn(inputCls, invalidCls("street"))} />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label={ta("number")} htmlFor={fid("number")}>
          <Input id={fid("number")} ref={numberRef} value={form.number} onChange={(e) => set({ number: e.target.value })} className={inputCls} />
        </Field>
        <div className="col-span-2">
          <Field label={ta("complement")} htmlFor={fid("complement")} hint={ta("optional")}>
            <Input id={fid("complement")} autoComplete="address-line2" placeholder={ta("complementPlaceholder")} value={form.complement} onChange={(e) => set({ complement: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fmt.hasParish && (
          <Field label={ta(parishKey(fmt))} htmlFor={fid("parish")} required={fmt.parishRequired} hint={fmt.parishRequired ? undefined : ta("optional")} error={err("parish")} errorId={errId("parish")}>
            <Input id={fid("parish")} value={form.parish} onChange={(e) => set({ parish: e.target.value })}
              aria-invalid={!!err("parish") || undefined} aria-describedby={errId("parish")} className={cn(inputCls, invalidCls("parish"))} />
          </Field>
        )}
        <Field label={ta("city")} htmlFor={fid("city")} required error={err("city")} errorId={errId("city")}>
          <Input id={fid("city")} autoComplete="address-level2" value={form.city} onChange={(e) => set({ city: e.target.value })}
            aria-invalid={!!err("city") || undefined} aria-describedby={errId("city")} className={cn(inputCls, invalidCls("city"))} />
        </Field>
      </div>

      <div className="space-y-3 pt-1">
        <div className="flex items-start gap-3">
          <Checkbox id={fid("is_default")} checked={form.is_default} onCheckedChange={(v) => set({ is_default: v === true })} className="mt-0.5 h-5 w-5 rounded-[6px]" />
          <Label htmlFor={fid("is_default")} className="cursor-pointer text-[14px] font-normal leading-relaxed text-brand-ink-soft">{ta("defaultShipping")}</Label>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id={fid("is_billing_default")} checked={form.is_billing_default} onCheckedChange={(v) => set({ is_billing_default: v === true })} className="mt-0.5 h-5 w-5 rounded-[6px]" />
          <Label htmlFor={fid("is_billing_default")} className="cursor-pointer text-[14px] font-normal leading-relaxed text-brand-ink-soft">{ta("defaultBilling")}</Label>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onClose && <button type="button" className={btnSecondary} onClick={onClose}>{t("cancel")}</button>}
        <button type="submit" className={btnPrimary}>{address ? t("addrUpdate") : t("addrSave")}</button>
      </div>
    </form>
  );
};

export default AddressForm;

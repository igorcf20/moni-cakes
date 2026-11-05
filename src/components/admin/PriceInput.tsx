import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseMoneyInput } from "@/lib/moneyInput";

type Props = { value: number; onChange: (value: number) => void; label: string; precision?: number; disabled?: boolean };

/** Preserve typed partial decimals. Empty/invalid values never silently become zero. */
export default function PriceInput({ value, onChange, label, precision = 2, disabled }: Props) {
  const errorId = useId();
  const [draft, setDraft] = useState(() => ({ value, text: Number.isFinite(value) ? String(value) : "" }));
  if (!Object.is(draft.value, value)) {
    setDraft({ value, text: Number.isFinite(value) ? String(value) : "" });
  }
  const invalid = parseMoneyInput(draft.text, precision) === null;
  return <div>
    <Input type="text" inputMode="decimal" aria-label={label} aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined} disabled={disabled} value={draft.text}
      onChange={(event) => {
        const text = event.target.value;
        const parsed = parseMoneyInput(text, precision) ?? NaN;
        setDraft({ value: parsed, text });
        onChange(parsed);
      }}
    />
    {invalid && <p id={errorId} className="mt-1 text-xs text-destructive">Indique um valor igual ou superior a zero, com até {precision} casas decimais.</p>}
  </div>;
}


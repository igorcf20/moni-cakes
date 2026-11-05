import {
  Palette, ShieldCheck, Layers, Sparkles, Zap, Award, Users2, Clock, Star, Quote, CheckCircle2,
  Heart, ThumbsUp, Truck, Package, Gem, Flame, Crown, Rocket, Target, Smile,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export const ICON_MAP: Record<string, any> = {
  Palette, ShieldCheck, Layers, Sparkles, Zap, Award, Users2, Clock, Star, Quote, CheckCircle2,
  Heart, ThumbsUp, Truck, Package, Gem, Flame, Crown, Rocket, Target, Smile,
};

const NONE = "__none__";

type Props = {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  label?: string;
};

const IconPicker = ({ value, onChange, label = "Ícone" }: Props) => {
  const current = value && ICON_MAP[value] ? value : NONE;
  const Preview = current !== NONE ? ICON_MAP[current] : null;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center">
          {Preview ? <Preview className="h-4 w-4 text-primary" /> : <span className="text-[10px] text-muted-foreground">sem</span>}
        </div>
        <Select value={current} onValueChange={(v) => onChange(v === NONE ? null : v)}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72 bg-popover">
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">Sem ícone</span>
            </SelectItem>
            {Object.entries(ICON_MAP).map(([name, Icon]) => (
              <SelectItem key={name} value={name}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" /> {name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default IconPicker;
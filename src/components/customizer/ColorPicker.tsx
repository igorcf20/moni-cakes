import { Label } from "@/components/ui/label";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const presetColors = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#f59e0b", 
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e"
];

const ColorPicker = ({ color, onChange }: ColorPickerProps) => {
  return (
    <div className="flex flex-col gap-3 p-4 bg-card rounded-lg border border-border shadow-soft">
      <Label className="text-sm font-semibold">Cor Atual</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded-lg cursor-pointer border border-border"
        />
        <div className="flex-1">
          <input
            type="text"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            placeholder="#000000"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-8 gap-2 mt-2">
        {presetColors.map((presetColor) => (
          <button
            key={presetColor}
            onClick={() => onChange(presetColor)}
            className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
            style={{ 
              backgroundColor: presetColor,
              borderColor: color === presetColor ? "hsl(var(--primary))" : "hsl(var(--border))"
            }}
            title={presetColor}
          />
        ))}
      </div>
    </div>
  );
};

export default ColorPicker;

// Dica curta ao lado de um título do Admin: abre ao passar o mouse, ao focar com o teclado e ao tocar (celular).
// Não é janela: só um balão de texto que some ao sair.
import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function HelpTip({ text, label, className }: { text: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${text}`}
            onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
            className={cn("inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
          >
            <Info className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-[280px] text-[13px] font-normal leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

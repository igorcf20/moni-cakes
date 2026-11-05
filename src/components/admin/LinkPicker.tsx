import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronsUpDown, Check, Link2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}

type Mode = "product" | "custom";

const detectMode = (v: string): Mode => {
  if (v?.startsWith("/produto/")) return "product";
  return "custom";
};

const extractSlug = (v: string, mode: Mode) => {
  if (mode === "product") return v.replace(/^\/produto\//, "");
  return "";
};

const LinkPicker = ({ value, onChange, placeholder, id }: LinkPickerProps) => {
  const initialMode = useMemo(() => detectMode(value || ""), [value]);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [open, setOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["linkpicker-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, slug, category")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 60_000,
  });

  const currentSlug = extractSlug(value || "", mode);
  const selectedName =
    products.find((p: any) => (p.slug || p.id) === currentSlug)?.name || "";

  const setSlug = (slug: string) => {
    if (!slug) return onChange("");
    onChange(`/produto/${slug}`);
  };

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
      <TabsList className="grid grid-cols-2 h-8">
        <TabsTrigger value="product" className="text-[10px] gap-1">
          <Package className="h-3 w-3" /> Produto
        </TabsTrigger>
        <TabsTrigger value="custom" className="text-[10px] gap-1">
          <Link2 className="h-3 w-3" /> Link
        </TabsTrigger>
      </TabsList>

      {mode === "product" && (
        <TabsContent value={mode} className="mt-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                <span className="truncate">
                  {selectedName || "Selecionar produto…"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <Command>
                <CommandInput placeholder="Pesquisar produto…" />
                <CommandList>
                  <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                  <CommandGroup>
                    {products.map((p: any) => {
                      const slug = p.slug || p.id;
                      const selected = slug === currentSlug;
                      return (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${slug}`}
                          onSelect={() => {
                            setSlug(slug);
                            setOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span className="text-sm">{p.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              /produto/{slug}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {value && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
              {value}
            </p>
          )}
        </TabsContent>
      )}

      {mode === "custom" && (
        <TabsContent value="custom" className="mt-2">
          <Input
            id={id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "https://… ou /caminho"}
          />
        </TabsContent>
      )}
    </Tabs>
  );
};

export default LinkPicker;

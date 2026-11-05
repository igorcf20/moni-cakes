import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/utils/currency";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useMemo } from "react";

const eur = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2).replace(".", ",")} €`;

// Rounds band edges to values people use when thinking about price (5, 10, 25, 50...).
const niceEdge = (v: number) => {
  if (v <= 10) return Math.round(v);
  const step = v <= 50 ? 5 : v <= 200 ? 10 : 50;
  return Math.round(v / step) * step;
};

/** Up to four price bands that each hold a similar share of the catalogue. */
function buildBands(prices: number[], min: number, max: number) {
  const sorted = [...prices].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 2 || max <= min) return [];
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const edges = Array.from(new Set([min, niceEdge(q(0.25)), niceEdge(q(0.5)), niceEdge(q(0.75)), max]))
    .filter((e) => e >= min && e <= max).sort((a, b) => a - b);
  const bands: { from: number; to: number; count: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i], to = edges[i + 1];
    const last = i === edges.length - 2;
    const count = sorted.filter((v) => v >= from && (last ? v <= to : v < to)).length;
    if (count > 0) bands.push({ from, to, count });
  }
  return bands;
}

const FilterSection = ({ title, open, onToggle, active = 0, children }: { title: string; open: boolean; onToggle: () => void; active?: number; children: React.ReactNode }) => (
  <Collapsible open={open} onOpenChange={onToggle} className="py-1">
    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg py-2.5 text-[15px] font-semibold transition-colors [@media(hover:hover)]:hover:text-primary">
      <span className="flex items-center gap-2">
        {title}
        {active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{active}</span>}
      </span>
      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
    </CollapsibleTrigger>
    <CollapsibleContent className="pb-3 pt-1">{children}</CollapsibleContent>
  </Collapsible>
);

const PriceDistribution = ({ prices, min, max, range }: { prices: number[]; min: number; max: number; range: [number, number] }) => {
  const bins = useMemo(() => {
    if (!prices.length || max <= min) return [];
    const n = Math.min(14, Math.max(6, prices.length));
    const w = (max - min) / n;
    return Array.from({ length: n }, (_, i) => {
      const from = min + i * w, to = from + w;
      const count = prices.filter((v) => v >= from && (i === n - 1 ? v <= to : v < to)).length;
      return { from, to, count };
    });
  }, [prices, min, max]);
  const peak = Math.max(1, ...bins.map((b) => b.count));
  if (!bins.length) return null;
  return (
    <div className="flex h-16 items-end gap-1" role="img" aria-label="Distribuição de preços dos produtos">
      {bins.map((b, i) => {
        const inRange = b.to >= range[0] && b.from <= range[1];
        return (
          <div
            key={i}
            title={`${eur(Math.round(b.from))} a ${eur(Math.round(b.to))}: ${b.count} ${b.count === 1 ? "produto" : "produtos"}`}
            className={cn(
              "flex-1 origin-bottom rounded-t-[3px] transition-[background-color,transform] duration-300 ease-out",
              b.count === 0 ? "bg-border/60" : inRange ? "bg-primary" : "bg-muted-foreground/25",
            )}
            style={{ height: b.count === 0 ? "3px" : `${Math.max(12, (b.count / peak) * 100)}%` }}
          />
        );
      })}
    </div>
  );
};

interface FilterOptions {
  categories: string[];
  priceRange: [number, number];
  inStock: boolean;
  onSale: boolean;
  materials: string[];
  colors?: string[];
  sizes?: string[];
  search?: string;
}

interface ProductFilterProps {
  onFilterChange: (filters: FilterOptions) => void;
  maxPriceLimit?: number;
  minPriceLimit?: number;
  allPrices?: number[];
}

const ProductFilter = ({ onFilterChange, maxPriceLimit = 500, minPriceLimit = 0, allPrices = [] }: ProductFilterProps) => {
  const { data: visualSettings } = useVisualSettings();
  const [categories, setCategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([minPriceLimit, maxPriceLimit]);
  const [priceTouched, setPriceTouched] = useState(false);
  useEffect(() => {
    // Limits come from the loaded catalogue; follow them until the visitor picks a range.
    if (!priceTouched) setPriceRange([minPriceLimit, maxPriceLimit]);
  }, [minPriceLimit, maxPriceLimit, priceTouched]);
  const priceBands = useMemo(() => buildBands(allPrices, minPriceLimit, maxPriceLimit), [allPrices, minPriceLimit, maxPriceLimit]);
  const priceStep = maxPriceLimit - minPriceLimit <= 60 ? 1 : 5;
  const [inStock, setInStock] = useState(false);
  const [onSale, setOnSale] = useState(false);
  const [materials, setMaterials] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [openSections, setOpenSections] = useState({
    categories: true,
    price: true,
    colors: true,
    sizes: true,
    materials: false,
    availability: true,
  });

  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const dbCategories = allCategories.filter((cat: any) => 
    !visualSettings?.hidden_categories?.includes(cat.id)
  );

  const { data: productStats } = useQuery({
    queryKey: ["product-stats-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("category, materials")
        .eq("is_active", true);
      if (error) throw error;

      const categoryCounts: Record<string, number> = {};
      const materialCounts: Record<string, number> = {};
      const norm = (s: string) =>
        s
          ?.toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      (data || []).forEach((p: any) => {
        const cat = norm(p.category || "");
        if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        (p.materials || []).forEach((m: string) => {
          if (m) materialCounts[m] = (materialCounts[m] || 0) + 1;
        });
      });

      return { categoryCounts, materialCounts };
    },
  });

  const { data: materialTags = [] } = useQuery({
    queryKey: ["material-tags-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("material_tags")
        .select("slug, label, display_order")
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: colorSwatches = [] } = useQuery({
    queryKey: ["color-swatches-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_variations")
        .select("name, color_hex, image_url")
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, { name: string; color_hex: string | null; image_url: string | null; count: number }>();
      (data || []).forEach((v: any) => {
        const key = (v.name || v.color_hex || "").toString().trim().toLowerCase();
        if (!key) return;
        const cur = map.get(key);
        if (cur) cur.count++;
        else map.set(key, { name: v.name || key, color_hex: v.color_hex, image_url: v.image_url, count: 1 });
      });
      return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 60);
    },
  });

  const { data: sizeChips = [] } = useQuery({
    queryKey: ["size-chips-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_sizes")
        .select("size_label, display_order")
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, { label: string; order: number; count: number }>();
      (data || []).forEach((s: any) => {
        const key = (s.size_label || "").toString().trim();
        if (!key) return;
        const cur = map.get(key);
        if (cur) { cur.count++; cur.order = Math.min(cur.order, s.display_order || 0); }
        else map.set(key, { label: key, order: s.display_order || 0, count: 1 });
      });
      return Array.from(map.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    },
  });

  const norm = (s: string) =>
    s?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() || "";

  const availableCategories = dbCategories.length > 0
    ? dbCategories.map((c: any) => {
        const slugKey = norm(c.slug || c.name);
        const nameKey = norm(c.name);
        const count =
          productStats?.categoryCounts[nameKey] ??
          productStats?.categoryCounts[slugKey] ??
          0;
        return {
          id: c.slug || c.name.toLowerCase(),
          label: c.name,
          image: c.image_url,
          count,
        };
      })
    : [];

  // Most popular first; selected categories always stay visible.
  const rankedCategories = [...availableCategories].sort((a: any, b: any) => b.count - a.count);
  const topCategories = rankedCategories.slice(0, 4);
  const visibleCategories = showAllCategories
    ? rankedCategories
    : [...topCategories, ...rankedCategories.slice(4).filter((c: any) => categories.includes(c.id))];
  const hiddenCategoryCount = rankedCategories.length - 4;

  const availableMaterials = (materialTags as any[])
    .map((t: any) => ({ slug: t.slug, label: t.label, count: productStats?.materialCounts?.[t.slug] || 0 }))
    .filter((t: any) => t.count > 0);

  const applyFilters = (
    cats: string[],
    price: [number, number],
    stock: boolean,
    sale: boolean,
    mats: string[],
    cols: string[],
    szs: string[]
  ) => {
    onFilterChange({ categories: cats, priceRange: price, inStock: stock, onSale: sale, materials: mats, colors: cols, sizes: szs, search: searchRef.current });
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    searchRef.current = value;
    applyFilters(categories, priceRange, inStock, onSale, materials, colors, sizes);
  };

  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    const newCats = checked ? [...categories, categoryId] : categories.filter(c => c !== categoryId);
    setCategories(newCats);
    applyFilters(newCats, priceRange, inStock, onSale, materials, colors, sizes);
  };

  const handleMaterialChange = (mat: string, checked: boolean) => {
    const newMats = checked ? [...materials, mat] : materials.filter(m => m !== mat);
    setMaterials(newMats);
    applyFilters(categories, priceRange, inStock, onSale, newMats, colors, sizes);
  };

  const toggleColor = (name: string) => {
    const next = colors.includes(name) ? colors.filter(c => c !== name) : [...colors, name];
    setColors(next);
    applyFilters(categories, priceRange, inStock, onSale, materials, next, sizes);
  };

  const toggleSize = (label: string) => {
    const next = sizes.includes(label) ? sizes.filter(s => s !== label) : [...sizes, label];
    setSizes(next);
    applyFilters(categories, priceRange, inStock, onSale, materials, colors, next);
  };

  const handlePriceChange = (value: number[]) => {
    const newRange: [number, number] = [value[0], value[1]];
    setPriceTouched(true);
    setPriceRange(newRange);
    applyFilters(categories, newRange, inStock, onSale, materials, colors, sizes);
  };

  const commitPriceInput = (which: "min" | "max", raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v)) return;
    const next: [number, number] = [...priceRange] as [number, number];
    if (which === "min") next[0] = Math.max(minPriceLimit, Math.min(v, priceRange[1]));
    else next[1] = Math.min(maxPriceLimit, Math.max(v, priceRange[0]));
    setPriceTouched(true);
    setPriceRange(next);
    applyFilters(categories, next, inStock, onSale, materials, colors, sizes);
  };
  const selectBand = (from: number, to: number) => {
    const same = priceRange[0] === from && priceRange[1] === to;
    const next: [number, number] = same ? [minPriceLimit, maxPriceLimit] : [from, to];
    setPriceTouched(!same);
    setPriceRange(next);
    applyFilters(categories, next, inStock, onSale, materials, colors, sizes);
  };
  const inPriceRange = allPrices.filter((v) => v >= priceRange[0] && v <= priceRange[1]).length;

  const clearFilters = () => {
    setCategories([]);
    setPriceTouched(false);
    setPriceRange([minPriceLimit, maxPriceLimit]);
    setInStock(false);
    setOnSale(false);
    setMaterials([]);
    setColors([]);
    setSizes([]);
    setSearch("");
    searchRef.current = "";
    onFilterChange({ categories: [], priceRange: [minPriceLimit, maxPriceLimit], inStock: false, onSale: false, materials: [], colors: [], sizes: [], search: "" });
  };

  const activeFiltersCount = (search.trim() ? 1 : 0) + categories.length + materials.length + colors.length + sizes.length + (inStock ? 1 : 0) + (onSale ? 1 : 0) +
    (priceRange[0] > minPriceLimit || priceRange[1] < maxPriceLimit ? 1 : 0);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const FilterContent = () => (
    <div className="space-y-1">
      <div className="relative pb-3">
        <Search className="pointer-events-none absolute left-3 top-[1.15rem] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text" enterKeyHint="search" value={search} onChange={(e) => handleSearch(e.target.value)} aria-label="Pesquisar produtos"
          placeholder="Pesquisar produtos" className="h-10 rounded-xl pl-9 pr-9"
        />
        {search && (
          <button type="button" aria-label="Limpar pesquisa" onClick={() => handleSearch("")} className="absolute right-2 top-[1.15rem] grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Active filters chips */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-3">
          {onSale && (
            <Badge variant="destructive" className="text-xs gap-1 cursor-pointer" onClick={() => { setOnSale(false); applyFilters(categories, priceRange, inStock, false, materials, colors, sizes); }}>
              Em promoção
              <X className="h-3 w-3" />
            </Badge>
          )}
          {categories.map(c => {
            const cat = availableCategories.find((ac: any) => ac.id === c);
            return (
              <Badge key={c} variant="secondary" className="text-xs gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => handleCategoryChange(c, false)}>
                {cat?.label || c}
                <X className="h-3 w-3" />
              </Badge>
            );
          })}
          {search.trim() && (
            <Badge variant="secondary" className="cursor-pointer gap-1 text-xs" onClick={() => handleSearch("")}>
              "{search.trim()}"<X className="h-3 w-3" />
            </Badge>
          )}
          {priceTouched && (
            <Badge variant="secondary" className="cursor-pointer gap-1 text-xs" onClick={() => selectBand(priceRange[0], priceRange[1])}>
              {eur(priceRange[0])} a {eur(priceRange[1])}<X className="h-3 w-3" />
            </Badge>
          )}
          {inStock && (
            <Badge variant="secondary" className="cursor-pointer gap-1 text-xs" onClick={() => { setInStock(false); applyFilters(categories, priceRange, false, onSale, materials, colors, sizes); }}>
              Em stock<X className="h-3 w-3" />
            </Badge>
          )}
          {[...colors.map((c) => ({ k: "c" + c, label: c, off: () => toggleColor(c) })), ...sizes.map((z) => ({ k: "s" + z, label: "Tam. " + z, off: () => toggleSize(z) }))].map((f) => (
            <Badge key={f.k} variant="secondary" className="cursor-pointer gap-1 text-xs" onClick={f.off}>{f.label}<X className="h-3 w-3" /></Badge>
          ))}
          {materials.map(m => (
            <Badge key={m} variant="secondary" className="text-xs gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => handleMaterialChange(m, false)}>
              {m}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Categories with images */}
      <FilterSection title="Categorias" open={openSections.categories} onToggle={() => toggleSection("categories")} active={categories.length}>
        <div className="space-y-0.5">
          {visibleCategories.map((category: any) => {
            const isSelected = categories.includes(category.id);
            return (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id, !isSelected)}
                aria-pressed={isSelected}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors duration-200 ${
                  isSelected
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent [@media(hover:hover)]:hover:bg-muted/60"
                }`}
              >
                {category.image ? (
                  <img src={category.image} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-muted flex-shrink-0" />
                )}
                <span className={`text-sm flex-1 ${isSelected ? "font-semibold text-primary" : ""}`}>
                  {category.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{category.count}</span>
              </button>
            );
          })}
          {hiddenCategoryCount > 0 && (
            <button type="button" onClick={() => setShowAllCategories((v) => !v)} className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-primary [@media(hover:hover)]:hover:bg-primary/5">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showAllCategories && "rotate-180")} />
              {showAllCategories ? "Ver menos" : `Ver mais ${hiddenCategoryCount} ${hiddenCategoryCount === 1 ? "categoria" : "categorias"}`}
            </button>
          )}
        </div>
      </FilterSection>

      <Separator />

      {/* Price Range */}
      <FilterSection title="Preço" open={openSections.price} onToggle={() => toggleSection("price")} active={priceTouched ? 1 : 0}>
        <div className="space-y-4">
          <div>
            <PriceDistribution prices={allPrices} min={minPriceLimit} max={maxPriceLimit} range={priceRange} />
            <Slider min={minPriceLimit} max={maxPriceLimit} step={priceStep} value={priceRange} onValueChange={handlePriceChange} className="mt-1 w-full" aria-label="Intervalo de preço" />
            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{eur(minPriceLimit)}</span><span>{eur(maxPriceLimit)}</span></div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Mínimo</span>
              <div className="relative">
                <Input
                  type="number" inputMode="decimal" min={minPriceLimit} max={priceRange[1]} value={priceRange[0]}
                  onChange={(e) => { setPriceRange([Number(e.target.value) || 0, priceRange[1]]); if (e.target.value !== "") commitPriceInput("min", e.target.value); }}
                  onBlur={(e) => commitPriceInput("min", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="h-10 rounded-lg pr-7 text-sm tabular-nums"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </label>
            <span className="pb-2.5 text-muted-foreground">-</span>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Máximo</span>
              <div className="relative">
                <Input
                  type="number" inputMode="decimal" min={priceRange[0]} max={maxPriceLimit} value={priceRange[1]}
                  onChange={(e) => { setPriceRange([priceRange[0], Number(e.target.value) || 0]); if (e.target.value !== "" && Number(e.target.value) >= priceRange[0]) commitPriceInput("max", e.target.value); }}
                  onBlur={(e) => commitPriceInput("max", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="h-10 rounded-lg pr-7 text-sm tabular-nums"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </label>
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            <strong className="text-foreground tabular-nums">{inPriceRange}</strong> {inPriceRange === 1 ? "produto" : "produtos"} entre {eur(priceRange[0])} e {eur(priceRange[1])}
          </p>
        </div>
      </FilterSection>

      <Separator />

      {/* Colors */}
      {colorSwatches.length > 0 && (
        <>
          <FilterSection title="Cor" open={openSections.colors} onToggle={() => toggleSection("colors")} active={colors.length}>
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {colorSwatches.map((c: any) => {
                  const selected = colors.includes(c.name);
                  return (
                    <Tooltip key={c.name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => toggleColor(c.name)}
                          aria-label={c.name}
                          className={cn(
                            "relative h-8 w-8 overflow-hidden rounded-full border-2 transition-[border-color,box-shadow,transform] duration-200 active:scale-90",
                            selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60"
                          )}
                          style={c.color_hex ? { backgroundColor: c.color_hex } : undefined}
                        >
                          {c.image_url && !c.color_hex && (
                            <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{c.name}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* Sizes */}
      {sizeChips.length > 0 && (
        <>
          <FilterSection title="Tamanho" open={openSections.sizes} onToggle={() => toggleSection("sizes")} active={sizes.length}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sizeChips.map((s: any) => {
                const selected = sizes.includes(s.label);
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => toggleSize(s.label)}
                    className={cn(
                      "h-9 min-w-[2.75rem] rounded-lg border px-3 text-xs font-semibold transition-colors duration-200",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* Materials */}
      {availableMaterials.length > 0 && (
        <>
          <FilterSection title="Material" open={openSections.materials} onToggle={() => toggleSection("materials")} active={materials.length}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableMaterials.map((mat: any) => {
                const selected = materials.includes(mat.slug);
                return (
                  <button
                    key={mat.slug}
                    type="button"
                    onClick={() => handleMaterialChange(mat.slug, !selected)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-200",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary/60"
                    )}
                  >
                    {mat.label}
                    <span className={cn("text-[10px]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {mat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </FilterSection>
          <Separator />
        </>
      )}

      {/* Availability */}
      <FilterSection title="Disponibilidade" open={openSections.availability} onToggle={() => toggleSection("availability")} active={(inStock ? 1 : 0) + (onSale ? 1 : 0)}>
        <div className="space-y-1">
          {[
            { id: "inStock", label: "Apenas em stock", checked: inStock, set: (v: boolean) => { setInStock(v); applyFilters(categories, priceRange, v, onSale, materials, colors, sizes); } },
            { id: "onSale", label: "Em promoção", checked: onSale, set: (v: boolean) => { setOnSale(v); applyFilters(categories, priceRange, inStock, v, materials, colors, sizes); } },
          ].map((o) => (
            <label key={o.id} htmlFor={o.id} className="flex cursor-pointer items-center justify-between rounded-lg px-1 py-2 text-sm [@media(hover:hover)]:hover:bg-muted/50">
              {o.label}
              <Checkbox id={o.id} checked={o.checked} onCheckedChange={(v) => o.set(v === true)} />
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Clear Filters */}
      {activeFiltersCount > 0 && (
        <>
          <Separator />
          <Button variant="outline" className="w-full mt-2" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Limpar tudo ({activeFiltersCount})
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Filter */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="lg:hidden w-full">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {activeFiltersCount > 0 && <Badge className="ml-2" variant="secondary">{activeFiltersCount}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] sm:w-[360px]">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Refine sua busca</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{FilterContent()}</div>
        </SheetContent>
      </Sheet>

      {/* Desktop Filter */}
      <Card className="hidden lg:block p-5 border-border/50 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </h3>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="text-xs">{activeFiltersCount}</Badge>
          )}
        </div>
        {FilterContent()}
      </Card>
    </>
  );
};

export default ProductFilter;

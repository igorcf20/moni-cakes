import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";

interface SortDropdownProps {
  onSortChange: (value: string) => void;
}

const SortDropdown = ({ onSortChange }: SortDropdownProps) => {
  return (
    <Select onValueChange={onSortChange} defaultValue="relevance">
      <SelectTrigger className="w-[160px] md:w-[180px] h-9 text-xs md:text-sm">
        <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
        <SelectValue placeholder="Ordenar" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="relevance">Mais Relevantes</SelectItem>
        <SelectItem value="newest">Mais Recentes</SelectItem>
        <SelectItem value="price-asc">Menor Preço</SelectItem>
        <SelectItem value="price-desc">Maior Preço</SelectItem>
        <SelectItem value="name">Nome (A-Z)</SelectItem>
        <SelectItem value="rating">Melhor Avaliados</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default SortDropdown;

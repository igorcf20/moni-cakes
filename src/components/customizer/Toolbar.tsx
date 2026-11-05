import { Button } from "@/components/ui/button";
import { MousePointer, Pencil, Square, Circle, Type, Image, Trash2, Download } from "lucide-react";

interface ToolbarProps {
  activeTool: "select" | "draw" | "rectangle" | "circle" | "text" | "image";
  onToolClick: (tool: "select" | "draw" | "rectangle" | "circle" | "text" | "image") => void;
  onClear: () => void;
  onDownload: () => void;
  onImageUpload: () => void;
}

const Toolbar = ({ activeTool, onToolClick, onClear, onDownload, onImageUpload }: ToolbarProps) => {
  const tools = [
    { id: "select" as const, icon: MousePointer, label: "Selecionar" },
    { id: "draw" as const, icon: Pencil, label: "Desenhar" },
    { id: "text" as const, icon: Type, label: "Texto" },
    { id: "rectangle" as const, icon: Square, label: "Retângulo" },
    { id: "circle" as const, icon: Circle, label: "Círculo" },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-4 bg-card rounded-lg border border-border shadow-soft">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? "default" : "outline"}
            size="sm"
            onClick={() => onToolClick(tool.id)}
            title={tool.label}
          >
            <Icon className="h-4 w-4" />
            <span className="ml-2 hidden md:inline">{tool.label}</span>
          </Button>
        );
      })}
      
      <div className="w-px bg-border mx-2"></div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onImageUpload}
        title="Adicionar Imagem"
      >
        <Image className="h-4 w-4" />
        <span className="ml-2 hidden md:inline">Imagem</span>
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onDownload}
        title="Baixar"
      >
        <Download className="h-4 w-4" />
        <span className="ml-2 hidden md:inline">Baixar</span>
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        title="Limpar Tudo"
      >
        <Trash2 className="h-4 w-4" />
        <span className="ml-2 hidden md:inline">Limpar</span>
      </Button>
    </div>
  );
};

export default Toolbar;

import { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, FabricImage, Textbox } from "fabric";
import Toolbar from "./Toolbar";
import ColorPicker from "./ColorPicker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import RoomSelector from "./RoomSelector";
import SaveDesignDialog from "../SaveDesignDialog";
import { useSavedDesigns } from "@/hooks/useSavedDesigns";
import { useAuth } from "@/hooks/useAuth";
import { Save } from "lucide-react";
import roomLiving from "@/assets/room-living.jpg";
import roomBedroom from "@/assets/room-bedroom.jpg";
import roomOffice from "@/assets/room-office.jpg";

interface FrameCustomizerProps {
  productImage: string;
  productName: string;
}

const FrameCustomizer = ({ productImage, productName }: FrameCustomizerProps) => {
  const { user } = useAuth();
  const { saveDesign } = useSavedDesigns(user?.id);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeColor, setActiveColor] = useState("#000000");
  const [activeTool, setActiveTool] = useState<"select" | "draw" | "text" | "image">("select");
  const [selectedRoom, setSelectedRoom] = useState<"living" | "bedroom" | "office">("living");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roomBackgrounds = {
    living: roomLiving,
    bedroom: roomBedroom,
    office: roomOffice,
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: "#ffffff",
    });

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = 3;
    }

    setFabricCanvas(canvas);
    toast.success("Editor pronto! Adicione suas imagens e textos.");

    return () => {
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === "draw";
    
    if (activeTool === "draw" && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = 3;
    }
  }, [activeTool, activeColor, fabricCanvas]);

  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (tool === "text") {
      const text = new Textbox("Seu texto aqui", {
        left: 300,
        top: 250,
        fill: activeColor,
        fontSize: 40,
        fontFamily: 'Inter, sans-serif',
        width: 200,
      });
      fabricCanvas?.add(text);
      fabricCanvas?.setActiveObject(text);
      toast.success("Texto adicionado! Clique duas vezes para editar.");
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    
    const objects = fabricCanvas.getObjects();
    objects.forEach((obj) => {
      fabricCanvas.remove(obj);
    });
    
    fabricCanvas.renderAll();
    toast.success("Design limpo!");
  };

  const handleDownload = () => {
    if (!fabricCanvas) return;
    
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2,
    });
    
    const link = document.createElement('a');
    link.download = `${productName}-personalizado.png`;
    link.href = dataURL;
    link.click();
    
    toast.success("Download iniciado!");
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      
      FabricImage.fromURL(imgUrl, {
        crossOrigin: 'anonymous'
      }).then((img) => {
        const scale = Math.min(
          (fabricCanvas?.width || 800) * 0.9 / (img.width || 1),
          (fabricCanvas?.height || 600) * 0.9 / (img.height || 1)
        );
        
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (fabricCanvas?.width || 800) / 2,
          top: (fabricCanvas?.height || 600) / 2,
          originX: 'center',
          originY: 'center',
        });
        
        fabricCanvas?.add(img);
        fabricCanvas?.setActiveObject(img);
        
        toast.success("Imagem adicionada! Ajuste o tamanho conforme necessário.");
      });
    };
    
    reader.readAsDataURL(file);
  };

  const getCanvasPreview = () => {
    if (!fabricCanvas) return null;
    
    return fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
  };

  const handleSaveDesign = (designName: string) => {
    if (!fabricCanvas || !user) {
      toast.error("Inicie sessão para guardar designs");
      return;
    }

    const designData = fabricCanvas.toJSON();
    const thumbnail = getCanvasPreview();

    saveDesign({
      productId: "frame-custom",
      designName,
      designData,
      thumbnail: thumbnail || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <RoomSelector selectedRoom={selectedRoom} onRoomChange={setSelectedRoom} />

      <div className="grid lg:grid-cols-[1fr_auto] gap-4">
        <div className="flex gap-2 items-start">
          <Toolbar
            activeTool={activeTool}
            onToolClick={handleToolClick}
            onClear={handleClear}
            onDownload={handleDownload}
            onImageUpload={handleImageUpload}
          />
          {user && (
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Guardar Design
            </Button>
          )}
        </div>
        <ColorPicker color={activeColor} onChange={setActiveColor} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Editor Canvas */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Editor de Arte</h3>
          <div className="border-4 border-border rounded-2xl shadow-hover overflow-hidden bg-white inline-block w-full">
            <canvas ref={canvasRef} className="max-w-full h-auto" />
          </div>
        </div>

        {/* Room Preview */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Visualização no Ambiente</h3>
          <div className="relative rounded-2xl overflow-hidden shadow-hover border-4 border-border aspect-[4/3] bg-muted">
            <img 
              src={roomBackgrounds[selectedRoom]} 
              alt="Ambiente"
              className="w-full h-full object-cover"
            />
            {getCanvasPreview() && (
              <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[45%] shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                <div className="relative">
                  <img 
                    src={productImage} 
                    alt="Moldura"
                    className="w-full h-auto drop-shadow-2xl"
                  />
                  <img 
                    src={getCanvasPreview()!}
                    alt="Arte personalizada"
                    className="absolute inset-[8%] w-[84%] h-[84%] object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          💡 <strong>Dica:</strong> Adicione sua arte no editor à esquerda e veja como ficará no ambiente escolhido à direita.
          Clique duas vezes no texto para editar.
        </p>
      </div>

      <SaveDesignDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveDesign}
      />
    </div>
  );
};

export default FrameCustomizer;

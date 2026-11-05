import { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, Circle, Rect, FabricImage, Textbox, Point } from "fabric";
import Toolbar from "./Toolbar";
import ColorPicker from "./ColorPicker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import MugPreview3D from "./MugPreview3D";
import { PRODUCT_3D_PREVIEW_ENABLED } from "@/lib/product3DFeature";
import { Eye, Edit } from "lucide-react";

interface CustomizerCanvasProps {
  productImage: string;
  productName: string;
}

const CustomizerCanvas = ({ productImage, productName }: CustomizerCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeColor, setActiveColor] = useState("#000000");
  const [activeTool, setActiveTool] = useState<"select" | "draw" | "rectangle" | "circle" | "text" | "image">("select");
  const [warpMode, setWarpMode] = useState(false);
  const [view3D, setView3D] = useState(false);
  const [canvasTexture, setCanvasTexture] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canvasRef.current || view3D) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 800,
      backgroundColor: "#f5f5f5",
    });

    // Load product image as background
    FabricImage.fromURL(productImage, {
      crossOrigin: 'anonymous'
    }).then((img) => {
      const scale = Math.min(
        canvas.width! / (img.width || 1),
        canvas.height! / (img.height || 1)
      ) * 0.8;
      
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: canvas.width! / 2,
        top: canvas.height! / 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });
      
      canvas.add(img);
      canvas.sendObjectToBack(img);
      canvas.renderAll();
    });

    // Initialize brush only if it exists
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = 3;
    }

    setFabricCanvas(canvas);
    toast.success("Editor pronto! Comece a personalizar.");

    return () => {
      canvas.dispose();
    };
  }, [productImage, view3D]);

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

    if (tool === "rectangle") {
      const rect = new Rect({
        left: 300,
        top: 300,
        fill: activeColor,
        width: 150,
        height: 150,
        stroke: activeColor,
        strokeWidth: 2,
      });
      fabricCanvas?.add(rect);
      fabricCanvas?.setActiveObject(rect);
      toast.success("Retângulo adicionado!");
    } else if (tool === "circle") {
      const circle = new Circle({
        left: 300,
        top: 300,
        fill: activeColor,
        radius: 75,
        stroke: activeColor,
        strokeWidth: 2,
      });
      fabricCanvas?.add(circle);
      fabricCanvas?.setActiveObject(circle);
      toast.success("Círculo adicionado!");
    } else if (tool === "text") {
      const text = new Textbox("Seu texto aqui", {
        left: 300,
        top: 300,
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
      if (obj.selectable !== false) {
        fabricCanvas.remove(obj);
      }
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

  const applyPerspectiveWarp = (img: FabricImage) => {
    // Apply perspective transformation based on product type
    const productType = productName.toLowerCase();
    
    if (productType.includes('caneca') || productType.includes('mug')) {
      // Warp for cylindrical surface (mug)
      img.set({
        skewY: -10,
        angle: -5,
      });
    } else if (productType.includes('almofada') || productType.includes('pillow')) {
      // Slight perspective for pillow
      img.set({
        skewX: 2,
        skewY: 2,
      });
    } else if (productType.includes('capinha') || productType.includes('case')) {
      // Minimal warp for phone case
      img.set({
        skewY: -3,
      });
    }
    
    fabricCanvas?.renderAll();
    toast.success("Perspectiva aplicada! Ajuste manualmente se necessário.");
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
        const scale = Math.min(300 / (img.width || 1), 300 / (img.height || 1));
        
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: 300,
          top: 300,
        });
        
        fabricCanvas?.add(img);
        fabricCanvas?.setActiveObject(img);
        
        if (warpMode) {
          applyPerspectiveWarp(img);
        }
        
        toast.success("Imagem adicionada! Use os controles para ajustar a perspectiva.");
      });
    };
    
    reader.readAsDataURL(file);
  };

  const toggleWarpMode = () => {
    setWarpMode(!warpMode);
    toast.success(warpMode ? "Modo perspectiva desativado" : "Modo perspectiva ativado - imagens serão curvadas automaticamente");
  };

  const applyWarpToSelected = () => {
    const activeObj = fabricCanvas?.getActiveObject();
    if (activeObj && activeObj.type === 'image') {
      applyPerspectiveWarp(activeObj as FabricImage);
    } else {
      toast.error("Selecione uma imagem primeiro");
    }
  };

  const toggle3DView = () => {
    if (!view3D && fabricCanvas) {
      // Export canvas as texture for 3D view
      const dataUrl = fabricCanvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 2
      });
      setCanvasTexture(dataUrl);
      // Dispose canvas before switching to 3D
      fabricCanvas.dispose();
      setFabricCanvas(null);
    }
    setView3D(!view3D);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid lg:grid-cols-[1fr_auto] gap-4">
        <Toolbar
          activeTool={activeTool}
          onToolClick={handleToolClick}
          onClear={handleClear}
          onDownload={handleDownload}
          onImageUpload={handleImageUpload}
        />
        <ColorPicker color={activeColor} onChange={setActiveColor} />
      </div>

      <div className="flex gap-2 justify-center flex-wrap items-center">
        {PRODUCT_3D_PREVIEW_ENABLED && <Button
          variant={view3D ? "outline" : "default"}
          onClick={toggle3DView}
          size="sm"
          className="gap-2"
        >
          {view3D ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {view3D ? "Modo Edição 2D" : "Visualizar em 3D"}
        </Button>}
        
        {!view3D && (
          <>
            <Button
              variant={warpMode ? "default" : "outline"}
              onClick={toggleWarpMode}
              size="sm"
            >
              {warpMode ? "✓ Perspectiva Automática" : "Perspectiva Automática"}
            </Button>
            <Button
              variant="outline"
              onClick={applyWarpToSelected}
              size="sm"
            >
              Aplicar Perspectiva à Imagem Selecionada
            </Button>
          </>
        )}
      </div>

      <div className="flex justify-center">
        {view3D ? (
          <div key="3d-view" className="w-full max-w-4xl">
            <MugPreview3D textureDataUrl={canvasTexture} />
            <p className="text-center text-sm text-muted-foreground mt-4">
              🖱️ Clique e arraste para rotacionar • Role para zoom
            </p>
          </div>
        ) : (
          <div key="2d-view" className="border-4 border-border rounded-2xl shadow-hover overflow-hidden bg-white inline-block">
            <canvas ref={canvasRef} className="max-w-full h-auto" />
          </div>
        )}
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
          💡 <strong>Dica:</strong> Use as ferramentas acima para personalizar seu produto. 
          Clique duas vezes no texto para editar. Arraste elementos para reposicionar.
        </p>
      </div>
    </div>
  );
};

export default CustomizerCanvas;

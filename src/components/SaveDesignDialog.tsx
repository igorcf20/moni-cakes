import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveDesignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (designName: string) => void;
}

const SaveDesignDialog = ({ open, onOpenChange, onSave }: SaveDesignDialogProps) => {
  const [designName, setDesignName] = useState("");

  const handleSave = () => {
    if (designName.trim()) {
      onSave(designName.trim());
      setDesignName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar Design</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="design-name">Nome do Design</Label>
            <Input
              id="design-name"
              placeholder="Ex: Meu design favorito"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!designName.trim()}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveDesignDialog;

import { Button } from "@/components/ui/button";
import { Home, Bed, Briefcase } from "lucide-react";

interface RoomSelectorProps {
  selectedRoom: "living" | "bedroom" | "office";
  onRoomChange: (room: "living" | "bedroom" | "office") => void;
}

const RoomSelector = ({ selectedRoom, onRoomChange }: RoomSelectorProps) => {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      <Button
        variant={selectedRoom === "living" ? "default" : "outline"}
        onClick={() => onRoomChange("living")}
        className="gap-2"
      >
        <Home className="h-4 w-4" />
        Sala de Estar
      </Button>
      <Button
        variant={selectedRoom === "bedroom" ? "default" : "outline"}
        onClick={() => onRoomChange("bedroom")}
        className="gap-2"
      >
        <Bed className="h-4 w-4" />
        Quarto
      </Button>
      <Button
        variant={selectedRoom === "office" ? "default" : "outline"}
        onClick={() => onRoomChange("office")}
        className="gap-2"
      >
        <Briefcase className="h-4 w-4" />
        Escritório
      </Button>
    </div>
  );
};

export default RoomSelector;

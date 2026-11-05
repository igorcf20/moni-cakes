import { Card } from "@/components/ui/card";

const SkeletonProductCard = () => {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-square bg-muted skeleton" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted skeleton rounded w-3/4" />
        <div className="h-3 bg-muted skeleton rounded w-full" />
        <div className="flex items-center gap-2">
          <div className="h-3 bg-muted skeleton rounded w-16" />
          <div className="h-3 bg-muted skeleton rounded w-20" />
        </div>
        <div className="h-6 bg-muted skeleton rounded w-24" />
        <div className="h-10 bg-muted skeleton rounded w-full" />
      </div>
    </Card>
  );
};

export default SkeletonProductCard;

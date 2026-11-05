import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromoCountdownProps {
  endsAt: Date;
  onExpire?: () => void;
  className?: string;
  compact?: boolean;
  prefix?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const PromoCountdown = ({
  endsAt,
  onExpire,
  className,
  compact = false,
  prefix = "Termina em",
}: PromoCountdownProps) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const end = endsAt.getTime();
  const remaining = end - now;

  useEffect(() => {
    if (remaining <= 0 && onExpire) onExpire();
  }, [remaining, onExpire]);

  if (remaining <= 0) return null;

  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-destructive",
          className,
        )}
      >
        <Timer className="h-3 w-3" />
        {days > 0 && `${days}d `}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-2 text-xs sm:text-sm text-destructive font-medium",
        className,
      )}
    >
      <Timer className="h-3.5 w-3.5" />
      <span>{prefix}:</span>
      <span className="tabular-nums">
        {days > 0 && (
          <>
            <strong>{pad(days)}</strong>d{" "}
          </>
        )}
        <strong>{pad(hours)}</strong>h <strong>{pad(minutes)}</strong>m{" "}
        <strong>{pad(seconds)}</strong>s
      </span>
    </div>
  );
};

export default PromoCountdown;
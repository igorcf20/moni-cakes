interface SectionDividerProps {
  variant?: "light" | "dark" | "cream";
  ornament?: "diamond" | "dots" | "line";
}

const SectionDivider = ({ variant = "light", ornament = "diamond" }: SectionDividerProps) => {
  const bgClass =
    variant === "dark"
      ? "bg-foreground"
      : variant === "cream"
      ? "bg-muted/30"
      : "bg-background";

  const lineClass =
    variant === "dark"
      ? "via-primary/50"
      : "via-primary/40";

  const dotClass =
    variant === "dark" ? "bg-primary/70" : "bg-primary/60";

  return (
    <div className={`${bgClass} py-8 md:py-10`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-5">
          <span className={`h-px flex-1 max-w-[180px] bg-gradient-to-r from-transparent ${lineClass} to-transparent`} />
          {ornament === "diamond" && (
            <div className="flex items-center gap-2">
              <span className={`h-1 w-1 rounded-full ${dotClass}`} />
              <span className={`h-1.5 w-1.5 rotate-45 ${dotClass}`} />
              <span className={`h-1 w-1 rounded-full ${dotClass}`} />
            </div>
          )}
          {ornament === "dots" && (
            <div className="flex items-center gap-1.5">
              <span className={`h-1 w-1 rounded-full ${dotClass}`} />
              <span className={`h-1 w-1 rounded-full ${dotClass}`} />
              <span className={`h-1 w-1 rounded-full ${dotClass}`} />
            </div>
          )}
          {ornament === "line" && (
            <span className={`h-px w-8 ${dotClass.replace("bg-", "bg-")}`} />
          )}
          <span className={`h-px flex-1 max-w-[180px] bg-gradient-to-l from-transparent ${lineClass} to-transparent`} />
        </div>
      </div>
    </div>
  );
};

export default SectionDivider;

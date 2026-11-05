import { useEffect, useRef, useState, type ReactNode, type ElementType, type CSSProperties } from "react";

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  variant?: "up" | "left" | "right" | "scale";
  delay?: number;
  threshold?: number;
  once?: boolean;
  style?: CSSProperties;
};

const VARIANT_CLASS: Record<NonNullable<RevealProps["variant"]>, string> = {
  up: "",
  left: "reveal-left",
  right: "reveal-right",
  scale: "reveal-scale",
};

const Reveal = ({
  children,
  as: Tag = "div",
  className = "",
  variant = "up",
  delay = 0,
  threshold = 0.15,
  once = true,
  style,
}: RevealProps) => {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold, once]);

  const Component = Tag as ElementType;
  return (
    <Component
      ref={ref as any}
      className={`reveal ${VARIANT_CLASS[variant]} ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={{ transitionDelay: visible && delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </Component>
  );
};

export default Reveal;
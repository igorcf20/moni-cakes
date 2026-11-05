import { useLocation } from "react-router-dom";
import { type ReactNode } from "react";

/**
 * Wraps route content and replays a fade+slide animation on every pathname change.
 * Respects prefers-reduced-motion via the animate-fade-in keyframe.
 */
const PageTransition = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
};

export default PageTransition;

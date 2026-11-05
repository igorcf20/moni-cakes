import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Route changes: new pages open at the top, Back/Forward returns to where the visitor was,
// and links with #anchors glide to their section (the smoothness comes from CSS scroll-behavior).
const positions = new Map<string, number>();
if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual";

export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef(location.key);

  // Keep the latest position of the current page (a Map write, cheap enough per scroll event).
  useEffect(() => {
    const onScroll = () => positions.set(currentKey.current, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    if (location.hash) {
      // Retry briefly so the target exists (lazy routes, data still loading).
      const id = decodeURIComponent(location.hash.slice(1));
      let tries = 0;
      const find = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ block: "start" });
        else if (tries++ < 20) setTimeout(find, 100);
      };
      requestAnimationFrame(find);
      return;
    }
    const top = navType === "POP" ? positions.get(location.key) ?? 0 : 0;
    // Jump instantly on route change; gliding across a whole new page reads as lag.
    window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
    // Lazy pages and their data arrive a moment later: keep re-applying until the page is tall
    // enough (max ~2s), unless the visitor starts scrolling themselves.
    if (top > 0) {
      let tries = 0;
      const restore = () => {
        if (currentKey.current !== location.key) return;
        window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
        if (Math.abs(window.scrollY - top) > 2 && tries++ < 20) setTimeout(restore, 100);
      };
      setTimeout(restore, 50);
    }
  }, [location.key, location.hash, navType]);

  return null;
}

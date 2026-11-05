import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Fallback for the e-mail confirmation link: if the provider lands the customer on the home
// page, send them on to where they were going (e.g. checkout) instead of leaving them there.
const PostAuthRedirect = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    let target: string | null = null;
    try { target = localStorage.getItem("post_auth_redirect"); } catch { /* storage blocked */ }
    if (!target || !target.startsWith("/") || target.startsWith("//")) return;
    if (pathname === "/") navigate(target, { replace: true });
    if (pathname === "/" || pathname === target) {
      try { localStorage.removeItem("post_auth_redirect"); } catch { /* ignore */ }
    }
  }, [user, loading, pathname, navigate]);

  return null;
};

export default PostAuthRedirect;

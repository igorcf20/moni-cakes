import { STORE_DEFAULTS } from "@/config/store";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, Shield, Loader2, ArrowLeft, Heart } from "lucide-react";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useBrand } from "@/hooks/useBrand";
import { accessState, canOpenAdmin } from "@/lib/adminSecurity";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { data: storeInfo } = useStoreInfo();
  const brand = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkRoleAndRedirect = async (userId: string) => {
      try {
        // Estado de acesso: admin (com ou sem o código de 2 passos por fazer) abre o Admin, que pede o código.
        const { data: state, error } = await (supabase as any).rpc("admin_access_state");
        if (cancelled) return;
        if (error) throw error;
        void userId;
        if (canOpenAdmin(accessState(state))) {
          navigate("/admin");
        } else {
          await supabase.auth.signOut();
          toast.error("Acesso negado. Esta conta não possui permissão de administrador.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Role check error:", err);
        if (!cancelled) {
          setLoading(false);
          toast.error("Erro ao verificar permissões. Tente novamente.");
        }
      }
    };

    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.user?.id) {
          await checkRoleAndRedirect(session.user.id);
        }
      } catch (err) {
        console.error("Session check error:", err);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    };

    // Timeout fallback: never stay loading more than 5s
    const fallback = setTimeout(() => {
      if (!cancelled) setCheckingSession(false);
    }, 5000);

    checkInitialSession().then(() => clearTimeout(fallback));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.id) {
        // Defer RPC call with setTimeout(0) to avoid Supabase internal auth lock deadlock
        setTimeout(() => {
          if (!cancelled) checkRoleAndRedirect(session.user.id);
        }, 0);
      } else if (event === "SIGNED_OUT") {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message.includes("Invalid login credentials")
        ? "Email ou palavra-passe incorretos"
        : error.message);
      setLoading(false);
    }
    // If no error, onAuthStateChange will handle redirect
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-ui min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#0a0a0a]">
      {/* Background with Overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-luxury opacity-80" />
      <div className="absolute inset-0 z-0 bg-gradient-to-tr from-[#0a0a0a] via-transparent to-primary/10" />
      
      {/* Glassmorphism Grain/Texture Overlay */}

      <div className="w-full max-w-md relative z-10">
        <Button
          variant="ghost"
          className="mb-8 text-white/60 hover:text-white hover:bg-white/10 transition-all duration-300 group"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Voltar à loja
        </Button>

        <Card className="border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl text-white overflow-hidden animate-fade-in-up">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          
          <CardHeader className="text-center space-y-4 pb-2 pt-8">
            <div className="flex justify-center mb-2">
              <div className="relative group">
                <div className="absolute -inset-4 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-all duration-500" />
                <img
                  src={brand.logos.full || brand.logos.icon || brand.favicon}
                  alt={storeInfo?.name || STORE_DEFAULTS.name}
                  className="h-20 w-20 rounded-lg bg-white p-1 relative z-10 object-contain"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <Shield className="h-4 w-4 text-primary animate-pulse" />
                <CardTitle className="text-2xl font-display tracking-tight">Portal de Acesso</CardTitle>
              </div>
              <CardDescription className="text-white/50 text-xs uppercase tracking-[0.2em]">
                Sistema de Gestão {storeInfo?.name || STORE_DEFAULTS.name}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pt-6 pb-8 px-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-white/70 text-[10px] uppercase tracking-widest ml-1">Identificação</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-primary transition-colors" />
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="seu@email.com"
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 focus:ring-primary/20 transition-all h-12"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password" className="text-white/70 text-[10px] uppercase tracking-widest ml-1">Credencial</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-primary transition-colors" />
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10 bg-white/5 border-white/10 focus:border-primary/50 focus:ring-primary/20 transition-all h-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 transition-all duration-300 active:scale-[0.98]" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Entrar no Painel
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/5 text-center">
              <p className="text-[10px] text-white/30 flex items-center justify-center gap-1.5 leading-relaxed">
                <Shield className="h-3 w-3" />
                Ambiente seguro e monitorado. <br />
                Acesso restrito para administradores.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-light flex items-center justify-center gap-2">
            {storeInfo?.name || STORE_DEFAULTS.name} <span className="h-1 w-1 rounded-full bg-white/20" /> ADMIN
          </p>
          <div className="flex items-center justify-center gap-1 text-[9px] text-white/10">
            <span>Powered by</span>
            <span className="font-bold tracking-widest text-white/20">KODEMI</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;

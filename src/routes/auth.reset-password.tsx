import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [{ title: "Nueva contraseña | Gestor de Prestamos" }],
  }),
  component: ResetPasswordPage,
});

/**
 * Landing del enlace de recuperación (Supabase). supabase-js detecta el
 * `?code=` (PKCE) o el hash `#...type=recovery` al inicializar y crea la sesión;
 * aquí esperamos esa sesión y pedimos la contraseña nueva.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let done = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (data.session && !done) {
        done = true;
        setStatus("ready");
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session && !done) {
        done = true;
        setStatus("ready");
      }
    });

    void check();
    const t1 = setTimeout(() => void check(), 1200);
    const t2 = setTimeout(() => void check(), 3000);
    const fail = setTimeout(() => {
      if (!done) setStatus("invalid");
    }, 9000);

    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";
    if (q.get("error") || q.get("error_description") || /error=/.test(hash)) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(fail);
      setStatus("invalid");
    }

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(fail);
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pwd !== confirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Contraseña actualizada. Entrando…");
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 700);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-display text-xl font-bold">
            Gestor de <span className="text-primary">Prestamos</span>
          </p>
        </div>

        <div className="surface p-6">
          {status === "checking" && (
            <div className="py-6 text-center">
              <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Validando tu enlace…</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <h1 className="font-display text-lg font-semibold">Enlace inválido o vencido</h1>
              <p className="text-sm text-muted-foreground">
                El enlace de recuperación ya no es válido. Solicita uno nuevo desde la pantalla de
                inicio de sesión.
              </p>
              <Button asChild variant="accent" className="h-11 w-full">
                <Link to="/auth">Volver al inicio de sesión</Link>
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <h1 className="font-display text-lg font-semibold">Nueva contraseña</h1>
                <p className="text-sm text-muted-foreground">
                  Elige una contraseña para tu cuenta.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={show ? "text" : "password"}
                    className="h-11 rounded-lg pr-10"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Ocultar contraseña" : "Ver contraseña"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  className="h-11 rounded-lg"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" disabled={loading} className="h-11 w-full" variant="accent">
                {loading ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/auth" className="hover:underline">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

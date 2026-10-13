import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileCaptcha, type TurnstileHandle } from "@/components/auth/turnstile";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Gestor de Prestamos" },
      {
        name: "description",
        content: "Accede a tu cuenta del Gestor de Prestamos para administrar tu cartera.",
      },
      { property: "og:title", content: "Entrar | Gestor de Prestamos" },
      { property: "og:description", content: "Accede a tu cartera de préstamos." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "register" | "reset";

const inputCls = "h-11 rounded-lg";

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="text-sm text-muted-foreground">
        {props.label}
      </Label>
      <div className="relative">
        <Input
          id={props.id}
          type={props.show ? "text" : "password"}
          required
          minLength={6}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder ?? "Mínimo 6 caracteres"}
          className={`${inputCls} pr-10`}
        />
        <button
          type="button"
          onClick={props.onToggle}
          aria-label={props.show ? "Ocultar contraseña" : "Ver contraseña"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        >
          {props.show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mode") === "register"
      ? "register"
      : "login",
  );
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function goHome() {
    let isAdmin = false;
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: au } = await supabase
          .from("app_users")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();
        isAdmin = au?.role === "admin";
      }
    } catch {
      // sin fila en app_users -> flujo normal de cliente
    }
    if (isAdmin) navigate({ to: "/admin", replace: true });
    else navigate({ to: "/dashboard", replace: true });
  }

  useEffect(() => {
    // Un enlace de recuperación llega como ?code= (PKCE) o #…type=recovery:
    // en ese caso NO auto-entramos; llevamos a la pantalla de contraseña nueva.
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";
    const isAuthLanding =
      q.has("code") ||
      q.has("error") ||
      q.has("error_description") ||
      /type=recovery|error=/.test(hash);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        navigate({ to: "/auth/reset-password", replace: true });
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      if (isAuthLanding) {
        // sesión creada por el enlace de recuperación -> a poner la contraseña
        navigate({ to: "/auth/reset-password", replace: true });
      } else {
        void goHome();
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarModo(m: Mode) {
    setMode(m);
    setSentEmail(null);
    toast.dismiss();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (turnstileRef.current) {
        // El widget ya resolvio en segundo plano o muestra la casilla solo si
        // Cloudflare pide confirmacion (interaction-only). Sin token, avisamos
        // antes de llegar a Supabase (que lo rechazaria con error crudo).
        const t = await turnstileRef.current.getToken();
        if (!t) throw new Error("Marca la casilla de verificación (Cloudflare) para continuar.");
        captchaToken = t;
      }
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: captchaToken ? { captchaToken } : {},
        });
        if (error) throw error;
        await goHome();
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
          ...(captchaToken ? { captchaToken } : {}),
        });
        if (error) throw error;
        toast.success("Revisa tu correo para restablecer tu contraseña.");
        cambiarModo("login");
      } else {
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        if (password !== confirm) throw new Error("Las contraseñas no coinciden.");
        if (!accepted) throw new Error("Debes aceptar los Términos y Condiciones.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            ...(captchaToken ? { captchaToken } : {}),
            data: {
              full_name: fullName.trim(),
              business_name: fullName.trim() || "Mi Negocio",
            },
          },
        });
        if (error) throw error;
        if (data.session) await goHome();
        else {
          setSentEmail(email);
          setPassword("");
          setConfirm("");
          setAccepted(false);
        }
      }
    } catch (err) {
      const anyErr = err as { error_code?: string; message?: string };
      const msg =
        anyErr?.error_code === "captcha_failed"
          ? "Completa la verificación humana (caja de Cloudflare) y vuelve a intentar."
          : err instanceof Error
            ? err.message
            : "No pudimos completar la operación";
      toast.error(msg);
    } finally {
      turnstileRef.current?.reset();
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      toast.error("Google no devolvió un enlace de acceso");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos entrar con Google");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <img
            src="/gp-icon.png"
            alt="Gestor de Prestamos"
            className="mx-auto mb-3 size-16 rounded-xl object-cover"
          />
          <h1 className="font-display text-2xl font-bold">
            {mode === "register"
              ? "Crear cuenta"
              : mode === "reset"
                ? "Restablecer contraseña"
                : "Gestor de Prestamos"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "register"
              ? "Empieza gratis — sin tarjeta de crédito"
              : "Controla tus préstamos personales"}
          </p>
        </div>

        {mode === "register" && sentEmail ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10">
              <MailCheck className="size-7 text-success" />
            </div>
            <h2 className="text-lg font-semibold">¡Casi listo!</h2>
            <p className="text-sm text-muted-foreground">
              Enviamos un correo de confirmación a{" "}
              <strong className="text-foreground">{sentEmail}</strong>. Ábrelo y pulsa el enlace
              para activar tu cuenta; luego inicia sesión y comienza tu prueba de 14 días. Si no lo
              ves, revisa la carpeta de spam.
            </p>
            <Button variant="accent" className="h-11 w-full" onClick={() => cambiarModo("login")}>
              Entendido, iniciar sesión
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold">
              {mode === "login"
                ? "Iniciar sesión"
                : mode === "register"
                  ? "Crea tu cuenta"
                  : "Recupera tu acceso"}
            </h2>

            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-sm text-muted-foreground">
                  Nombre completo
                </Label>
                <Input
                  id="fullName"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Pérez"
                  className={inputCls}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className={inputCls}
              />
            </div>

            {mode !== "reset" && (
              <PasswordField
                id="password"
                label="Contraseña"
                value={password}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={setPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            )}

            {mode === "register" && (
              <PasswordField
                id="confirm"
                label="Confirmar contraseña"
                value={confirm}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={setConfirm}
                placeholder="Repite tu contraseña"
                autoComplete="new-password"
              />
            )}

            {mode === "register" && (
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  Acepto los{" "}
                  <Link to="/terminos" className="font-medium text-primary hover:underline">
                    Términos y Condiciones
                  </Link>
                </span>
              </label>
            )}

            {mode === "login" && (
              <button
                type="button"
                onClick={() => cambiarModo("reset")}
                className="text-sm text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            <TurnstileCaptcha ref={turnstileRef} />

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full text-base"
              variant="accent"
            >
              {loading
                ? "Procesando…"
                : mode === "login"
                  ? "Entrar"
                  : mode === "register"
                    ? "Crear cuenta"
                    : "Enviar enlace"}
            </Button>

            {mode !== "reset" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {mode === "register" ? "o regístrate con" : "o"}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button type="button" variant="outline" className="h-11 w-full" onClick={google}>
                  <svg viewBox="0 0 24 24" className="mr-2 size-4" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4h6.5c-.1 1.1-.8 2.7-2.3 3.8l3.6 2.8c2.2-2 3.7-5 3.7-8.4z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23.5c3.2 0 5.9-1.1 7.8-2.9l-3.6-2.8c-1 .7-2.3 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1L1.4 16c1.9 3.8 5.8 7.5 10.6 7.5z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.1 13.9c-.3-.8-.3-1.5-.3-2.4 0-.8.1-1.6.3-2.3L1.4 6.3C.5 8.1 0 10 0 12s.5 3.9 1.4 5.7l3.7-2.8z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.6c2.2 0 3.6 1 4.5 1.8l3.3-3.2C17.9 1.2 15.2 0 12 0 7.2 0 3.3 3.6 1.4 7.5l3.7 2.9c1-3 3.7-5.8 6.9-5.8z"
                    />
                  </svg>
                  Continuar con Google
                </Button>
              </div>
            )}
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" && (
            <>
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => cambiarModo("register")}
                className="text-primary hover:underline"
              >
                Regístrate
              </button>{" "}
              ·{" "}
              <Link to="/pricing" className="text-primary hover:underline">
                Ver planes
              </Link>
            </>
          )}
          {mode === "register" && (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => cambiarModo("login")}
                className="text-primary hover:underline"
              >
                Inicia sesión
              </button>
            </>
          )}
          {mode === "reset" && (
            <button
              type="button"
              onClick={() => cambiarModo("login")}
              className="text-primary hover:underline"
            >
              Volver a inicio de sesión
            </button>
          )}
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Al continuar aceptas nuestra{" "}
          <Link to="/privacidad" className="text-primary hover:underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

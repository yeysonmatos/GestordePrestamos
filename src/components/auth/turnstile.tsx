import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
      execute: (id: string) => void;
      getResponse: (id: string) => string | undefined;
    };
  }
}

const SITE_KEY = (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) ?? "";

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.reject();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("No se pudo cargar Cloudflare Turnstile"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Espera y devuelve un token nuevo (resuelve el reto si hace falta). */
  getToken: () => Promise<string | null>;
  /** Invalida el token usado para que el siguiente submit pida uno nuevo. */
  reset: () => void;
}

export const TurnstileCaptcha = forwardRef<TurnstileHandle>(function TurnstileCaptcha(_, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const executingRef = useRef(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          size: "normal",
          appearance: "interaction-only",
          callback: (token: string) => {
            executingRef.current = false;
            tokenRef.current = token;
          },
          "expired-callback": () => {
            executingRef.current = false;
            tokenRef.current = null;
          },
          "error-callback": () => {
            executingRef.current = false;
            tokenRef.current = null;
          },
        });
      })
      .catch(() => {
        /* sin red o bloqueado: getToken() devolvera null y el submit avisara */
      });
    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      widgetIdRef.current = null;
      tokenRef.current = null;
      executingRef.current = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return "";
      const ts = window.turnstile;
      const id = widgetIdRef.current;
      if (!ts || !id) return null;
      tokenRef.current = ts.getResponse(id) ?? tokenRef.current;
      if (!tokenRef.current) {
        try {
          // dispara el reto si hace falta; con "interaction-only" el usuario ve la
          // caja solo cuando Cloudflare pide confirmacion (la mayoria no la vera)
          if (!executingRef.current) {
            executingRef.current = true;
            ts.execute(id);
          }
        } catch {
          /* no disponible aun */
        }
        for (let i = 0; i < 5 && !tokenRef.current; i++) {
          await new Promise((r) => setTimeout(r, 100));
          tokenRef.current = ts.getResponse(id) ?? tokenRef.current;
        }
      }
      return tokenRef.current;
    },
    reset() {
      tokenRef.current = null;
      executingRef.current = false;
      try {
        if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    },
  }));

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="min-h-[65px]" aria-label="Verificación humana" />;
});

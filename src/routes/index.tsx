import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, HandCoins, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Google AdSense — SOLO en esta pagina publica (la app privada queda sin anuncios).
const ADSENSE_CLIENT = "ca-pub-3577361424276054";
// Pega aqui el ID del bloque (data-ad-slot) que crees en AdSense -> Anuncios -> Por unidad.
// Mientras este vacio, el hueco del banner no se muestra (la verificacion va por ads.txt).
const ADSENSE_SLOT = "";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestor de Prestamos | Control de préstamos personales en RD" },
      {
        name: "description",
        content:
          "Lleva el control de tus préstamos personales en República Dominicana: clientes, cuotas, mora, cobros del día y reportes.",
      },
      { property: "og:title", content: "Gestor de Prestamos" },
      {
        property: "og:description",
        content: "Control de préstamos personales para prestamistas en República Dominicana.",
      },
      // Verificación de propiedad del sitio para Google AdSense
      { name: "google-adsense-account", content: ADSENSE_CLIENT },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Valida el token contra el servidor: si expiró, mostramos la portada (no un salto a /auth)
        const { data: u } = await supabase.auth.getUser();
        if (u?.user) {
          navigate({ to: "/dashboard", replace: true });
          return;
        }
      }
      setChecked(true);
    })();
  }, [navigate]);

  // AdSense: carga el script SOLO en esta página pública (la app privada queda sin anuncios).
  useEffect(() => {
    const id = "adsbygoogle-js";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(s);
    }
    // Solo se pide un bloque cuando hay un ID de bloque (data-ad-slot) configurado.
    if (!ADSENSE_SLOT) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      /* si AdSense falla, la página sigue funcionando igual */
    }
  }, []);

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <p className="flex items-center gap-2 font-display text-base font-bold">
          <img src="/gp-icon.png" alt="" className="size-7 rounded-lg object-cover" />
          <span>
            Gestor de <span className="text-accent">Prestamos</span>
          </span>
        </p>
        <Button asChild variant="accent" size="sm">
          <Link to="/auth" search={{ mode: "register" }}>
            Registrarse
          </Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-16">
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] sm:text-6xl">
          Cada peso prestado, cada cuota cobrada, en un solo lugar.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Registra clientes, arma cronogramas de cuotas, cobra con mora automática y mira al
          instante quién te debe hoy. Todo en pesos y en español.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="accent" className="w-full text-base sm:w-auto">
            <Link to="/auth">
              Entrar <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: HandCoins,
              title: "Cobros del día",
              text: "Lista de quién paga hoy y quién está vencido, con mora calculada.",
            },
            {
              icon: ShieldCheck,
              title: "Tus datos, privados",
              text: "Cada prestamista solo ve su propia cartera de clientes y préstamos.",
            },
            {
              icon: Smartphone,
              title: "Desde el celular",
              text: "Pensado para usarse donde sea.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="surface p-5">
              <Icon className="size-5 text-accent" />
              <h2 className="mt-3 font-display text-base font-semibold">{title}</h2>
              {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
            </div>
          ))}
        </div>

        {/* Banner de AdSense: pequeño y centrado, debajo de las 3 tarjetas.
            Solo se renderiza cuando ADSENSE_SLOT tiene el ID del bloque creado en AdSense. */}
        {ADSENSE_SLOT && (
          <div className="mt-10 flex w-full justify-center">
            <ins
              className="adsbygoogle block w-full max-w-3xl"
              style={{ display: "block" }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={ADSENSE_SLOT}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          </div>
        )}
      </section>
    </div>
  );
}

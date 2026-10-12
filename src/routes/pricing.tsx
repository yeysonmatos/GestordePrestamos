import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicPlans } from "@/lib/pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Planes | Gestor de Prestamos" },
      { name: "description", content: "Elige el plan ideal para tu negocio de préstamos en República Dominicana." },
    ],
  }),
  component: Pricing,
});

const FEATURES: Record<string, string[]> = {
  Trial: ["14 días gratis para probarlo", "Préstamos, cobros y clientes ilimitados (con límite razonable)", "Reportes y calendario"],
  Básico: ["Negocio activo sin límites prácticos", "Cobros, mora y recibos", "Soporte por correo"],
  Pro: ["Todo lo del Básico", "Más capacidad para tu negocio", "Soporte prioritario"],
};

function Pricing() {
  const { data: plans = [], isLoading } = usePublicPlans();

  const items = plans.map((p) => {
    const key = p.name as keyof typeof FEATURES;
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      cycle: p.billing_cycle === "yearly" ? "año" : "mes",
      features: FEATURES[key] ?? ["Acceso completo a la plataforma"],
      active: p.is_active,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Planes que se ajustan a tu negocio
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          Precios en pesos dominicanos. <strong>Trial 14 días gratis</strong>. Cancela cuando quieras.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Al registrarte aceptas nuestros{" "}
          <Link to="/terminos" className="text-primary hover:underline">Términos y Condiciones</Link> y nuestra{" "}
          <Link to="/privacidad" className="text-primary hover:underline">Política de Privacidad</Link>.
        </p>
      </header>

      {isLoading && <p className="mt-8 text-center text-sm text-muted-foreground">Cargando planes...</p>}

      {!isLoading && !items.length && (
        <div className="surface mx-auto mt-8 max-w-md p-8 text-center">
          <CreditCard className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No hay planes activos en este momento. Intenta más tarde.</p>
        </div>
      )}

      {!!items.length && (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((p) => (
            <article key={p.id} className={`surface flex flex-col p-6 ${p.name === "Básico" ? "border-primary/40 shadow-lg" : ""}`}>
              <header>
                <p className="font-display text-lg font-semibold">{p.name}</p>
                <p className="mt-2">
                  <span className="font-display text-3xl font-bold">{p.price.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">/{p.cycle}</span>
                </p>
              </header>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant={p.name === "Básico" ? "accent" : "secondary"} className="mt-5 h-11 w-full">
                <Link to="/auth" search={{ mode: "register" }}>
                  {p.name === "Trial" ? "Empezar gratis" : "Elegir este plan"}
                </Link>
              </Button>
            </article>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Ley 172-13 sobre protección de datos personales.
      </p>
    </main>
  );
}

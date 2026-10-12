import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { AccountPanel } from "@/components/settings/account-panel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Mi plan | Gestor de Prestamos" },
      { name: "description", content: "Estado de tu suscripción e historial de pagos." },
      { property: "og:title", content: "Mi plan | Gestor de Prestamos" },
      { property: "og:description", content: "Estado de tu suscripción e historial de pagos." },
    ],
  }),
  component: Account,
});

function Account() {
  return (
    <>
      <PageHeader
        title="Mi plan"
        subtitle="Estado de tu suscripción y tus pagos"
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/settings" search={{ tab: "ajustes" }}>Ajustes</Link>
          </Button>
        }
      />
      <AccountPanel />
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import MfaSetup from "@/components/admin/MfaSetup";

export const Route = createFileRoute("/_authenticated/admin/seguridad/")({
  component: AdminSecurityPage,
});

function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Seguridad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protege tu cuenta de administrador con doble verificación.
        </p>
      </div>

      <Card>
        <MfaSetup />
      </Card>
    </div>
  );
}


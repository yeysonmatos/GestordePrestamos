import { createFileRoute } from "@tanstack/react-router";
import ComunicacionesTabs from "@/components/admin/ComunicacionesTabs";

export const Route = createFileRoute("/_authenticated/admin/comunicaciones/")({
  component: ComunicacionesPage,
});

function ComunicacionesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comunicaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona emails, recordatorios y configuraciones de envío.
        </p>
      </div>
      <ComunicacionesTabs />
    </div>
  );
}

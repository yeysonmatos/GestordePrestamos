import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad | Gestor de Prestamos" },
      { name: "description", content: "Política de Privacidad de Gestor de Prestamos conforme a la Ley 172-13 de República Dominicana." },
    ],
  }),
  component: Privacidad,
});

function Privacidad() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-2.5">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Política de Privacidad</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestor de Prestamos · gestordprestamo@gmail.com · Última actualización: 01/09/2026
          </p>
        </div>
      </header>

      <article className="surface space-y-6 p-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-base font-semibold">1. Responsable del tratamiento</h2>
          <p className="mt-2 text-muted-foreground">
            El responsable del tratamiento de los datos personales es Gestor de Prestamos. Para cualquier consulta sobre esta política, puede escribir a gestordprestamo@gmail.com.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">2. Datos que recopilamos</h2>
          <p className="mt-2 text-muted-foreground">
            Recopilamos datos necesarios para prestar el servicio: información de la cuenta (nombre, correo, teléfono), datos de negocio (nombre comercial, teléfono, preferencia de moneda), datos de clientes (nombre, teléfono, cédula/tipo de documento, dirección opcional), datos de préstamos (montos, fechas, cuotas), pagos y documentos subidos.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">3. Finalidad del tratamiento</h2>
          <p className="mt-2 text-muted-foreground">
            Usamos sus datos para gestionar préstamos, cobros, reportes, facturación de suscripción, seguridad, soporte y cumplimiento de obligaciones legales. No vendemos ni alquilamos sus datos personales.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">4. Conservación</h2>
          <p className="mt-2 text-muted-foreground">
            Conservaremos sus datos mientras dure la relación contractual y el tiempo necesario para cumplir obligaciones legales. Puede solicitar la eliminación de su cuenta en cualquier momento.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">5. Consentimiento</h2>
          <p className="mt-2 text-muted-foreground">
            Al usar la plataforma, usted consiente el tratamiento de sus datos conforme a esta política, salvo cuando la ley disponga otra cosa.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">6. Transferencias</h2>
          <p className="mt-2 text-muted-foreground">
            Podemos compartir datos con proveedores que prestan servicios a la plataforma (alojamiento, correo, almacenamiento de archivos) bajo cláusulas de confidencialidad. No transferimos datos a terceros con fines comerciales.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">7. Seguridad</h2>
          <p className="mt-2 text-muted-foreground">
            Aplicamos medidas razonables de seguridad (autenticación, Row Level Security, cifrado en tránsito) para proteger sus datos.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">8. Derechos ARCO</h2>
          <p className="mt-2 text-muted-foreground">
            Conforme a la Ley 172-13, usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos. Para ejercerlo, envíe un correo a gestordprestamo@gmail.com indicando su identificación y solicitud.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">9. Datos de terceros</h2>
          <p className="mt-2 text-muted-foreground">
            Usted es responsable de contar con el consentimiento necesario para registrar datos personales de sus clientes en la plataforma.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">10. Menores de edad</h2>
          <p className="mt-2 text-muted-foreground">
            La plataforma no está dirigida a menores de edad. No recopilamos intencionalmente datos de menores.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">11. Cambios a esta política</h2>
          <p className="mt-2 text-muted-foreground">
            Podemos actualizar esta política. Publicaremos la versión vigente en esta página. El uso continuado implica aceptación de los cambios.
          </p>
        </section>
      </article>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">Volver al inicio</Link> · <Link to="/terminos" className="hover:underline">Términos y Condiciones</Link> · <Link to="/auth" className="hover:underline">Iniciar sesión / Registrarse</Link>
      </p>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos y Condiciones | Gestor de Prestamos" },
      { name: "description", content: "Términos y Condiciones del servicio Gestor de Prestamos." },
    ],
  }),
  component: Terminos,
});

function Terminos() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-2.5">
          <ScrollText className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Términos y Condiciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestor de Prestamos · gestordprestamo@gmail.com · Última actualización: 09/10/2026
          </p>
        </div>
      </header>

      <article className="surface space-y-6 p-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-base font-semibold">1. Aceptación</h2>
          <p className="mt-2 text-muted-foreground">
            Al crear una cuenta o usar Gestor de Prestamos, usted declara haber leído y aceptado estos
            Términos y Condiciones y nuestra Política de Privacidad. Si no está de acuerdo, no debe usar
            la plataforma.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">2. Naturaleza del servicio</h2>
          <p className="mt-2 text-muted-foreground">
            Gestor de Prestamos es un software de administración de préstamos: registra clientes,
            calcula cronogramas de cuotas, mora y pagos, y genera reportes. <strong>
            No otorgamos préstamos ni intervenimos en las operaciones entre usted y sus clientes</strong>.
            La relación crediticia, su legalidad y su cobranza son responsabilidad exclusiva del usuario.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">3. Cuenta y credenciales</h2>
          <p className="mt-2 text-muted-foreground">
            Para registrarse necesita un correo válido y debe confirmar su dirección de correo. Usted es
            responsable de la seguridad de sus credenciales y de toda actividad realizada bajo su cuenta.
            Debe proveer información real; el uso de identidad falsa o datos ajenos causa terminación
            inmediata. Puede activar la verificación en dos pasos (MFA) de forma voluntaria.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">4. Suscripción y pagos</h2>
          <p className="mt-2 text-muted-foreground">
            Toda cuenta nueva incluye una <strong>prueba gratuita de 14 días</strong> con acceso completo.
              Tras la prueba, la continuidad requiere una suscripción de pago mensual en pesos dominicanos, según los planes publicados en la página de planes. El pago se realiza por los medios
            que indique el administrador (transferencia, depósito o efectivo); la suscripción queda
            activa al confirmarse el pago. No se generan cargos automáticos con tarjeta.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">5. Uso del servicio al vencer la suscripción</h2>
          <p className="mt-2 text-muted-foreground">
            Si su suscripción vence o se suspende, la plataforma entra en <strong>modo lectura</strong>:
            puede consultar su cartera, cobrar cuotas registradas y exportar sus datos, pero no podrá
            crear préstamos ni clientes nuevos. Sus datos se conservan y recuperan el acceso completo al
            renovar.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">6. Conductas prohibidas</h2>
          <p className="mt-2 text-muted-foreground">
            Está prohibido: usar la plataforma para actividades ilegales o de cobrança abusiva o de
            acoso; registrar datos de personas sin su consentimiento; suplantar identidades; revender o
            distribuir la plataforma sin autorización; interferir con su funcionamiento, seguridad o
            límites de planes; y alojar contenido que infrinja derechos de terceros.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">7. Sus datos</h2>
          <p className="mt-2 text-muted-foreground">
            Los datos que registra (clientes, préstamos, pagos y documentos) son de su propiedad. Usted
            garantiza contar con base legal y consentimiento para tratar los datos personales de sus
            clientes conforme a la Ley 172-13. Puede exportar su información desde Ajustes y solicitar
            la eliminación de su cuenta escribiendo a gestordprestamo@gmail.com; tras la eliminación,
            se borrará su información de forma definitiva, salvo residuos legales.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">8. Disponibilidad y soporte</h2>
          <p className="mt-2 text-muted-foreground">
            Ofrecemos el servicio "tal cual", con mantenimiento de respaldo periódico y soporte por
            correo o ticket. No garantizamos disponibilidad ininterrumpida; incidencias programadas se
            comunicarán cuando sea posible. Le recomendamos exportar sus datos periódicamente.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">9. Limitación de responsabilidad</h2>
          <p className="mt-2 text-muted-foreground">
            Los cálculos de cuotas, mora e intereses son de referencia; usted es responsable de revisar
            y validar sus decisiones financieras. No respondemos por pérdidas derivadas del uso de la
            información registrada por usted ni por interrupciones ajenas a nuestro control. La
            responsabilidad máxima del proveedor se limita al monto de la suscripción pagada en los
            tres (3) meses anteriores al reclamo.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">10. Terminación</h2>
          <p className="mt-2 text-muted-foreground">
            Puede cerrar su cuenta en cualquier momento escribiendo a gestordprestamo@gmail.com. El
            administrador puede suspender o bloquear cuentas que incumplan estos términos o no renueven
            la suscripción, con aviso cuando sea posible y sin derecho a reembolso de periodos ya gozados.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">11. Ley aplicable y cambios</h2>
          <p className="mt-2 text-muted-foreground">
            Estos términos se rigen por las leyes de la República Dominicana. Podemos actualizarlos; la
            versión vigente se publica en esta página y cambios sustanciales se comunicarán por correo.
            El uso continuado tras la publicación implica aceptación.
          </p>
        </section>
      </article>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">Volver al inicio</Link> ·{" "}
        <Link to="/privacidad" className="hover:underline">Política de Privacidad</Link> ·{" "}
        <Link to="/pricing" className="hover:underline">Ver planes</Link> ·{" "}
        <Link to="/auth" className="hover:underline">Iniciar sesión / Registrarse</Link>
      </p>
    </main>
  );
}

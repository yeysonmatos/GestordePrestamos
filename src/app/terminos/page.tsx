import LegalPage, { type LegalSection } from '@/components/legal/LegalPage'

const sections: LegalSection[] = [
  {
    title: '1. Aceptación',
    paragraphs: [
      'Estos Términos y Condiciones regulan el uso de Gestor de Prestamos (la "Aplicación"). Al crear una cuenta o usar la Aplicación aceptas estos términos y nuestra Política de Privacidad. Si no estás de acuerdo, no uses la Aplicación.',
      'Debes ser mayor de 18 años y tener capacidad legal para contratar.',
    ],
  },
  {
    title: '2. Qué es la Aplicación',
    paragraphs: [
      'Gestor de Prestamos es una herramienta para registrar y dar seguimiento a préstamos, clientes, cuotas, cobros, documentos y reportes. La Aplicación no presta dinero, no intermedia operaciones financieras, no cobra a tus clientes ni ofrece asesoría legal, financiera o fiscal.',
      'Los cálculos de cuotas, intereses y mora se basan en los datos y parámetros que tú configuras. Debes revisarlos antes de usarlos frente a tus clientes.',
    ],
  },
  {
    title: '3. Tu cuenta',
    list: [
      'Proporcionar información veraz al registrarte y mantenerla actualizada.',
      'Mantener la confidencialidad de tu contraseña. Recomendamos activar la verificación en dos pasos.',
      'Avisarnos de inmediato si detectas un uso no autorizado de tu cuenta.',
      'Una cuenta es para una persona o negocio; no se permite crear cuentas en serie para obtener períodos de prueba adicionales.',
    ],
    paragraphs: ['Al usar la Aplicación te comprometes a:'],
  },
  {
    title: '4. Planes, prueba y pagos',
    paragraphs: [
      'Las cuentas nuevas reciben un período de prueba gratuito de catorce (14) días. Al terminar, para seguir registrando información debes contratar un plan de pago. Los precios están publicados en la página de planes y se expresan en pesos dominicanos (RD$).',
      'Los pagos de suscripción se registran y confirman manualmente. El plan se activa o renueva cuando el pago es confirmado.',
      'Si tu plan vence o se cancela, la cuenta pasa a modo lectura: puedes consultar y exportar tu información, pero no registrar nuevos clientes, préstamos ni cobros hasta renovar.',
      'Los pagos realizados no son reembolsables, salvo que la ley disponga lo contrario o que hayamos cobrado por error.',
    ],
  },
  {
    title: '5. Tu responsabilidad como prestamista',
    paragraphs: [
      'Eres el único responsable de las operaciones de préstamo que registras y de la relación con tus clientes, incluyendo:',
    ],
    list: [
      'Cumplir las leyes de la República Dominicana aplicables a tu actividad, incluidas las relativas a tasas de interés, cobro y protección al consumidor.',
      'Obtener el consentimiento de tus clientes para registrar y tratar sus datos personales, conforme a la Ley núm. 172-13.',
      'La exactitud de los montos, tasas, fechas y pagos que registras.',
      'Las condiciones que pactas con tus clientes, sean o no las que genera la Aplicación.',
    ],
  },
  {
    title: '6. Uso prohibido',
    paragraphs: ['No está permitido usar la Aplicación para:'],
    list: [
      'Actividades ilegales, fraudulentas o de cobro abusivo, amenazas o acoso a terceros.',
      'Registrar datos de personas sin una base legítima para ello.',
      'Intentar acceder a cuentas o datos de otros usuarios, eludir los límites del plan o las medidas de seguridad, o interferir con el funcionamiento del servicio.',
      'Revender o redistribuir la Aplicación sin nuestra autorización.',
    ],
    paragraphsAfter: [
      'Podemos suspender o cerrar una cuenta que incumpla estos términos.',
    ],
  },
  {
    title: '7. Tus datos y respaldos',
    paragraphs: [
      'La información que registras te pertenece. Puedes exportarla en cualquier momento desde Configuración.',
      'Realizamos respaldos automáticos diarios que se conservan por un tiempo limitado. Estos respaldos son una medida de continuidad del servicio y no sustituyen tu propio registro de la información importante.',
      'El tratamiento de los datos personales se rige por nuestra Política de Privacidad.',
    ],
  },
  {
    title: '8. Disponibilidad del servicio',
    paragraphs: [
      'Trabajamos para que la Aplicación esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallas de proveedores o causas fuera de nuestro control. Podemos modificar, mejorar o retirar funciones de la Aplicación.',
    ],
  },
  {
    title: '9. Limitación de responsabilidad',
    paragraphs: [
      'La Aplicación se ofrece "tal cual". En la medida que permita la ley, no somos responsables por pérdidas derivadas de decisiones de préstamo o cobro, de errores en los datos que registras, de incumplimientos de tus clientes, ni de daños indirectos o lucro cesante.',
      'Nuestra responsabilidad total frente a ti se limita al monto que hayas pagado por la Aplicación en los tres (3) meses anteriores al hecho que la origine.',
    ],
  },
  {
    title: '10. Cancelación',
    paragraphs: [
      'Puedes dejar de usar la Aplicación y solicitar la eliminación de tu cuenta escribiéndonos a gestordprestamo@gmail.com. Antes de hacerlo te recomendamos exportar tu información.',
    ],
  },
  {
    title: '11. Cambios a estos términos',
    paragraphs: [
      'Podemos actualizar estos términos. Publicaremos la nueva versión en esta página con su fecha de actualización y, si el cambio es importante, te avisaremos dentro de la Aplicación o por correo. Seguir usando la Aplicación después del aviso implica que aceptas los términos actualizados.',
    ],
  },
  {
    title: '12. Ley aplicable y contacto',
    paragraphs: [
      'Estos términos se rigen por las leyes de la República Dominicana. Cualquier controversia se someterá a los tribunales competentes de la República Dominicana.',
      'Para cualquier consulta escríbenos a gestordprestamo@gmail.com.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Términos y Condiciones"
      updatedAt="25 de noviembre de 2026"
      intro="Estos términos explican las reglas de uso de Gestor de Prestamos: qué ofrece la Aplicación, cómo funcionan los planes y qué responsabilidades tienes como usuario."
      sections={sections}
      related={{ href: '/privacidad', label: 'Política de Privacidad' }}
    />
  )
}

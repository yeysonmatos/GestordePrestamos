import LegalPage, { type LegalSection } from '@/components/legal/LegalPage'

const sections: LegalSection[] = [
  {
    title: '1. Responsable del tratamiento',
    paragraphs: [
      'El responsable del tratamiento de los datos personales recopilados a través de esta aplicación (la "Aplicación") es Gestor de Prestamos, con correo de contacto gestordprestamo@gmail.com.',
      'Para cualquier consulta, solicitud o ejercicio de derechos sobre tus datos personales puedes escribirnos a gestordprestamo@gmail.com. Atendemos todas las solicitudes en un plazo máximo de quince (15) días hábiles.',
    ],
  },
  {
    title: '2. Qué datos recopilamos',
    paragraphs: [
      'Al crear tu cuenta, recopilamos tu nombre, correo electrónico y contraseña (esta última almacenada de forma cifrada).',
      'Cuando usas la Aplicación, recopilamos los datos que tú mismo registras sobre tus clientes y operaciones de préstamos: nombre, apellidos, documento de identidad, teléfono, dirección, ubicación (GPS) y el historial de préstamos, pagos, cuotas y documentos relacionados.',
      'También recopilamos datos técnicos de uso de la aplicación, tales como la dirección IP, el tipo de navegador y las páginas visitadas, con fines de seguridad y mejora del servicio.',
    ],
  },
  {
    title: '3. Finalidad del tratamiento',
    paragraphs: [
      'Tus datos se utilizan exclusivamente para las siguientes finalidades:',
    ],
    list: [
      'Gestionar tu cuenta de usuario y tu suscripción a la Aplicación.',
      'Permitir el funcionamiento de la Aplicación: registro, control y seguimiento de tus préstamos, clientes, cobros, pagos, contratos y reportes.',
      'Brindarte soporte técnico y atender tus solicitudes.',
      'Cumplir con obligaciones legales aplicables.',
    ],
    paragraphsAfter: [
      'No utilizamos tus datos para fines distintos de los aquí descritos sin obtener tu consentimiento previo.',
    ],
  },
  {
    title: '4. Almacenamiento y conservación',
    paragraphs: [
      'Tus datos se almacenan en servidores seguros de terceros con los que contamos contratos de confidencialidad y medidas técnicas adecuadas.',
      'Conservamos tus datos personales únicamente durante el tiempo necesario para las finalidades descritas en esta política, o mientras mantengas una cuenta activa. Al eliminar tu cuenta, los datos se eliminan o anonimizan, salvo que la ley exija su conservación por un plazo mayor.',
    ],
  },
  {
    title: '5. Base legal y consentimiento',
    paragraphs: [
      'Tratamos tus datos personales con tu consentimiento, el cual otorgas al registrarte y al utilizar la Aplicación, y con base en la relación contractual del servicio que prestamos.',
      'Puedes retirar tu consentimiento en cualquier momento contactándonos a gestordprestamo@gmail.com. La retirada del consentimiento no afectará a la licitud del tratamiento previo.',
    ],
  },
  {
    title: '6. Comunicación y transferencia de datos',
    paragraphs: [
      'No vendemos, alquilamos ni cedemos tus datos personales a terceros.',
      'Podemos compartir tus datos únicamente con proveedores de servicios necesarios para el funcionamiento de la Aplicación (almacenamiento de datos, envío de correos electrónicos y procesamiento de pagos), siempre bajo acuerdos que garanticen la confidencialidad y la protección de tus datos.',
      'En caso de que la ley lo exija, podremos revelar tus datos a las autoridades competentes.',
    ],
  },
  {
    title: '7. Seguridad de los datos',
    paragraphs: [
      'Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos personales contra el acceso no autorizado, la alteración, la divulgación o la destrucción, conforme a lo dispuesto en la Ley núm. 172-13 de la República Dominicana.',
      'A pesar de nuestros esfuerzos, ningún sistema de transmisión o almacenamiento de datos es completamente seguro. Si tienes razón para creer que tu interacción con nosotros ya no es segura, te pedimos que nos lo comuniques de inmediato.',
    ],
  },
  {
    title: '8. Derechos de los titulares (Ley 172-13)',
    paragraphs: [
      'Conforme a la Ley núm. 172-13 sobre Protección de Datos Personales de la República Dominicana, tienes los siguientes derechos respecto de tus datos personales:',
    ],
    list: [
      'Acceso: solicitar una copia de los datos personales que tenemos sobre ti.',
      'Rectificación: solicitar la corrección de tus datos personales inexactos o incompletos.',
      'Cancelación: solicitar la eliminación de tus datos personales cuando ya no sean necesarios o se hayan tratado sin nuestra autorización.',
      'Oposición: solicitar que dejemos de tratar tus datos personales en determinadas circunstancias.',
    ],
    paragraphsAfter: [
      'Puedes ejercer estos derechos enviando una solicitud a gestordprestamo@gmail.com. Responderemos tu solicitud dentro de los plazos establecidos por la ley. También puedes presentar una reclamación ante la autoridad competente en materia de protección de datos.',
    ],
  },
  {
    title: '9. Datos de terceros',
    paragraphs: [
      'Los datos de tus clientes (nombres, documentos, teléfonos, direcciones y el historial de préstamos) son introducidos y controlados por ti como responsable de dicha información. Eres tú quien responde por la obtención del consentimiento de tus clientes para el tratamiento de sus datos personales y por el cumplimiento de la Ley 172-13 respecto de los mismos, y quien debe informarles del tratamiento que les das.',
      'Nosotros tratamos esos datos únicamente en nombre tuyo y con fines de prestar el servicio de la Aplicación, y no los usaremos para ningún otro fin.',
    ],
  },
  {
    title: '10. Datos de menores',
    paragraphs: [
      'La Aplicación está dirigida exclusivamente a personas mayores de 18 años. No recopilamos de forma intencional datos personales de menores de edad. Si tienes conocimiento de que un menor nos ha facilitado datos personales, contáctanos para proceder a su eliminación.',
    ],
  },
  {
    title: '11. Cambios a esta política',
    paragraphs: [
      'Podemos actualizar esta Política de Privacidad periódicamente. Toda modificación será publicada en esta página con la fecha de última actualización indicada al inicio.',
      'Si realizamos cambios sustanciales, te lo notificaremos a través de la Aplicación o por correo electrónico.',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Política de Privacidad"
      updatedAt="15 de agosto de 2026"
      intro="Esta Política de Privacidad describe cómo Gestor de Prestamos recopila, utiliza y protege los datos personales de los usuarios de la Aplicación, conforme a la Ley núm. 172-13 sobre Protección de Datos Personales de la República Dominicana y demás normativa aplicable."
      sections={sections}
      related={{ href: '/terminos', label: 'Términos y Condiciones' }}
    />
  )
}

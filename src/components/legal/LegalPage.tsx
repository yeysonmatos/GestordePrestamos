import Link from 'next/link'

export interface LegalSection {
  title: string
  paragraphs: string[]
  list?: string[]
  paragraphsAfter?: string[]
}

interface Props {
  title: string
  updatedAt: string
  intro: string
  sections: LegalSection[]
  /** Enlace al otro documento legal que se muestra al pie. */
  related: { href: string; label: string }
}

// Plantilla compartida de las páginas legales públicas (/privacidad, /terminos).
export default function LegalPage({ title, updatedAt, intro, sections, related }: Props) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-5 max-w-3xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/gp-icon.png" alt="GP" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-semibold text-foreground text-lg tracking-tight">Gestor de Prestamos</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Iniciar sesión
        </Link>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 sm:py-14">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">Última actualización: {updatedAt}</p>
          <p className="text-muted-foreground mt-4">{intro}</p>
        </div>

        <div className="space-y-8">
          {sections.map(section => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={`p${i}`} className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {p}
                </p>
              ))}
              {section.list && (
                <ul className="mt-2 space-y-2">
                  {section.list.map((item, i) => (
                    <li key={`l${i}`} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <svg className="h-4 w-4 text-primary shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.paragraphsAfter?.map((p, i) => (
                <p key={`pa${i}`} className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-12">
          <Link href={related.href} className="text-primary hover:underline font-medium">
            {related.label}
          </Link>{' '}
          ·{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Iniciar sesión
          </Link>{' '}
          ·{' '}
          <Link href="/pricing" className="text-primary hover:underline font-medium">
            Ver planes
          </Link>
        </p>
      </main>
    </div>
  )
}

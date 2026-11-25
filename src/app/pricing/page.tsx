import Link from 'next/link'
import { createServerSideClient } from '@/lib/supabase-server'
import Badge from '@/components/ui/Badge'

interface Plan {
  id: string
  name: string
  price: number
  description: string | null
  features: string[] | null
  billing_cycle: string
}

export default async function PricingPage() {
  const supabase = await createServerSideClient()

  const { data: { session } } = await supabase.auth.getSession()
  const signedIn = !!session?.user

  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price')

  const planList = (plans || []) as Plan[]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-5 max-w-6xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/gp-icon.png" alt="GP" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-semibold text-foreground text-lg tracking-tight">Gestor de Prestamos</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Iniciar sesión
        </Link>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Controla tus préstamos como un profesional
          </h1>
          <p className="text-muted-foreground mt-3">
            Cuotas fijas o solo interés, recordatorios, cobros, contratos y reportes — todo en tu bolsillo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planList.map(plan => {
            const isFree = Number(plan.price) === 0
            const isPopular = plan.name.toLowerCase().includes('pro')
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${isPopular ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default">Más popular</Badge>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                )}

                <div className="mt-4 mb-6">
                  <span className="text-3xl font-bold text-foreground">
                    {isFree ? 'Gratis' : `RD$${Number(plan.price).toLocaleString('en-US')}`}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">
                    / {plan.billing_cycle === 'yearly' ? 'año' : 'mes'}
                  </span>
                </div>

                <ul className="space-y-2.5 flex-1">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <svg className="h-4 w-4 text-success shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={signedIn ? '/account' : '/register'}
                  className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-11 ${isPopular
                    ? 'bg-primary text-on-primary hover:bg-primary-hover'
                    : 'bg-muted text-foreground hover:bg-border'
                  }`}
                >
                  {signedIn ? 'Ir a mi plan' : 'Registrarse gratis'}
                  <svg className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            )
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Inicia sesión
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Al registrarte aceptas nuestros{' '}
          <Link href="/terminos" className="text-primary hover:underline">
            Términos y Condiciones
          </Link>{' '}
          y la{' '}
          <Link href="/privacidad" className="text-primary hover:underline">
            Política de Privacidad
          </Link>
          {' '}(Ley 172-13, República Dominicana)
        </p>
      </main>
    </div>
  )
}

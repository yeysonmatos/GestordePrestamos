import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ORIGIN_SENTINEL = 'https://gp.invalid'

function safeNext(raw?: string | null): string {
  if (!raw) return '/dashboard'
  // Solo rutas locales del mismo origen: bloquea //evil.com, /\\evil.com y
  // cualquier URL absoluta (protocol-relative) que Supabase pudiera devolver.
  if (!raw.startsWith('/')) return '/dashboard'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard'
  try {
    const url = new URL(raw, ORIGIN_SENTINEL)
    if (url.origin !== ORIGIN_SENTINEL) return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const cookieNext = request.cookies.get('gp_oauth_next')?.value
  const next = safeNext(searchParams.get('next') ?? cookieNext)

  const redirect = NextResponse.redirect(new URL(`${origin}${next}`))
  redirect.cookies.set('gp_oauth_next', '', { path: '/', maxAge: 0 })

  let supabaseResponse = new NextResponse()

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) =>
        redirect.cookies.set(name, value, { ...options })
      )
      return redirect
    }
  }

  const errUrl = new URL(`${origin}/login`)
  // Reenvía el error real del proveedor OAuth (p. ej. canceló el acceso) para que
  // el login pueda mostrar un mensaje en español; sin ellos, mensaje genérico.
  errUrl.searchParams.set('error', searchParams.get('error') || 'Auth failed')
  const providerCode = searchParams.get('error_code')
  if (providerCode) errUrl.searchParams.set('error_code', providerCode)
  errUrl.searchParams.set('error_description', searchParams.get('error_description') || 'No se pudo completar la autenticación. Intenta de nuevo o solicita un nuevo enlace.')
  return NextResponse.redirect(errUrl)
}

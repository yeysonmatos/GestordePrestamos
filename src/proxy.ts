import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u
  } catch {
    // Cookie inválida o error de auth → tratar como no autenticado
  }

  const { pathname } = request.nextUrl
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isPublic = pathname === '/login' || pathname === '/register' || pathname === '/pricing' || pathname === '/privacidad' || pathname === '/terminos' || pathname === '/mfa-verify' || pathname.startsWith('/auth/') || pathname.startsWith('/_next/') || pathname.startsWith('/api/') || pathname === '/' || pathname === '/favicon.ico' || pathname.startsWith('/gp-icon.png') || pathname.startsWith('/gp-icon-opaque.png') || pathname.startsWith('/gp-icon-maskable.png') || pathname === '/apple-touch-icon.png' || pathname === '/manifest.json' || pathname === '/offline.html' || pathname === '/suspended'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Rutas protegidas: si la cuenta tiene MFA activa pero la sesión es aal1, obligar a verificar
  if (user && !isPublic && pathname !== '/mfa-verify') {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token)
        if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          const url = request.nextUrl.clone()
          url.pathname = '/mfa-verify'
          url.searchParams.set('next', pathname)
          return NextResponse.redirect(url)
        }
      }
    } catch {
      // Si no se puede determinar el nivel, dejarlo pasar (el login ya lo exige)
    }
  }

  // Rutas de administración: requieren rol admin
  if (user && isAdminRoute) {
    let isAdmin = false
    try {
      const { data } = await supabase.rpc('is_admin')
      isAdmin = data === true
    } catch {
      isAdmin = false
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  if (user && (pathname === '/login' || (!isAdminRoute && !isPublic))) {
    let isAdmin = false
    try {
      const { data } = await supabase.rpc('is_admin')
      isAdmin = data === true
    } catch {
      isAdmin = false
    }
    if (isAdmin && !isAdminRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
    if (!isAdmin && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Clientes: redirigir al onboarding si no lo han completado
  if (user && !isAdminRoute && !isPublic && pathname !== '/onboarding') {
    let onboardingCompleted = true
    try {
      const { data } = await supabase
        .from('settings')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()
      onboardingCompleted = data?.onboarding_completed !== false
    } catch {
      onboardingCompleted = true
    }
    if (!onboardingCompleted) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  // Clientes: bloquear si el admin lo bloqueó o la suscripción está vencida/cancelada
  if (user && !isAdminRoute && !isPublic && pathname !== '/suspended') {
    let blocked = false
    try {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()
      blocked = appUser?.status === 'blocked'
    } catch {
      blocked = false
    }

    let expired = false
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, ends_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sub) {
        const ended = sub.ends_at ? new Date(sub.ends_at).getTime() < Date.now() : false
        expired = sub.status === 'expired' || sub.status === 'cancelled' || ended
      }
    } catch {
      expired = false
    }

    // Solo un usuario bloqueado por el admin queda sin acceso (/suspended).
    // Una suscripción vencida (de cualquier plan) NO bloquea: el usuario entra
    // en modo lectura y la UI muestra el banner para elegir/renovar plan.
    if (blocked) {
      const url = request.nextUrl.clone()
      url.pathname = '/suspended'
      return NextResponse.redirect(url)
    }

    // Modo lectura para suscripción vencida: bloquear rutas de escritura
    // redirigiendo a su listado/detalle de solo lectura.
    if (expired) {
      const writeRedirect: Record<string, string> = {
        '/loans/new': '/loans',
        '/clients/new': '/clients',
      }
      if (writeRedirect[pathname]) {
        const url = request.nextUrl.clone()
        url.pathname = writeRedirect[pathname]
        return NextResponse.redirect(url)
      }
      const editMatch = pathname.match(/^\/(loans|clients)\/([^/]+)\/edit$/)
      if (editMatch) {
        const url = request.nextUrl.clone()
        url.pathname = `/${editMatch[1]}/${editMatch[2]}`
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|gp-icon.png|gp-icon-opaque.png|gp-icon-maskable.png|apple-touch-icon.png|manifest.json|offline.html).*)',
  ],
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase-client'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import GoogleButton, { AuthDivider } from '@/components/auth/GoogleButton'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Cancelaste el acceso. Intenta de nuevo si quieres entrar con Google.',
  oauth_provider_denied: 'Cancelaste el acceso con Google.',
  user_already_exists: 'Ya tienes una cuenta con este correo. Ingresa con tu contraseña.',
  email_exists: 'Ya tienes una cuenta con este correo. Ingresa con tu contraseña.',
  email_conflict: 'Ya tienes una cuenta con este correo. Ingresa con tu contraseña.',
  provider_not_enabled: 'El acceso con Google aún no está habilitado. Usa tu correo y contraseña.',
  oauth_provider_error: 'Google no pudo completar el acceso. Intenta de nuevo.',
  bad_oauth_callback: 'No se pudo completar el acceso con Google. Intenta de nuevo.',
  bad_oauth_state: 'La sesión de acceso venció. Intenta de nuevo.',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [message, setMessage] = useState('')
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [nextPath, setNextPath] = useState('/dashboard')
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    const code = params.get('error_code')
    const desc = params.get('error_description')
    setNextPath(params.get('next') || '/dashboard')
    if (err || code) {
      setError(
        OAUTH_ERROR_MESSAGES[code || ''] ||
          OAUTH_ERROR_MESSAGES[err || ''] ||
          desc ||
          err ||
          'No se pudo completar la autenticación.'
      )
    }
  }, [])

  function handleMode(next: 'login' | 'reset') {
    setMode(next)
    setError('')
    setMessage('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else {
        // Verificar AAL: si la cuenta tiene MFA activa, pedir el código antes de redirigir
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        const needsMfa = aal?.nextLevel === 'aal2'
        if (needsMfa) {
          setMfaStep(true)
          setMfaCode('')
          setLoading(false)
          return
        }
        window.location.href = '/dashboard'
      }
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) setError(error.message)
      else setMessage('Revisa tu correo para restablecer tu contraseña.')
    }

    setLoading(false)
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mfaCode.trim().length < 6) {
      setError('Ingresa el código de 6 dígitos de tu autenticador.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactor = (factorsData?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified')
      if (!totpFactor) throw new Error('No hay un autenticador verificado en esta cuenta.')

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totpFactor.id,
        code: mfaCode.trim(),
      })
      if (verifyError) throw new Error(verifyError.message)

      window.location.href = '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El código no es válido o expiró.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/gp-icon.png" alt="GP" className="w-16 h-16 rounded-xl mx-auto object-cover" />
          <h1 className="text-2xl font-bold text-foreground mt-3">Gestor de Prestamos</h1>
          <p className="text-muted-foreground mt-1">Controla tus préstamos personales</p>
        </div>

        <form onSubmit={mfaStep ? handleMfaSubmit : handleSubmit} className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {mfaStep ? 'Verificación en dos pasos' : mode === 'login' ? 'Iniciar sesión' : 'Restablecer contraseña'}
          </h2>

          {error && <Alert variant="danger">{error}</Alert>}
          {message && <Alert variant="success">{message}</Alert>}

          {mfaStep ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tu cuenta está protegida con doble verificación. Ingresa el código de 6 dígitos de tu app de
                autenticación (Google Authenticator, Authy, etc.).
              </p>
              <Input
                label="Código de autenticación"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
              />
              <Button type="submit" loading={loading} className="w-full">
                Verificar e iniciar sesión
              </Button>
              <button
                type="button"
                onClick={() => { setMfaStep(false); setError('') }}
                className="text-sm text-muted-foreground hover:underline self-center"
              >
                Volver e iniciar sesión de nuevo
              </button>
            </>
          ) : (
<>
              <Input label="Correo electrónico" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" />

          {mode !== 'reset' && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full min-w-0 rounded-lg border px-3 py-2 pr-10 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11 border-border"
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <button type="button" onClick={() => handleMode('reset')} className="text-sm text-primary hover:underline self-start">
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {mode === 'login' ? 'Entrar' : 'Enviar enlace'}
          </Button>

              {mode === 'login' && (
                <div className="space-y-3 pt-1">
                  <AuthDivider />
                  <GoogleButton nextPath={nextPath} onError={setError} />
                </div>
              )}
            </>
          )}
          </form>

          {!mfaStep && (
            <p className="text-sm text-center text-muted-foreground">
              {mode === 'login' ? (
                <>
                  ¿No tienes cuenta?{' '}
                  <Link href="/register" className="text-primary hover:underline">
                    Regístrate
                  </Link>{' '}
                  ·{' '}
                  <Link href="/pricing" className="text-primary hover:underline">
                    Ver planes
                  </Link>
                </>
              ) : (
                <button type="button" onClick={() => handleMode('login')} className="text-primary hover:underline">
                  Volver a inicio de sesión
                </button>
              )}
            </p>
          )}

        <p className="text-center text-xs text-muted-foreground">
          Al continuar aceptas nuestra{' '}
          <Link href="/privacidad" className="text-primary hover:underline">
            Política de Privacidad
          </Link>
        </p>
      </div>
    </div>
  )
}
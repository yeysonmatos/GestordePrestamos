import { useState, useCallback, useEffect } from 'react'
import { ShieldCheck, QrCode, Copy, Trash2, KeyRound } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PendingFactor {
  factorId: string
  qr_code: string
  secret: string
  uri: string
}

interface EnrolledFactor {
  id: string
  friendly_name?: string
  factor_type: string
  status: string
  created_at?: string
}

export default function MfaSetup() {
  const [enrolled, setEnrolled] = useState<EnrolledFactor[]>([])
  const [pending, setPending] = useState<PendingFactor | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copiedSecret, setCopiedSecret] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors()
      if (mfaError) throw new Error(mfaError.message)
      setEnrolled((data?.totp || []).filter(f => f.status === 'verified'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar tus factores')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function startEnroll() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // Factores no verificados de intentos previos: se descartan antes de reinscribir
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const stale = (factorsData?.totp || []).filter(f => f.status !== 'verified')
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Autenticador',
      })
      if (enrollError) throw new Error(enrollError.message)
      if (!data) return
      setPending({
        factorId: data.id,
        qr_code: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      })
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar la inscripción')
    }
    setBusy(false)
  }

  async function verifyEnroll(e: React.FormEvent) {
    e.preventDefault()
    if (!pending || code.trim().length < 6) {
      setError('Ingresa el código de 6 dígitos de tu autenticador.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pending.factorId,
        code: code.trim(),
      })
      if (verifyError) throw new Error(verifyError.message)
      setMessage('¡Autenticador vinculado con éxito! A partir de ahora se te pedirá el código al iniciar sesión.')
      setPending(null)
      setCode('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El código no es válido o expiró.')
    }
    setBusy(false)
  }

  async function unenroll(factorId: string) {
    if (!confirm('¿Seguro que deseas desactivar la doble verificación de tu cuenta?')) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
      if (unenrollError) throw new Error(unenrollError.message)
      setMessage('Doble verificación desactivada.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desactivar.')
    }
    setBusy(false)
  }

  async function copySecret() {
    if (!pending) return
    try {
      await navigator.clipboard.writeText(pending.secret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } catch {
      // Sin portapapeles: no es bloqueante
    }
  }

  if (loading) return <div className="text-center py-8 text-sm text-muted-foreground">Cargando...</div>

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Doble verificación (MFA)
        </h3>
        {enrolled.length > 0 ? (
          <Badge variant="default">Activa</Badge>
        ) : (
          <Badge variant="outline">Inactiva</Badge>
        )}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

      {enrolled.length > 0 ? (
        <div className="space-y-3">
          {enrolled.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{f.friendly_name || 'Autenticador'}</p>
                  <p className="text-xs text-muted-foreground truncate">Vinculado y verificado</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => unenroll(f.id)} disabled={busy}>
                <Trash2 className="h-4 w-4 mr-1" /> Desactivar
              </Button>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Al iniciar sesión se te pedirá el código de 6 dígitos de tu app de autenticación además de tu contraseña.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground">
            Protege tu cuenta con una app de autenticación (Google Authenticator, Authy, 1Password...). Al activarla,
            el acceso requerirá tu contraseña <strong>y</strong> un código temporal.
          </p>

          {!pending ? (
            <Button onClick={startEnroll} disabled={busy} className="mt-4">
              <KeyRound className="h-4 w-4 mr-1" /> Activar doble verificación
            </Button>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-52 h-52 rounded-xl border border-border bg-white p-2">
                    <img
                      src={pending.qr_code}
                      alt="Código QR para vincular tu autenticador"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Escanea con tu app de autenticación
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">O ingresa la clave manualmente</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono break-all select-all min-w-0">
                        {pending.secret}
                      </code>
                      <Button variant="secondary" size="sm" onClick={copySecret}>
                        <Copy className="h-4 w-4 mr-1" /> {copiedSecret ? '¡Copiado!' : 'Copiar'}
                      </Button>
                    </div>
                    <label className="block text-xs text-muted-foreground mt-1">
                      Aplicación: <span className="font-medium">{new URL(pending.uri).host}</span>
                    </label>
                  </div>

                  <form onSubmit={verifyEnroll} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="mfa-code">Código de 6 dígitos</Label>
                      <Input
                        id="mfa-code"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={busy}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={busy}>
                        <QrCode className="h-4 w-4 mr-1" /> Verificar y activar
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'
import { smtpGet, smtpSave, smtpTest } from '@/lib/admin-fns'

interface SmtpForm {
  host: string
  port: number
  secure: boolean
  username: string
  pass: string
  from_name: string
  from_email: string
  enabled: boolean
}

const EMPTY: SmtpForm = { host: '', port: 587, secure: false, username: '', pass: '', from_name: 'Gestor de Prestamos', from_email: '', enabled: false }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export default function AdminSmtpConfig() {
  const [form, setForm] = useState<SmtpForm>(EMPTY)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    smtpGet()
      .then((d) => {
        const cfg = d.config
        if (cfg) {
          setForm({
            host: cfg.host || '',
            port: cfg.port || 587,
            secure: !!cfg.secure,
            username: cfg.username || '',
            pass: '',
            from_name: cfg.from_name || 'Gestor de Prestamos',
            from_email: cfg.from_email || '',
            enabled: !!cfg.enabled,
          })
          setConfigured(!!cfg.configured)
        }
      })
      .catch(() => setError('Error al cargar la configuración'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof SmtpForm, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await smtpSave({
        data: {
          host: form.host,
          port: form.port,
          secure: form.secure,
          username: form.username,
          pass: form.pass,
          from_name: form.from_name,
          from_email: form.from_email,
          enabled: form.enabled,
        },
      })
      setConfigured(true)
      setMessage('Configuración SMTP guardada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      const d = await smtpTest({ data: { to: form.from_email } })
      if (!d.ok) {
        setError(d.error || 'El envío de prueba falló')
        return
      }
      setMessage('Correo de prueba enviado. Revisa tu bandeja.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setTesting(false)
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-4">
      {!configured && <Alert><AlertDescription>SMTP no configurado aún. Los correos no se envían hasta completar este formulario.</AlertDescription></Alert>}
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <form onSubmit={handleSave} className="space-y-6 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Servidor de correo saliente</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ej. Gmail: <code>smtp.gmail.com</code> · puerto 587. Usa una contraseña de aplicación si tienes 2FA.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Servidor SMTP (host)">
              <Input value={form.host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('host', e.target.value)} placeholder="smtp.gmail.com" required />
            </Field>
            <Field label="Puerto">
              <Input type="number" value={String(form.port)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('port', Number(e.target.value))} required />
            </Field>
            <Field label="Usuario">
              <Input value={form.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('username', e.target.value)} placeholder="tu-correo@dominio.com" required />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                value={form.pass}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('pass', e.target.value)}
                placeholder={configured ? '•••••••• (dejar en blanco para no cambiar)' : 'Contraseña o app password'}
                required={!configured}
              />
            </Field>
            <Field label="Nombre del remitente">
              <Input value={form.from_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('from_name', e.target.value)} />
            </Field>
            <Field label="Correo del remitente">
              <Input type="email" value={form.from_email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('from_email', e.target.value)} placeholder="no-reply@dominio.com" required />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.secure} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('secure', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Conexión segura (SSL — común en puerto 465)
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('enabled', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Habilitar envío de correos
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleTest} disabled={testing || !configured}>
              Enviar correo de prueba
            </Button>
            <Button type="submit" disabled={saving}>Guardar configuración</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/finance'
import { AlarmClock, Mailbox, Send } from 'lucide-react'
import { remindersList, remindersSend } from '@/lib/admin-fns'

interface Reminder {
  id: string
  user_id: string
  user_name: string
  plan_id: string
  plan_name: string
  status: string
  ends_at: string
  days_left: number
}

export default function AdminReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = (await remindersList()) as { reminders?: Reminder[]; error?: string }
      setReminders(d.reminders || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === reminders.length ? new Set() : new Set(reminders.map(r => r.id)))
  }

  async function sendReminders() {
    setSending(true)
    setError('')
    try {
      const ids = selected.size ? Array.from(selected) : []
      const d = (await remindersSend({ data: { subscription_ids: ids } })) as { sent?: number; failed?: number; error?: string }
      setMessage(`Avisos enviados: ${d.sent}, fallaron: ${d.failed}`)
      setSelected(new Set())
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <AlarmClock className="h-4 w-4" />
          {reminders.length} suscripción(es) por vencer o vencida(s)
        </div>
        <Button onClick={sendReminders} disabled={sending}>
          <Send className="h-4 w-4 mr-1" /> Enviar avisos ({selected.size || 'todos'})
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando recordatorios...</div>
      ) : reminders.length === 0 ? (
        <Card className="text-center py-12">
          <Mailbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay suscripciones por vencer.</p>
        </Card>
      ) : (
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium w-8">
                  <input type="checkbox" checked={selected.size === reminders.length && reminders.length > 0} onChange={toggleAll} className="h-4 w-4" />
                </th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Días restantes</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map(r => {
                const expired = r.days_left <= 0
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/admin/users/$id" params={{ id: r.user_id }} className="font-medium text-foreground hover:text-primary transition-colors">
                        {r.user_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{r.plan_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={expired ? 'destructive' : r.status === 'trial' ? 'secondary' : 'default'}>
                        {expired ? 'Vencida' : r.status === 'trial' ? 'Prueba' : 'Activa'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.ends_at ? formatDate(r.ends_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={expired ? 'text-destructive font-medium' : 'text-foreground'}>{expired ? 'Vencida' : `${r.days_left} día${r.days_left === 1 ? '' : 's'}`}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}


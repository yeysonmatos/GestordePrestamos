import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/finance'
import { Mail, Play, RotateCw, Search, Trash2 } from 'lucide-react'
import { emailsList, emailsRetry, emailsDelete } from '@/lib/admin-fns'
import { flushEmailQueue } from '@/lib/admin'

interface EmailMessage {
  id: string
  recipient_type: 'admin' | 'prestamista'
  recipient_name?: string | null
  recipient_email: string
  template_key: string
  subject: string
  html_body: string
  status: 'queued' | 'sending' | 'sent' | 'failed'
  attempts: number
  max_attempts: number
  last_error?: string | null
  event_type: string
  entity_type?: string | null
  entity_id?: string | null
  created_at: string
  sent_at?: string | null
}

const STATUS_UI: Record<EmailMessage['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  queued: { variant: 'secondary', label: 'En cola' },
  sending: { variant: 'secondary', label: 'Enviando' },
  sent: { variant: 'default', label: 'Enviado' },
  failed: { variant: 'destructive', label: 'Fallido' },
}

export default function AdminEmails() {
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<EmailMessage | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [flushing, setFlushing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = (await emailsList({ data: { status, q } })) as { messages?: EmailMessage[]; error?: string }
      setMessages(d.messages || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [status, q])

  useEffect(() => { load() }, [load])

  function flashMsg(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleRetry() {
    setRetrying(true)
    setError('')
    try {
      const d = (await emailsRetry({ data: {} })) as { requeued?: number; error?: string }
      flashMsg(`${d.requeued} correos fallidos reenviados a la cola`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setRetrying(false)
  }

  async function handleFlush() {
    setFlushing(true)
    setError('')
    try {
      const r = await flushEmailQueue()
      if (r.done === 0) flashMsg('No hay correos pendientes en la cola')
      else flashMsg(`Cola procesada: ${r.sent} enviados, ${r.failed} fallidos (de ${r.done})`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setFlushing(false)
  }

  async function handleDeleteByIds(ids: string[]) {
    if (ids.length === 0) return
    if (!confirm(ids.length === 1 ? '¿Eliminar este correo?' : `¿Eliminar ${ids.length} correos?`)) return
    setDeleting(true)
    setError('')
    try {
      const d = (await emailsDelete({ data: { ids } })) as { deleted?: number; error?: string }
      flashMsg(`${d.deleted} correo(s) eliminado(s)`)
      setPreview(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeleting(false)
  }

  async function handleDeleteByStatus(status: string, label: string) {
    if (!confirm(`¿Eliminar todos los correos en estado "${label}"?`)) return
    setDeleting(true)
    setError('')
    try {
      const d = (await emailsDelete({ data: { status } })) as { deleted?: number; error?: string }
      flashMsg(`${d.deleted} correo(s) eliminado(s)`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeleting(false)
  }

  const queuedCount = messages.filter(m => m.status === 'queued').length
  const failedCount = messages.filter(m => m.status === 'failed').length

  return (
    <div className="space-y-4">
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              placeholder="Buscar por correo, nombre o asunto..."
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
            />
          </div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {['', 'queued', 'sent', 'failed'].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`px-3 py-2 text-xs font-medium min-h-11 ${status === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground bg-card'}`}
              >
                {s === '' ? 'Todos' : s === 'queued' ? 'En cola' : s === 'sent' ? 'Enviados' : 'Fallidos'}
              </button>
            ))}
          </div>
          <Button variant="accent" onClick={handleFlush} disabled={flushing}>
            <Play className="h-4 w-4 mr-1" /> Procesar cola
          </Button>
          <Button variant="secondary" onClick={handleRetry} disabled={retrying || failedCount === 0}>
            <RotateCw className="h-4 w-4 mr-1" /> Reenviar fallidos ({failedCount})
          </Button>
          <Button variant="destructive" onClick={() => handleDeleteByStatus('queued', 'en cola')} disabled={deleting || queuedCount === 0}>
            <Trash2 className="h-4 w-4 mr-1" /> Vaciar en cola ({queuedCount})
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando correos...</div>
      ) : messages.length === 0 ? (
        <Card className="text-center py-12">
          <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay correos registrados todavía.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {messages.map(m => {
            const st = STATUS_UI[m.status]
            return (
              <button
                key={m.id}
                onClick={() => setPreview(m)}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Para {m.recipient_name || m.recipient_email} · {formatDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.attempts > 0 && m.status !== 'sent' && (
                      <span className="text-[10px] text-muted-foreground">Intento {m.attempts}/{m.max_attempts}</span>
                    )}
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                </div>
                {m.status === 'failed' && m.last_error && (
                  <p className="text-xs text-destructive mt-1 truncate">{m.last_error}</p>
                )}
              </button>
            )
          })}
        </Card>
      )}

      <Dialog open={!!preview} onOpenChange={(o: boolean) => { if (!o) setPreview(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject || 'Correo'}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={STATUS_UI[preview.status].variant}>{STATUS_UI[preview.status].label}</Badge>
                <span className="text-xs text-muted-foreground">
                  Para {preview.recipient_name || preview.recipient_email} · {formatDate(preview.created_at)}
                </span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <iframe title="preview" srcDoc={preview.html_body} className="w-full h-[420px] bg-white" />
              </div>
              <p className="text-xs text-muted-foreground">
                Evento: {preview.event_type} · Plantilla: {preview.template_key}
              </p>
              <div className="pt-2 border-t border-border flex justify-end">
                <Button variant="destructive" size="sm" onClick={() => handleDeleteByIds([preview.id])} disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar correo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


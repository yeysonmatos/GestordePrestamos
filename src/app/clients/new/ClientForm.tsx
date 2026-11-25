'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase-client'
import { logAuditEvent } from '@/lib/audit'
import type { Client } from '@/types'
import { normalizeDocument } from '@/lib/utils'

interface Props {
  initialData?: Client
  isEditing?: boolean
  clientId?: string
}

const emptyForm = {
  first_name: '', last_name: '', nickname: '', sex: '', document_type: 'cedula',
  document: '', phone: '', whatsapp: '', phone_alt: '', email: '',
  provincia: '', municipio: '', sector: '', calle: '', numero: '', referencia: '',
}

export default function ClientForm({ initialData, isEditing = false, clientId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState(() =>
    isEditing && initialData
      ? {
          first_name: initialData.first_name || '',
          last_name: initialData.last_name || '',
          nickname: initialData.nickname || '',
          sex: initialData.sex || '',
          document_type: initialData.document_type || 'cedula',
          document: initialData.document || '',
          phone: initialData.phone || '',
          whatsapp: initialData.whatsapp || '',
          phone_alt: initialData.phone_alt || '',
          email: initialData.email || '',
          provincia: initialData.provincia || '',
          municipio: initialData.municipio || '',
          sector: initialData.sector || '',
          calle: initialData.calle || '',
          numero: initialData.numero || '',
          referencia: initialData.referencia || '',
        }
      : { ...emptyForm }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [planLimit, setPlanLimit] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('subscriptions')
          .select('plan:plans(max_clients, price)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!active) return
        const plan = Array.isArray(data?.plan) ? data!.plan[0] : data?.plan
        const price = Number((plan as { price?: number } | undefined)?.price || 0)
        setPlanLimit(price > 0 ? Number((plan as { max_clients?: number } | undefined)?.max_clients || 0) || null : null)
      } catch {
        // Sin plan detectable → sin límite
      }
    })()
    return () => { active = false }
  }, [supabase])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Debes iniciar sesión')
      setLoading(false)
      return
    }

    const fullName = `${form.first_name} ${form.last_name}`.trim()
    const payload = {
      name: fullName,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      nickname: form.nickname || null,
      sex: form.sex || null,
      document_type: form.document_type || null,
      document: normalizeDocument(form.document),
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      phone_alt: form.phone_alt || null,
      email: form.email || null,
      provincia: form.provincia || null,
      municipio: form.municipio || null,
      sector: form.sector || null,
      calle: form.calle || null,
      numero: form.numero || null,
      referencia: form.referencia || null,
    }

    if (isEditing && clientId) {
      const { data, error: updateError } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', clientId)
        .select()
        .single()
      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }
      if (data) {
        logAuditEvent(supabase, { userId: user.id, action: 'client.updated', entityType: 'client', entityId: data.id, details: { name: data.name } })
      }
      router.push(`/clients/${clientId}`)
      router.refresh()
      setLoading(false)
      return
    }

    if (planLimit !== null) {
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if ((count ?? 0) >= planLimit) {
        setError(`Has alcanzado el límite de ${planLimit} clientes de tu plan. Mejora tu plan para añadir más.`)
        setLoading(false)
        return
      }
    }

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert({ ...payload, user_id: user.id, status: 'inactive' })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }
    if (!data) {
      setError('No se recibieron datos del servidor')
      setLoading(false)
      return
    }
    logAuditEvent(supabase, { userId: user.id, action: 'client.created', entityType: 'client', entityId: data.id, details: { name: data.name } })
    router.push(`/clients/${data.id}`)
    router.refresh()
    setLoading(false)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Información Personal</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombres *" value={form.first_name} onChange={e => update('first_name', e.target.value)} required />
            <Input label="Apellidos *" value={form.last_name} onChange={e => update('last_name', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="Apodo" value={form.nickname} onChange={e => update('nickname', e.target.value)} placeholder="Opcional" />
            <Select label="Sexo" value={form.sex} onChange={e => update('sex', e.target.value)}
              options={[{ value: '', label: 'Seleccionar...' }, { value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Select label="Tipo documento" value={form.document_type} onChange={e => update('document_type', e.target.value)}
              options={[{ value: 'cedula', label: 'Cédula' }, { value: 'pasaporte', label: 'Pasaporte' }, { value: 'otro', label: 'Otro' }]}
            />
            <Input label="N° Documento (opcional)" value={form.document} onChange={e => update('document', e.target.value)} />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Contacto</h4>
          <Input label="Teléfono principal *" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} required />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={e => update('whatsapp', e.target.value)} placeholder="Si es el mismo dejar vacío" />
            <Input label="Teléfono secundario" type="tel" value={form.phone_alt} onChange={e => update('phone_alt', e.target.value)} />
          </div>
          <Input label="Correo electrónico" type="email" value={form.email} onChange={e => update('email', e.target.value)} className="mt-3" />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Dirección</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Provincia" value={form.provincia} onChange={e => update('provincia', e.target.value)} />
            <Input label="Municipio" value={form.municipio} onChange={e => update('municipio', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="Sector" value={form.sector} onChange={e => update('sector', e.target.value)} />
            <Input label="Calle" value={form.calle} onChange={e => update('calle', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="N° Casa/Apto" value={form.numero} onChange={e => update('numero', e.target.value)} />
            <Input label="Punto de referencia" value={form.referencia} onChange={e => update('referencia', e.target.value)} placeholder="Casa azul frente al colmado..." />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.back()} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">{isEditing ? 'Guardar cambios' : 'Guardar'}</Button>
        </div>
      </form>
    </Card>
  )
}

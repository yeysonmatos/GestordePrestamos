'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency, getStatusLabel } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import ViewTabs from '@/components/ui/ViewTabs'
import { Alert } from '@/components/ui/Alert'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ArrowsClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import type { Client, Loan } from '@/types'

interface Props {
  clients: Client[]
  loans: Loan[]
  readOnly: boolean
}

export default function ClientsClient({ clients: initialClients, loans, readOnly }: Props) {
  const [clients] = useState(initialClients)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [planLimit, setPlanLimit] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

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
        if (price > 0) {
          setPlanLimit(Number((plan as { max_clients?: number } | undefined)?.max_clients || 0) || null)
        } else {
          setPlanLimit(null)
        }
      } catch {
        // Sin plan detectable → sin límite
      }
    })()
    return () => { active = false }
  }, [supabase])

  const limitReached = planLimit !== null && clients.length >= planLimit

  const loanCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of loans) {
      map[l.client_id] = (map[l.client_id] || 0) + 1
    }
    return map
  }, [loans])

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const q = search.toLowerCase()
      const matchesSearch = !search || 
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.document?.includes(q)
      const matchesFilter = filter === 'all' || c.status === filter
      return matchesSearch && matchesFilter
    })
  }, [clients, search, filter])

    const tabs = [
    { key: 'all' as const, label: 'Todos', count: clients.length },
    { key: 'active' as const, label: 'Activos', count: clients.filter(c => c.status === 'active').length },
    { key: 'inactive' as const, label: 'Inactivos', count: clients.filter(c => c.status === 'inactive').length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Gestiona tus clientes y su información"
        action={<div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center"><ArrowsClockwise className="h-4 w-4" /></Button>{!readOnly && (limitReached ? <Button disabled><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button> : <Link href="/clients/new"><Button><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button></Link>)}</div>}
      />

      {readOnly && (
        <Alert variant="warning" className="flex items-start gap-3 p-4 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
            <WarningCircle className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">Modo lectura</p>
            <p className="text-xs text-warning/80 mt-0.5">
              Tu período de prueba venció. Puedes ver tus clientes, pero no crear ni editar.
            </p>
          </div>
        </Alert>
      )}

      {planLimit !== null && clients.length >= planLimit && (
        <Alert variant="warning" className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            Has alcanzado el límite de <strong>{planLimit} clientes</strong> de tu plan actual. Mejora tu plan para añadir más.
          </div>
          <Link href="/account" className="inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-medium min-h-9 shrink-0">
            Ver planes
          </Link>
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, teléfono o documento..." className="flex-1" />
        <ViewTabs
          options={tabs}
          selected={filter}
          onSelect={v => setFilter(v as 'all' | 'active' | 'inactive')}
          ariaLabel="Filtrar clientes"
          className="w-full lg:w-auto"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'No hay clientes'}
          description={search ? 'Intenta con otros términos de búsqueda' : 'Agrega tu primer cliente para empezar.'}
          icon={<MagnifyingGlass size={24} weight="duotone" className="text-muted-foreground" />}
          action={!search && !readOnly ? (limitReached ? <Button disabled><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button> : <Link href="/clients/new"><Button><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button></Link>) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(client => {
            const activeLoans = loanCounts[client.id] || 0

            return (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                  {client.status !== 'active' && (
                    <span className="absolute top-3 right-3">
                      <Badge variant="cancelled">
                        {getStatusLabel(client.status)}
                      </Badge>
                    </span>
                  )}
                  <h3 className="font-semibold text-sm text-foreground truncate pr-14">{client.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {client.phone && <span>{client.phone}</span>}
                    {client.document && <span>{client.document}</span>}
                    <span>{activeLoans} préstamo{activeLoans !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                    <div>
                      Prestado: <span className="font-semibold text-foreground">{formatCurrency(client.total_borrowed)}</span>
                    </div>
                    <div>
                      Por cobrar: <span className="font-semibold text-foreground">{formatCurrency(client.balance)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import BottomSheet from '@/components/ui/BottomSheet'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { uploadFile, getFilePath } from '@/lib/storage'
import { FileText, Image as ImageIcon, Shield, Signature, UploadSimple, DownloadSimple, Trash } from '@phosphor-icons/react'
import type { Document, Client } from '@/types'

const typeIcons: Record<string, React.ReactNode> = {
  contract: <FileText className="h-5 w-5 text-primary" />,
  promissory: <Signature className="h-5 w-5 text-accent" />,
  guarantee: <Shield className="h-5 w-5 text-success" />,
  photo: <ImageIcon className="h-5 w-5 text-warning" />,
  note: <FileText className="h-5 w-5 text-muted-foreground" />,
}

interface Props {
  documents: Document[]
  clients: Client[]
}

export default function DocumentsContent({ documents: initialDocuments, clients }: Props) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'contract', notes: '', client_id: '' })
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const filtered = documents.filter(d => {
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || d.type === filter
    return matchesSearch && matchesFilter
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const filePath = getFilePath(user.id, 'documents', file.name)
    const publicUrl = await uploadFile('documents', filePath, file)
    if (!publicUrl) { setLoading(false); return }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        name: form.name || file.name,
        type: form.type,
        path: filePath,
        mime_type: file.type,
        size: file.size,
        notes: form.notes || null,
        client_id: form.client_id || null,
      })
      .select('*, client:clients(id, name)')
      .single()

    if (!error && data) {
      setDocuments(prev => [data, ...prev])
      setShowModal(false)
      setForm({ name: '', type: 'contract', notes: '', client_id: '' })
      setFile(null)
    }

    setLoading(false)
  }

  async function handleDownload(doc: Document) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.path, 60)
    if (data) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc: Document) {
    if (!confirm('¿Eliminar este documento?')) return

    await supabase.storage.from('documents').remove([doc.path])

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id)

    if (!error) {
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    }
  }

  const tabs = [
    { key: 'all', label: 'Todos', count: documents.length },
    { key: 'contract', label: 'Contratos', count: documents.filter(d => d.type === 'contract').length },
    { key: 'promissory', label: 'Pagarés', count: documents.filter(d => d.type === 'promissory').length },
    { key: 'photo', label: 'Fotos', count: documents.filter(d => d.type === 'photo').length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Almacena contratos, pagarés y fotos de tus clientes"
        action={
          <Button onClick={() => setShowModal(true)}>
            <UploadSimple className="h-4 w-4 mr-1" /> Subir documento
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar documentos..." className="flex-1" />
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-border'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No hay documentos"
          description="Sube tu primer documento para empezar."
          action={<Button onClick={() => setShowModal(true)}><UploadSimple className="h-4 w-4 mr-1" /> Subir documento</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="mt-1">{typeIcons[doc.type] || typeIcons.note}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground truncate">{doc.name}</h3>
                    <Badge variant="default">{doc.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.client?.name && `${doc.client.name} · `}
                    {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</p>
                </div>
              </div>
              <div className="flex gap-1 mt-3 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => handleDownload(doc)}>
                  <DownloadSimple className="h-4 w-4 mr-1" /> Descargar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)} className="text-destructive hover:text-destructive">
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BottomSheet open={showModal} onClose={() => setShowModal(false)} title="Subir documento">
        <form onSubmit={handleUpload} className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Dejar vacío para usar el nombre del archivo" />
          <Select label="Tipo" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            options={[
              { value: 'contract', label: 'Contrato' },
              { value: 'promissory', label: 'Pagaré' },
              { value: 'guarantee', label: 'Garantía' },
              { value: 'photo', label: 'Foto' },
              { value: 'note', label: 'Nota' },
            ]}
          />
          <Select label="Cliente" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
            options={[
              { value: '', label: 'Sin cliente' },
              ...clients.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Archivo</label>
            <input
              type="file"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-light file:text-primary hover:file:bg-primary-light"
              required
            />
          </div>
          <Input label="Notas" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={loading} className="flex-1">Subir</Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  )
}

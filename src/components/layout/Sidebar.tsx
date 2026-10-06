'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import {
  Layout, Users, Handshake, HandCoins,
  Calendar, ChartBar, FileText, Gear, SignOut,
  List, X,
} from '@phosphor-icons/react'
import { useState } from 'react'

const HIDDEN_ITEMS = ['/documents']

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layout },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/loans', label: 'Préstamos', icon: Handshake },
  { href: '/collections', label: 'Cobros', icon: HandCoins },
  { href: '/calendar', label: 'Calendario', icon: Calendar },
  { href: '/reports', label: 'Reportes', icon: ChartBar },
  { href: '/documents', label: 'Documentos', icon: FileText },
  { href: '/settings', label: 'Configuración', icon: Gear },
].filter(item => !HIDDEN_ITEMS.includes(item.href))

export default function Sidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActivePath(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href + '/') || pathname === href
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-border">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <img src="/gp-icon.png" alt="GP" className="w-9 h-9 rounded-xl shrink-0 object-cover" />
          <span className="font-semibold text-foreground text-lg tracking-tight">Gestor de Prestamos</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menuItems.map(item => {
          const isActive = isActivePath(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative min-h-11',
                isActive
                  ? 'text-primary bg-primary/10 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary shadow-sm shadow-primary/50" />
              )}
              <Icon
                className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/50')}
                weight={isActive ? 'fill' : 'regular'}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full min-h-11 mt-0.5"
        >
          <SignOut className="h-5 w-5 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-border px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/gp-icon.png" alt="GP" className="w-8 h-8 rounded-lg shrink-0 object-cover" />
          <span className="font-semibold text-foreground">Gestor de Prestamos</span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          {mobileOpen ? <X className="h-6 w-6" /> : <List className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 w-72 shadow-2xl transform transition-transform duration-300 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-30">
        {sidebarContent}
      </aside>
    </>
  )
}

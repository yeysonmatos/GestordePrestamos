'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export default function BottomSheet({ open, onClose, title, children, className }: Props) {
  const [translateY, setTranslateY] = useState(0)
  const [closing, setClosing] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      setTranslateY(0)
      setClosing(false)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const closeRef = useRef<() => void>(() => {})
  useEffect(() => { closeRef.current = close })

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current()
    }
    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  function close() {
    setClosing(true)
    setTranslateY(300)
    setTimeout(() => onClose(), 250)
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.currentTarget.scrollTop > 0) return
    startY.current = e.touches[0].clientY
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.currentTarget.scrollTop > 0) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) setTranslateY(diff)
  }

  function handleTouchEnd() {
    if (translateY > 120) {
      close()
    } else {
      setTranslateY(0)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" onClick={close}>
      <div className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`} />
      <div
        ref={sheetRef}
        style={{ transform: `translateY(${translateY}px)` }}
        className={`fixed bottom-0 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-full sm:max-w-lg bg-card rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${closing ? 'translate-y-full' : ''} ${className || ''}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button onClick={close} className="text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center -mr-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}

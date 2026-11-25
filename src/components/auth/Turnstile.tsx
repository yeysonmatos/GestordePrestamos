'use client'

import { useEffect, useRef } from 'react'

// CAPTCHA de Cloudflare Turnstile para registro, inicio de sesión y
// recuperación de contraseña. El token se envía a Supabase Auth
// (options.captchaToken), que lo valida con la clave secreta configurada en
// el panel de Supabase (Authentication → Attack Protection).
//
// Si NEXT_PUBLIC_TURNSTILE_SITE_KEY no está definida, el widget no se muestra
// y los formularios funcionan como antes (CAPTCHA desactivado).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export const captchaEnabled = SITE_KEY !== ''

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('No se pudo cargar la verificación de seguridad'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

interface Props {
  /** Recibe el token cuando el usuario pasa la verificación, o null si vence o falla. */
  onToken: (token: string | null) => void
}

/** Cambia su `key` para obtener un token nuevo (cada token sirve una sola vez). */
export default function Turnstile({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => { onTokenRef.current = onToken })

  useEffect(() => {
    if (!captchaEnabled) return
    let widgetId: string | undefined
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          language: 'es',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [])

  if (!captchaEnabled) return null
  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />
}

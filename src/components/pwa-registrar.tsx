'use client'

import { useEffect } from 'react'
import { captureInstallPrompt, confirmInstall } from '@/lib/pwa-install'

export function PwaRegistrar() {
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', confirmInstall)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerServiceWorker = async () => {
        try {
          await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          })
        } catch (error) {
          console.error('Service Worker registration failed:', error)
        }
      }

      registerServiceWorker()
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', confirmInstall)
    }
  }, [])

  return null
}

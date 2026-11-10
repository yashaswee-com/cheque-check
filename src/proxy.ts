import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js
     * - offline.html and offline.js (generic, precached fallback assets)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!monitoring(?:/|$)|_next/static|_next/image|favicon.ico|sw\\.js|offline\\.(?:html|js)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
}

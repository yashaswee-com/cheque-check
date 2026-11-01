import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env/client'
import type { Database } from '@/types/database.types'
import { isPublicApiPath, isPublicPagePath } from './public-routes'

export async function updateSession(request: NextRequest) {
  const isPublicPage = isPublicPagePath(request.nextUrl.pathname)
  const isPublicRequest =
    isPublicPage || isPublicApiPath(request.nextUrl.pathname)
  const requestHeaders = new Headers(request.headers)
  if (isPublicPage) requestHeaders.set('x-public-site', 'true')
  else requestHeaders.delete('x-public-site')

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          requestHeaders.set('cookie', request.cookies.toString())
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !isPublicRequest &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/forgot-password') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    // Phone OTP routes serve signed-out login/signup and enforce auth themselves for linking.
    !request.nextUrl.pathname.startsWith('/api/auth/phone/')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    )
    return NextResponse.redirect(url)
  }

  // Authenticated users should continue in the dashboard instead of auth pages.
  if (
    user &&
    (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/signup') ||
      request.nextUrl.pathname.startsWith('/forgot-password'))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

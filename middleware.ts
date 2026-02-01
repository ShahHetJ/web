import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient }     from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Route-level guards
//   /cart, /checkout, /orders  →  must be authenticated
//   /admin/*                   →  must be authenticated AND role === 'admin'
//   /auth/login, /auth/signup  →  redirect away if already authenticated
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_REQUIRED  = ['/cart', '/checkout', '/orders']
const AUTH_EXCLUDED  = ['/auth/login', '/auth/signup']

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Wire up cookie forwarding so the Supabase session survives across requests
  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      cookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Record<string, unknown>)
      })
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // ── 1. Pages that need a logged-in user ──────────────────────────────────
  if (AUTH_REQUIRED.some((p) => pathname.startsWith(p)) && !user) {
    const url = new URL('/auth/login', request.url)
    url.searchParams.set('next', pathname)          // remember where they were
    return NextResponse.redirect(url)
  }

  // ── 2. Admin panel  ───────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Fetch the role from the profiles table (one extra query, cached by Supabase)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      // Not an admin → silently send back to storefront
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // ── 3. Auth pages  ────────────────────────────────────────────────────────
  if (AUTH_EXCLUDED.includes(pathname) && user) {
    // Already logged in — nothing to do on auth pages
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

// Match everything except static assets / Next internals
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)',
  ],
}

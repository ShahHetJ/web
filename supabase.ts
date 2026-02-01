'use client'
// ─────────────────────────────────────────────────────────────────────────────
// src/lib/supabase.ts
//
// Two factory functions.  Neither one ever touches a service_role key.
// Both read NEXT_PUBLIC_ env vars that are inlined at build time.
// ─────────────────────────────────────────────────────────────────────────────
import { createBrowserClient, createServerClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// ── Browser client ──────────────────────────────────────────────────────────
// Call once per component tree (or use a singleton via context).
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── Server client ───────────────────────────────────────────────────────────
// Requires a cookie-store adapter so the session cookie travels with every
// Server Component / Route Handler request.
//
// Usage:
//   import { cookies } from 'next/headers'
//   const cookieStore = await cookies()
//   const supabase   = createSupabaseServerClient(cookieStore)
//
export function createSupabaseServerClient(cookieStore: {
  getAll: () => { name: string; value: string }[]
  setAll: (
    cookies: { name: string; value: string; options: Record<string, unknown> }[]
  ) => void
}) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookieStore.setAll(cookiesToSet)
        },
      },
    }
  )
}

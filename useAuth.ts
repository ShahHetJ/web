'use client'
// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useAuth.ts
//
// Thin wrapper around Supabase Auth.
// • Subscribes to onAuthStateChange so the component tree stays in sync.
// • Returns helpers that every auth form needs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient }  from '@/lib/supabase'
import type { User }                    from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser]     = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Keep a stable reference so we never re-create the client
  const supabaseRef = useRef(createSupabaseBrowserClient())

  useEffect(() => {
    const supabase = supabaseRef.current

    // 1. Fetch current session (handles page refresh)
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u)
      setLoading(false)
    })

    // 2. Live subscription — fires on login, logout, token refresh …
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────
  const signUp = async (email: string, password: string, fullName: string) => {
    return supabaseRef.current.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },  // stored in raw_user_meta_data → picked up by trigger
      },
    })
  }

  const signIn = async (email: string, password: string) => {
    return supabaseRef.current.auth.signInWithPassword({ email, password })
  }

  const signOut = async () => {
    return supabaseRef.current.auth.signOut()
  }

  return { user, loading, signUp, signIn, signOut }
}

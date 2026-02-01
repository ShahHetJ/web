import { NextResponse }                from 'next/server'
import { cookies }                     from 'next/headers'
import { createSupabaseServerClient }  from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/checkout/validate
//
// Body:  { items: [{ product_id: string, quantity: number }, …] }
//
// On success  →  200  { valid: true, serverTotal: number }
// On failure  →  4xx  { error: string }
//
// Security:
//   • Requires an active Supabase session (401 otherwise).
//   • Prices are read from the DB — the client can never inflate them.
//   • Stock is checked row-by-row; first conflict returns 409.
// ─────────────────────────────────────────────────────────────────────────────

interface CartItemPayload {
  product_id: string
  quantity:   number
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = createSupabaseServerClient(cookieStore)

    // ── Auth check ──────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      )
    }

    // ── Parse + basic shape validation ──────────────────────────────────
    const body: { items?: CartItemPayload[] } = await request.json()

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty.' },
        { status: 400 }
      )
    }

    // ── Per-item validation loop ────────────────────────────────────────
    let serverTotal = 0

    for (const item of body.items) {
      // Sanity-check each entry
      if (
        !item.product_id ||
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return NextResponse.json(
          { error: 'Invalid item in cart.' },
          { status: 400 }
        )
      }

      // Fetch product from DB (never trust client-supplied price)
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, stock')
        .eq('id', item.product_id)
        .single()

      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${item.product_id}` },
          { status: 404 }
        )
      }

      // Stock check
      if (product.stock < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`,
          },
          { status: 409 }
        )
      }

      // Accumulate using the server's price
      serverTotal += Number(product.price) * item.quantity
    }

    // Round to 2 decimal places (avoid floating-point drift)
    serverTotal = Math.round(serverTotal * 100) / 100

    return NextResponse.json({ valid: true, serverTotal })
  } catch (err) {
    console.error('[/api/checkout/validate]', err)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
